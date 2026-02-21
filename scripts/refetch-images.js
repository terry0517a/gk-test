/**
 * 從 SCC Toys 搜尋結果頁面抓取公仔圖片
 *
 * 策略：用「工作室 + 公仔名稱」搜尋 SCC Toys → 滾動觸發 lazy loading →
 *       從搜尋結果的 srcset 取得圖片 → 比對商品名稱確認匹配
 *
 * 使用方式：
 *   node scripts/refetch-images.js [--batch 500] [--offset 0] [--dry-run] [--all]
 *
 *   --all     處理所有公仔（包含已有圖片的，會覆蓋）
 *   --batch   每批數量（預設 500）
 *   --offset  起始位置（預設 0）
 *   --dry-run 測試模式，不實際更新
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? parseInt(args[idx + 1]) || defaultVal : defaultVal;
};
const BATCH_SIZE = getArg('batch', 500);
const START_OFFSET = getArg('offset', 0);
const DRY_RUN = args.includes('--dry-run');
const ALL_MODE = args.includes('--all');
const PROGRESS_FILE = path.join(__dirname, '../refetch-progress.json');

const usedImages = new Set();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 名稱清理
function cleanName(s) {
  return s.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').toLowerCase();
}

// 名稱匹配度（雙向字元匹配）
function nameMatchScore(figureName, productTitle) {
  if (!productTitle) return 0;
  const a = cleanName(figureName);
  const b = cleanName(productTitle);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) {
    return 0.7 + (Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 0.3;
  }
  let forward = 0, backward = 0;
  for (const c of a) { if (b.includes(c)) forward++; }
  for (const c of b) { if (a.includes(c)) backward++; }
  return ((a.length > 0 ? forward / a.length : 0) + (b.length > 0 ? backward / b.length : 0)) / 2;
}

// 從 srcset 提取最佳圖片 URL
function extractBestUrl(srcset) {
  if (!srcset) return '';
  const parts = srcset.split(',').map(s => s.trim());
  let bestUrl = '';
  let bestWidth = 0;
  for (const part of parts) {
    const match = part.match(/^(\S+)\s+(\d+)w$/);
    if (match) {
      const width = parseInt(match[2]);
      if (width > bestWidth) {
        bestWidth = width;
        bestUrl = match[1];
      }
    }
  }
  return bestUrl || (parts[0] || '').split(/\s/)[0] || '';
}

// 建立搜尋關鍵字：工作室 + 公仔名稱
function buildSearchQuery(name, manufacturer) {
  let query = '';
  if (manufacturer) {
    query = manufacturer + ' ' + name;
  } else {
    query = name;
  }
  // 移除括號等符號
  query = query.replace(/[「」『』【】《》（）()\[\]{}]/g, ' ').trim();
  // SCC Toys 搜尋太長會找不到，限制長度
  if (query.length > 30) query = query.substring(0, 30);
  return query;
}

async function main() {
  console.log('🖼️ SCC Toys 搜尋抓取公仔圖片（工作室+名稱）');
  console.log(`設定: batch=${BATCH_SIZE}, offset=${START_OFFSET}${DRY_RUN ? ' (DRY RUN)' : ''}${ALL_MODE ? ' (ALL - 覆蓋現有)' : ''}`);

  // 取得公仔列表（分頁讀取）
  let figures = [];
  let dbOffset = START_OFFSET;
  let totalCount = 0;

  while (figures.length < BATCH_SIZE) {
    let query = supabase
      .from('figures')
      .select('id, name, manufacturer, image_url', { count: 'exact' })
      .order('name')
      .range(dbOffset, dbOffset + 999);

    if (!ALL_MODE) {
      query = query.is('image_url', null);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('Database error:', error.message);
      process.exit(1);
    }
    totalCount = count;
    if (!data || data.length === 0) break;
    figures = figures.concat(data);
    if (data.length < 1000) break;
    dbOffset += 1000;
  }
  figures = figures.slice(0, BATCH_SIZE);

  console.log(`找到 ${totalCount} 個公仔，本次處理 ${figures.length} 個\n`);

  // 載入已有圖片和名稱+工作室（防不同工作室共用圖片）
  const all = []; // 所有有圖片的公仔（用於比對）
  let offset = 0;
  while (true) {
    const { data: existing } = await supabase
      .from('figures')
      .select('name, manufacturer, image_url')
      .not('image_url', 'is', null)
      .range(offset, offset + 999);
    if (!existing || existing.length === 0) break;
    existing.forEach(f => {
      usedImages.add(f.image_url);
      all.push(f);
    });
    offset += 1000;
  }
  console.log(`已有 ${usedImages.size} 張圖片在使用中\n`);

  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let success = 0;
  let notFound = 0;
  let mismatch = 0;
  let duplicate = 0;
  let noImage = 0;
  let kept = 0;
  let errors = 0;

  try {
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      const idx = i + 1;

      // 保留 admin 上傳的圖片
      if (ALL_MODE && fig.image_url && fig.image_url.includes('supabase.co')) {
        kept++;
        continue;
      }

      const searchQuery = buildSearchQuery(fig.name, fig.manufacturer);

      try {
        const searchUrl = `https://www.scctoys.com.tw/products?query=${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1000);

        // 滾動頁面觸發 lazy loading
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
        await sleep(800);

        // 從搜尋結果提取商品卡片（只取第一張圖，避免 hover 圖）
        const results = await page.evaluate(() => {
          const items = [];
          const productImgs = document.querySelectorAll('.product-item .boxify-image:not(.second-image) img');

          productImgs.forEach(img => {
            const alt = img.alt || '';
            const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
            const currentSrc = img.currentSrc || '';

            if (alt && alt.length > 2 && (srcset || currentSrc)) {
              items.push({ name: alt, srcset, currentSrc });
            }
          });

          return items;
        });

        if (results.length === 0) {
          if (idx <= 20 || idx % 50 === 0)
            process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ❌ 無結果\n`);
          notFound++;
          continue;
        }

        // 找最佳匹配的商品
        let bestScore = 0;
        let bestResult = null;

        for (const r of results) {
          const score = nameMatchScore(fig.name, r.name);
          if (score > bestScore) {
            bestScore = score;
            bestResult = r;
          }
        }

        if (!bestResult || bestScore < 0.5) {
          if (idx <= 20 || idx % 50 === 0)
            process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ⚠️ ${(bestScore * 100).toFixed(0)}% 不匹配\n`);
          mismatch++;
          continue;
        }

        // 取得圖片 URL（從 srcset 選最高解析度）
        let imageUrl = extractBestUrl(bestResult.srcset) || bestResult.currentSrc;
        if (!imageUrl) {
          noImage++;
          continue;
        }

        // 過濾佔位圖
        const badIds = ['6507db252d6cbb001a7fd12d', '6527981f1c9e590020ad939f', '6502c54c5db3440020cf4cb6', 'placeholder', 'logo'];
        if (badIds.some(id => imageUrl.includes(id))) {
          noImage++;
          continue;
        }

        // 重複檢查 — 同名+同工作室允許共用，不同工作室不共用
        if (usedImages.has(imageUrl)) {
          const existingFig = all.find(f => f.image_url === imageUrl);
          const sameName = existingFig && existingFig.name === fig.name;
          const sameMfg = !fig.manufacturer || !existingFig?.manufacturer || existingFig.manufacturer === fig.manufacturer;
          if (!sameName || !sameMfg) {
            duplicate++;
            continue;
          }
        }

        // 更新資料庫
        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('figures')
            .update({ image_url: imageUrl })
            .eq('id', fig.id);

          if (updateError) {
            errors++;
            continue;
          }
        }

        usedImages.add(imageUrl);
        success++;
        if (idx <= 20 || idx % 20 === 0)
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ✅ ${(bestScore * 100).toFixed(0)}% "${bestResult.name.slice(0, 30)}"\n`);

      } catch (err) {
        errors++;
        if (idx <= 10 || idx % 50 === 0)
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... 💥 ${err.message.slice(0, 40)}\n`);
      }

      // 進度報告
      if (idx % 100 === 0 || idx === figures.length) {
        console.log(`\n--- 進度: ${idx}/${figures.length} | ✅${success} ❌${notFound} ⚠️${mismatch} 🔄${duplicate} 📷${noImage} 🔒${kept} 💥${errors} ---\n`);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          total: totalCount, processed: START_OFFSET + idx,
          success, notFound, mismatch, duplicate, noImage, kept, errors,
          nextOffset: START_OFFSET + idx,
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n📊 結果統計:`);
  console.log(`  ✅ 成功: ${success}`);
  console.log(`  ❌ 未找到: ${notFound}`);
  console.log(`  ⚠️ 不匹配: ${mismatch}`);
  console.log(`  🔄 重複跳過: ${duplicate}`);
  console.log(`  📷 無圖片: ${noImage}`);
  console.log(`  🔒 保留 admin: ${kept}`);
  console.log(`  💥 錯誤: ${errors}`);
  console.log(`  成功率: ${((success / figures.length) * 100).toFixed(1)}%`);

  if (START_OFFSET + BATCH_SIZE < totalCount) {
    console.log(`\n💡 下一批: node scripts/refetch-images.js --offset ${START_OFFSET + BATCH_SIZE}${ALL_MODE ? ' --all' : ''}`);
  }
}

main().catch(console.error);
