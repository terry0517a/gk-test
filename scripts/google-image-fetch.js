/**
 * 用 Google 圖片搜尋為公仔抓取圖片
 *
 * 策略：搜尋 "公仔名稱 GK" → 從 Google 結果提取圖片 URL
 *
 * 使用方式：
 *   node scripts/google-image-fetch.js [--batch 500] [--offset 0] [--dry-run] [--all]
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
const PROGRESS_FILE = path.join(__dirname, '../google-fetch-progress.json');

const usedImages = new Set();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 信任的圖片來源
const TRUSTED_DOMAINS = [
  'shoplineapp.com',
  'shoplineimg.com',
  'gogoshop.cloud',
  'store-assets.com',
  'cloudimg.in',
  'r10s.com',       // 樂天
  'cybassets.com',
  'ruten.com.tw',   // 露天
  'pcstore.com.tw',
  'shopee.tw',
  'img.alicdn.com',
  'mylesb.ca',
];

// 排除的圖片來源（廣告、社群等）
const BLOCKED_DOMAINS = [
  'facebook.com', 'fbcdn.net', 'instagram.com', 'youtube.com', 'ytimg.com',
  'google.com', 'gstatic.com', 'googleapis.com',
  'twitter.com', 'twimg.com', 'x.com',
  'wikipedia.org', 'wikimedia.org',
  'pinterest.com', 'pinimg.com',
  'amazon.com', 'ssl-images-amazon.com',
];

// 從 Google 搜尋結果提取圖片 URL
async function searchGoogleImages(page, figureName, manufacturer) {
  // 用工作室 + 公仔名稱搜尋，更精準
  let query = '';
  if (manufacturer) {
    query = manufacturer + ' ' + figureName + ' GK';
  } else {
    query = figureName + ' GK公仔';
  }
  const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&tbm=isch&hl=zh-TW';

  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(800 + Math.random() * 500);

  // 檢查 CAPTCHA
  const hasCaptcha = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('unusual traffic') || text.includes('captcha') ||
           text.includes('not a robot') || document.querySelector('#captcha-form') !== null;
  });

  if (hasCaptcha) {
    return { captcha: true, urls: [] };
  }

  // 提取圖片 URL（從 script 標籤中解析）
  const urls = await page.evaluate((blocked) => {
    const found = [];
    const scripts = document.querySelectorAll('script');

    for (const script of scripts) {
      const text = script.textContent;
      if (!text || text.length < 100) continue;

      // Google 在 script 中嵌入完整圖片 URL
      const matches = text.match(/https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s\\]*)?/gi);
      if (matches) {
        for (const m of matches) {
          // 解碼轉義字符
          const clean = m.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');

          // 過濾掉不要的來源
          const isBlocked = blocked.some(d => clean.includes(d));
          if (!isBlocked && clean.length < 500 && clean.length > 20) {
            found.push(clean);
          }
        }
      }
    }

    return [...new Set(found)];
  }, BLOCKED_DOMAINS);

  return { captcha: false, urls };
}

// 選擇最佳圖片
function selectBestImage(urls, usedSet) {
  // 優先選擇信任來源的圖片
  for (const domain of TRUSTED_DOMAINS) {
    for (const url of urls) {
      if (url.includes(domain) && !usedSet.has(url)) {
        return url;
      }
    }
  }

  // 如果沒有信任來源，選第一個未使用的
  for (const url of urls) {
    if (!usedSet.has(url)) {
      return url;
    }
  }

  return null;
}

async function main() {
  console.log('🔍 Google 圖片搜尋抓取公仔圖片');
  console.log(`設定: batch=${BATCH_SIZE}, offset=${START_OFFSET}${DRY_RUN ? ' (DRY RUN)' : ''}${ALL_MODE ? ' (ALL MODE - 覆蓋現有)' : ''}`);

  // 取得公仔列表（分頁讀取所有）
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

  // 截取到 BATCH_SIZE
  figures = figures.slice(0, BATCH_SIZE);

  console.log(`找到 ${totalCount} 個公仔，本次處理 ${figures.length} 個\n`);

  // 載入已有圖片（防止重複）
  let offset = 0;
  while (true) {
    const { data: existing } = await supabase
      .from('figures')
      .select('image_url')
      .not('image_url', 'is', null)
      .range(offset, offset + 999);
    if (!existing || existing.length === 0) break;
    existing.forEach(f => usedImages.add(f.image_url));
    offset += 1000;
  }
  console.log(`已有 ${usedImages.size} 張圖片在使用中\n`);

  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  // 隱藏 webdriver 特徵
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  let success = 0;
  let noResult = 0;
  let duplicate = 0;
  let captchaCount = 0;
  let kept = 0;
  let errors = 0;

  try {
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      const idx = i + 1;

      try {
        const result = await searchGoogleImages(page, fig.name, fig.manufacturer);

        if (result.captcha) {
          captchaCount++;
          console.log(`\n⚠️ CAPTCHA detected at ${idx}! Waiting 30 seconds...`);
          await sleep(30000);
          // Retry once
          const retry = await searchGoogleImages(page, fig.name, fig.manufacturer);
          if (retry.captcha) {
            console.log('❌ Still CAPTCHA. Stopping to avoid further blocking.');
            break;
          }
          result.urls = retry.urls;
        }

        if (result.urls.length === 0) {
          if (idx <= 20 || idx % 50 === 0)
            process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ❌ 無結果\n`);
          noResult++;
          continue;
        }

        const bestUrl = selectBestImage(result.urls, usedImages);

        if (!bestUrl) {
          duplicate++;
          continue;
        }

        // ALL_MODE: 如果已有圖片且是 admin 上傳的，不覆蓋
        if (ALL_MODE && fig.image_url && fig.image_url.includes('supabase.co')) {
          kept++;
          continue;
        }

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from('figures')
            .update({ image_url: bestUrl })
            .eq('id', fig.id);

          if (updateError) {
            errors++;
            continue;
          }
        }

        usedImages.add(bestUrl);
        success++;
        if (idx <= 20 || idx % 20 === 0)
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... ✅ ${bestUrl.slice(0, 50)}\n`);

      } catch (err) {
        errors++;
        if (idx <= 10 || idx % 50 === 0)
          process.stdout.write(`[${idx}/${figures.length}] ${fig.name.slice(0, 30)}... 💥 ${err.message.slice(0, 40)}\n`);
      }

      // 隨機延遲避免被偵測
      await sleep(500 + Math.random() * 1000);

      // 進度報告
      if (idx % 100 === 0 || idx === figures.length) {
        console.log(`\n--- 進度: ${idx}/${figures.length} | ✅${success} ❌${noResult} 🔄${duplicate} 🤖${captchaCount} 🔒${kept} 💥${errors} ---\n`);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          total: totalCount, processed: START_OFFSET + idx,
          success, noResult, duplicate, captchaCount, kept, errors,
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
  console.log(`  ❌ 無結果: ${noResult}`);
  console.log(`  🔄 重複跳過: ${duplicate}`);
  console.log(`  🤖 CAPTCHA: ${captchaCount}`);
  console.log(`  🔒 保留 admin 圖: ${kept}`);
  console.log(`  💥 錯誤: ${errors}`);
  console.log(`  成功率: ${((success / figures.length) * 100).toFixed(1)}%`);

  if (START_OFFSET + BATCH_SIZE < totalCount) {
    console.log(`\n💡 下一批: node scripts/google-image-fetch.js --offset ${START_OFFSET + BATCH_SIZE}${ALL_MODE ? ' --all' : ''}`);
  }
}

main().catch(console.error);
