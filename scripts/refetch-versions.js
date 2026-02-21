/**
 * 從 SCC Toys 重新抓取版本資訊
 *
 * 找出資料庫中同名但缺版本的公仔 → 搜尋 SCC → 進入詳情頁抓版本+價格 → 更新資料庫
 *
 * 使用方式：
 *   node scripts/refetch-versions.js              # 執行
 *   node scripts/refetch-versions.js --dry-run     # 預覽不修改
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const DRY_RUN = process.argv.includes('--dry-run');
const PROGRESS_FILE = path.join(__dirname, '../refetch-versions-progress.json');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanName(s) {
  return s.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').toLowerCase();
}

function nameMatchScore(a, b) {
  if (!a || !b) return 0;
  const ca = cleanName(a), cb = cleanName(b);
  if (ca === cb) return 1.0;
  if (ca.includes(cb) || cb.includes(ca)) return 0.8;
  let f = 0, r = 0;
  for (const c of ca) { if (cb.includes(c)) f++; }
  for (const c of cb) { if (ca.includes(c)) r++; }
  return ((ca.length > 0 ? f / ca.length : 0) + (cb.length > 0 ? r / cb.length : 0)) / 2;
}

async function getAllFigures() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('figures')
      .select('id, name, version, scale, original_price, manufacturer')
      .order('name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

// 從 SCC 詳情頁提取版本和價格
async function scrapeVersionsFromDetail(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1000);

    const result = await page.evaluate(() => {
      const pageText = document.body.innerText || '';
      const versionPrices = [];
      let match;

      // 格式1：「大師版－全款16230」
      const p1 = /([\w\u4e00-\u9fff+（）()]+?)[－\-–—／/](?:原價[－\-–—])?全款\s*([\d,]+)/g;
      while ((match = p1.exec(pageText)) !== null) {
        const ver = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ''));
        if (price > 0 && ver.length <= 30 && !versionPrices.find(v => v.version === ver)) {
          versionPrices.push({ version: ver, price });
        }
      }

      // 格式2：已知版本關鍵字
      if (versionPrices.length === 0) {
        const knownPatterns = [
          /(普通版|標準版|限定版|豪華版|DX版|EX版|SP版|[A-D]版|黑色版|白色版|透明版|特典版|大師版|精裝版|典藏版|特裝版|基礎版|進階版|高配|低配|頂配|簡配)[^\d]*全款[：:\s]*(?:NT\$?|＄)?[\s]*([\d,]+)/gi,
          /(普通版|標準版|限定版|豪華版|DX版|EX版|SP版|[A-D]版|黑色版|白色版|透明版|特典版|大師版|精裝版|典藏版|特裝版|基礎版|進階版|高配|低配|頂配|簡配)[^\d]*(?:NT\$?|＄)[\s]*([\d,]+)/gi,
        ];
        for (const pattern of knownPatterns) {
          while ((match = pattern.exec(pageText)) !== null) {
            const ver = match[1].trim();
            const price = parseInt(match[2].replace(/,/g, ''));
            if (price > 0 && !versionPrices.find(v => v.version === ver)) {
              versionPrices.push({ version: ver, price });
            }
          }
        }
      }

      // 格式3：更寬鬆 - 找所有「XXX全款YYYY」模式
      if (versionPrices.length === 0) {
        const p3 = /([^\n,、]{2,15}?)[－\-–—／/\s]全款\s*([\d,]+)/g;
        while ((match = p3.exec(pageText)) !== null) {
          const ver = match[1].trim().replace(/^[：:\s]+/, '');
          const price = parseInt(match[2].replace(/,/g, ''));
          if (price > 0 && ver.length >= 2 && ver.length <= 20 && !versionPrices.find(v => v.version === ver)) {
            // 過濾掉純數字或無意義的匹配
            if (!/^\d+$/.test(ver) && !ver.includes('訂金') && !ver.includes('尾款')) {
              versionPrices.push({ version: ver, price });
            }
          }
        }
      }

      return versionPrices;
    });

    return result;
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log('🔍 從 SCC Toys 重新抓取版本資訊');
  console.log(DRY_RUN ? '👀 預覽模式' : '🔧 執行模式');
  console.log('');

  const all = await getAllFigures();
  console.log(`📊 資料庫共 ${all.length} 筆\n`);

  // 找出需要處理的：同名多筆但有無版本的混合
  const nameMap = {};
  for (const f of all) {
    if (!nameMap[f.name]) nameMap[f.name] = [];
    nameMap[f.name].push(f);
  }

  // 收集需要重新抓版本的公仔名稱
  const toProcess = []; // { name, manufacturer, items: [...] }

  for (const [name, items] of Object.entries(nameMap)) {
    if (items.length <= 1) continue;
    const noVer = items.filter(i => !i.version);
    if (noVer.length === 0) continue; // 全部都有版本，跳過

    toProcess.push({
      name,
      manufacturer: items[0].manufacturer,
      items, // 所有同名條目
      noVerCount: noVer.length,
    });
  }

  console.log(`📋 找到 ${toProcess.length} 個公仔名稱需要重新抓取版本（共 ${toProcess.reduce((s, p) => s + p.noVerCount, 0)} 筆無版本）\n`);

  if (toProcess.length === 0) {
    console.log('✅ 沒有需要處理的！');
    return;
  }

  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let updated = 0;
  let deleted = 0;
  let notFound = 0;
  let noVersions = 0;

  try {
    for (let idx = 0; idx < toProcess.length; idx++) {
      const { name, manufacturer, items } = toProcess[idx];
      const noVer = items.filter(i => !i.version);

      // 搜尋 SCC
      let searchQuery = name;
      if (searchQuery.length > 25) searchQuery = searchQuery.substring(0, 25);
      searchQuery = searchQuery.replace(/[「」『』【】《》（）()\[\]{}]/g, ' ').trim();

      const searchUrl = `https://www.scctoys.com.tw/products?query=${encodeURIComponent(searchQuery)}`;

      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(800);

        // 找搜尋結果中最匹配的商品連結
        const searchResults = await page.evaluate(() => {
          const items = [];
          document.querySelectorAll('.product-item a[href*="product"], .product-card a[href*="product"]').forEach(a => {
            const nameEl = a.closest('.product-item, .product-card')?.querySelector('h3, h4, [class*="title"], [class*="name"]');
            if (nameEl) {
              items.push({ name: nameEl.textContent.trim(), link: a.href });
            }
          });
          return items;
        });

        if (searchResults.length === 0) {
          if (idx < 20 || idx % 50 === 0) console.log(`[${idx + 1}/${toProcess.length}] ${name.slice(0, 35)}... ❌ SCC 搜尋無結果`);
          notFound++;
          continue;
        }

        // 找最匹配的
        let bestScore = 0;
        let bestLink = '';
        for (const r of searchResults) {
          const score = nameMatchScore(name, r.name);
          if (score > bestScore) {
            bestScore = score;
            bestLink = r.link;
          }
        }

        if (bestScore < 0.4 || !bestLink) {
          if (idx < 20 || idx % 50 === 0) console.log(`[${idx + 1}/${toProcess.length}] ${name.slice(0, 35)}... ⚠️ 匹配度 ${(bestScore * 100).toFixed(0)}% 太低`);
          notFound++;
          continue;
        }

        // 進入詳情頁抓版本
        const versions = await scrapeVersionsFromDetail(page, bestLink);

        if (versions.length === 0) {
          if (idx < 20 || idx % 50 === 0) console.log(`[${idx + 1}/${toProcess.length}] ${name.slice(0, 35)}... 📝 詳情頁無版本資訊`);
          noVersions++;
          continue;
        }

        // 用價格匹配版本
        let matchCount = 0;
        for (const item of noVer) {
          if (!item.original_price) continue;

          // 找價格最接近的版本
          let bestMatch = null;
          let bestDiff = Infinity;
          for (const v of versions) {
            const diff = Math.abs(v.price - item.original_price);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestMatch = v;
            }
          }

          // 價格差距在 5% 以內才匹配
          if (bestMatch && bestDiff / item.original_price < 0.05) {
            // 檢查是否已有同版本的條目
            const existingSameVer = items.find(i => i.version === bestMatch.version && i.id !== item.id);
            if (existingSameVer) {
              // 已有同版本 → 這是真正重複，刪除
              if (!DRY_RUN) {
                await supabase.from('figures').delete().eq('id', item.id);
              }
              deleted++;
            } else {
              // 更新版本
              if (!DRY_RUN) {
                await supabase.from('figures').update({ version: bestMatch.version }).eq('id', item.id);
              }
              updated++;
              matchCount++;
            }
          }
        }

        const verList = versions.map(v => `${v.version}=$${v.price}`).join(', ');
        if (idx < 30 || idx % 20 === 0) {
          console.log(`[${idx + 1}/${toProcess.length}] ${name.slice(0, 30)}... ✅ SCC 版本: ${verList} → 匹配 ${matchCount} 筆`);
        }

      } catch (err) {
        if (idx < 20 || idx % 50 === 0) console.log(`[${idx + 1}/${toProcess.length}] ${name.slice(0, 35)}... 💥 ${err.message.slice(0, 40)}`);
      }

      // 進度
      if ((idx + 1) % 50 === 0 || idx + 1 === toProcess.length) {
        console.log(`\n--- 進度: ${idx + 1}/${toProcess.length} | ✅更新${updated} 🗑️刪除${deleted} ❌未找到${notFound} 📝無版本${noVersions} ---\n`);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          processed: idx + 1, total: toProcess.length,
          updated, deleted, notFound, noVersions,
          timestamp: new Date().toISOString(),
        }, null, 2));
      }

      await sleep(500);
    }
  } finally {
    await browser.close();
  }

  console.log('\n📊 結果:');
  console.log(`  ✅ 更新版本: ${updated}`);
  console.log(`  🗑️ 刪除重複: ${deleted}`);
  console.log(`  ❌ SCC 找不到: ${notFound}`);
  console.log(`  📝 詳情頁無版本: ${noVersions}`);
}

main().catch(console.error);
