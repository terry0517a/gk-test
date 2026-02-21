/**
 * 從 SCC Toys 詳情頁修正公仔價格（全款）和圖片
 *
 * 策略：用「工作室 + 公仔名稱」搜尋 SCC Toys → 找到匹配商品 →
 *       進入詳情頁 → 抓取全款價格和高品質圖片 → 更新資料庫
 *
 * 使用方式：
 *   node scripts/ch-prices.js [--batch 200] [--offset 0] [--dry-run] [--all] [--fix-images]
 *
 *   --all         處理所有公仔（包含已有正確價格的）
 *   --fix-images  同時修正缺少圖片的公仔
 *   --batch       每批數量（預設 200，因為要進詳情頁所以比較慢）
 *   --offset      起始位置（預設 0）
 *   --dry-run     測試模式，不實際更新
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
const BATCH_SIZE = getArg('batch', 200);
const START_OFFSET = getArg('offset', 0);
const DRY_RUN = args.includes('--dry-run');
const ALL_MODE = args.includes('--all');
const FIX_IMAGES = args.includes('--fix-images');
const PROGRESS_FILE = path.join(__dirname, '../ch-prices-progress.json');

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

// 建立搜尋關鍵字
function buildSearchQuery(name, manufacturer) {
  let query = '';
  if (manufacturer) {
    query = manufacturer + ' ' + name;
  } else {
    query = name;
  }
  query = query.replace(/[「」『』【】《》（）()\[\]{}]/g, ' ').trim();
  if (query.length > 30) query = query.substring(0, 30);
  return query;
}

// 從詳情頁解析全款價格、版本、圖片
async function scrapeProductDetail(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(500);

    const detail = await page.evaluate(() => {
      const descText = document.body.innerText || document.body.textContent;

      // 製作團隊
      const mfgMatch = descText.match(/製作團隊[：:]\s*(\S+)/);
      const manufacturer = mfgMatch ? mfgMatch[1] : '';

      // 版本和全款價格
      // 使用 innerText 取得更乾淨的文字（保留換行）
      const pageText = document.body.innerText || descText;

      const versionPrices = [];
      let match;

      // 格式1：「大師版－全款16230、訂金6490」或「D版／原價—全款6420、訂金3500」
      const versionPattern = /([\w\u4e00-\u9fff+（）()]+?)[－\-–—／/](?:原價[－\-–—])?全款\s*([\d,]+)/g;
      while ((match = versionPattern.exec(pageText)) !== null) {
        const version = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ''));
        // 過濾掉太短或不像版本名的（如「付款方式 :」）
        if (price > 0 && version.length <= 30 && !versionPrices.find(v => v.version === version)) {
          versionPrices.push({ version, price });
        }
      }

      // 格式2：如果沒找到版本格式，找獨立的「全款YYYY」
      if (versionPrices.length === 0) {
        const simplePattern = /(?:原價|售價|建議售價)?[－\-–—：:]*全款\s*([\d,]+)/g;
        while ((match = simplePattern.exec(pageText)) !== null) {
          const price = parseInt(match[1].replace(/,/g, ''));
          if (price > 0 && !versionPrices.find(v => v.price === price)) {
            versionPrices.push({ version: null, price });
          }
        }
      }

      // 比例
      const scaleMatch = descText.match(/規格尺寸[：:]\s*(1[/:](?:\d+))/);
      const scale = scaleMatch ? scaleMatch[1].replace(':', '/') : null;

      // 高品質圖片
      let detailImage = '';
      const galleryImg = document.querySelector(
        '.product-gallery img, .product-image img, .slick-slide img, ' +
        '[class*="gallery"] img, [class*="Gallery"] img, ' +
        '[class*="product-photo"] img, [class*="ProductPhoto"] img, ' +
        '.boxify-image img'
      );
      if (galleryImg) {
        const srcset = galleryImg.getAttribute('srcset') || galleryImg.getAttribute('data-srcset') || '';
        if (srcset) {
          const parts = srcset.split(',').map(s => s.trim());
          let bestUrl = '';
          let bestWidth = 0;
          for (const part of parts) {
            const m = part.match(/^(\S+)\s+(\d+)w$/);
            if (m) {
              const w = parseInt(m[2]);
              if (w > bestWidth) { bestWidth = w; bestUrl = m[1]; }
            }
          }
          if (bestUrl) detailImage = bestUrl;
        }
        if (!detailImage) {
          detailImage = galleryImg.dataset.src || galleryImg.dataset.original ||
                        galleryImg.dataset.lazy || galleryImg.currentSrc || galleryImg.src || '';
        }
      }
      if (detailImage && (detailImage.includes('placeholder') || detailImage.includes('loading') ||
          detailImage.includes('blank') || detailImage.includes('data:image'))) {
        detailImage = '';
      }
      if (detailImage && !detailImage.startsWith('http')) {
        detailImage = detailImage.startsWith('//') ? 'https:' + detailImage : 'https://www.scctoys.com.tw' + detailImage;
      }

      return { manufacturer, versionPrices, scale, detailImage };
    });

    return detail;
  } catch (err) {
    return { manufacturer: '', versionPrices: [], scale: null, detailImage: '' };
  }
}

async function main() {
  console.log('💰 SCC Toys 詳情頁修正公仔資料（價格+圖片+工作室）');
  console.log(`設定: batch=${BATCH_SIZE}, offset=${START_OFFSET}${DRY_RUN ? ' (DRY RUN)' : ''}${ALL_MODE ? ' (ALL - 覆蓋更新)' : ''}`);

  // 取得公仔列表
  let figures = [];
  let dbOffset = START_OFFSET;
  let totalCount = 0;

  while (figures.length < BATCH_SIZE) {
    let query = supabase
      .from('figures')
      .select('id, name, manufacturer, image_url, original_price, version, scale', { count: 'exact' })
      .order('name')
      .range(dbOffset, dbOffset + 999);

    if (!ALL_MODE) {
      // 只處理沒有價格的公仔
      query = query.is('original_price', null);
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

  // 不再需要載入已有圖片防重複，ALL 模式直接覆蓋

  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let priceFixed = 0;
  let imageFixed = 0;
  let notFound = 0;
  let mismatch = 0;
  let noPrice = 0;
  let skipped = 0;
  let errors = 0;

  try {
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      const idx = i + 1;

      // 跳過 admin 上傳的圖片（supabase storage）
      if (fig.image_url && fig.image_url.includes('supabase.co')) {
        // 但如果沒有價格，還是要處理
        if (fig.original_price && !ALL_MODE) {
          skipped++;
          continue;
        }
      }

      const searchQuery = buildSearchQuery(fig.name, fig.manufacturer);

      try {
        // 第一步：搜尋 SCC Toys
        const searchUrl = `https://www.scctoys.com.tw/products?query=${encodeURIComponent(searchQuery)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1000);

        // 滾動觸發 lazy loading
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
            setTimeout(() => { clearInterval(timer); resolve(); }, 3000);
          });
        });
        await sleep(800);

        // 取得搜尋結果（名稱 + 連結）
        const results = await page.evaluate(() => {
          const items = [];
          const productElements = document.querySelectorAll('.product-item, .product-card, [class*="ProductCard"], [class*="product-list"] > div');
          productElements.forEach(el => {
            const nameEl = el.querySelector('h3, h4, .product-name, .product-title, [class*="title"], [class*="name"]');
            const name = nameEl?.textContent?.trim() || '';
            const linkEl = el.querySelector('a[href*="product"]');
            const link = linkEl?.href || '';
            if (name.length > 2 && link) {
              items.push({ name, link });
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

        // 找最佳匹配
        let bestScore = 0;
        let bestResult = null;
        for (const r of results) {
          const score = nameMatchScore(fig.name, r.name);
          if (score > bestScore) {
            bestScore = score;
            bestResult = r;
          }
        }

        if (!bestResult || bestScore < 0.6) {
          if (idx <= 20 || idx % 50 === 0)
            process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ⚠️ ${(bestScore * 100).toFixed(0)}% 不匹配\n`);
          mismatch++;
          continue;
        }

        // 第二步：進入詳情頁
        const detail = await scrapeProductDetail(page, bestResult.link);
        await sleep(500);

        const updates = {};
        let logParts = [];

        // 修正價格
        if (detail.versionPrices.length > 0) {
          // 找到匹配版本的價格，或使用第一個版本
          let matchedPrice = null;
          if (fig.version) {
            const vp = detail.versionPrices.find(v => v.version && fig.version.includes(v.version));
            if (vp) matchedPrice = vp.price;
          }
          if (!matchedPrice) {
            matchedPrice = detail.versionPrices[0].price;
          }

          if (!fig.original_price || ALL_MODE) {
            updates.original_price = matchedPrice;
            logParts.push(`💰$${matchedPrice}`);
          }
        } else {
          noPrice++;
        }

        // 修正圖片（ALL 模式覆蓋更新，保留 admin 上傳的 supabase 圖片）
        if (detail.detailImage) {
          const isAdminImage = fig.image_url && fig.image_url.includes('supabase.co');
          if (!isAdminImage && (ALL_MODE || !fig.image_url)) {
            updates.image_url = detail.detailImage;
            logParts.push('🖼️');
          }
        }

        // 修正比例（ALL 模式覆蓋更新）
        if (detail.scale && (ALL_MODE || !fig.scale)) {
          updates.scale = detail.scale;
        }

        // 修正製作團隊（ALL 模式覆蓋更新）
        if (detail.manufacturer && (ALL_MODE || !fig.manufacturer)) {
          updates.manufacturer = detail.manufacturer;
        }

        if (Object.keys(updates).length > 0 && !DRY_RUN) {
          const { error: updateError } = await supabase
            .from('figures')
            .update(updates)
            .eq('id', fig.id);

          if (updateError) {
            errors++;
            continue;
          }
        }

        if (updates.original_price) priceFixed++;
        if (updates.image_url) imageFixed++;

        if (logParts.length > 0) {
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ✅ ${(bestScore * 100).toFixed(0)}% ${logParts.join(' ')}\n`);
        } else if (idx <= 20 || idx % 50 === 0) {
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ⏭️ 無需更新\n`);
          skipped++;
        }

      } catch (err) {
        errors++;
        if (idx <= 10 || idx % 50 === 0)
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... 💥 ${err.message.slice(0, 40)}\n`);
      }

      // 進度報告
      if (idx % 50 === 0 || idx === figures.length) {
        console.log(`\n--- 進度: ${idx}/${figures.length} | 💰${priceFixed} 🖼️${imageFixed} ❌${notFound} ⚠️${mismatch} 🚫${noPrice} ⏭️${skipped} 💥${errors} ---\n`);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          total: totalCount, processed: START_OFFSET + idx,
          priceFixed, imageFixed, notFound, mismatch, noPrice, skipped, errors,
          nextOffset: START_OFFSET + idx,
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n📊 結果統計:`);
  console.log(`  💰 價格修正: ${priceFixed}`);
  console.log(`  🖼️ 圖片修正: ${imageFixed}`);
  console.log(`  ❌ 未找到: ${notFound}`);
  console.log(`  ⚠️ 不匹配: ${mismatch}`);
  console.log(`  🚫 無全款價格: ${noPrice}`);
  console.log(`  ⏭️ 跳過: ${skipped}`);
  console.log(`  💥 錯誤: ${errors}`);

  if (START_OFFSET + BATCH_SIZE < totalCount) {
    console.log(`\n💡 下一批: node scripts/ch-prices.js --offset ${START_OFFSET + BATCH_SIZE}${ALL_MODE ? ' --all' : ''}${FIX_IMAGES ? ' --fix-images' : ''}`);
  }
}

main().catch(console.error);
