/**
 * Google 圖片補圖腳本
 * 針對「多版本共用同一張圖片」的商品，用 Google 圖片搜尋抓取對應版本的圖片
 * 用法：node scripts/fetch-variant-images.js
 *       node scripts/fetch-variant-images.js --resume  (從上次進度繼續)
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PROGRESS_FILE = path.join(__dirname, '..', 'google-fetch-progress.json');

// GK 代理商可信圖片來源（優先選擇）
const TRUSTED_DOMAINS = [
  'shoplineapp.com', 'shoplineimg.com',
  'cloudimg.in',
  'ruten.com.tw', 'r10s.com',
  'shopee.tw', 'cf.shopee.tw',
  'img.alicdn.com',
  '78dm.net',
  'favorgk.com',
  'galafigure.com',
  'gogoshop.cloud',
  'store-assets.com',
  'cybassets.com',
  'joyrentai.com',
  'myethos.com',
  'newbievillage.games',
  'myfigurecollection.net',
  'hpoi.net',
];

// 封鎖的網站
const BLOCKED_DOMAINS = [
  'facebook.com', 'fbcdn.net', 'instagram.com', 'youtube.com', 'ytimg.com',
  'google.com', 'gstatic.com', 'googleapis.com', 'twitter.com', 'twimg.com', 'x.com',
  'wikipedia.org', 'wikimedia.org', 'pinterest.com', 'pinimg.com', 'amazon.com',
  'ssl-images-amazon.com', 'tiktok.com', 'douyinpic.com',
];

// 從 Google 圖片搜尋取得圖片 URL
async function searchGoogleImage(page, manufacturer, name, version) {
  // 名稱和版本用引號精確搜尋
  const query = `"${name}" "${version}" ${manufacturer || ''} GK`;
  const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&tbm=isch&hl=zh-TW';

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1500);

    const urls = await page.evaluate((blocked) => {
      const found = [];
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (!text || text.length < 100) continue;
        const matches = text.match(/https?:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s\\]*)?/gi);
        if (matches) {
          for (const m of matches) {
            const clean = m.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            const isBlocked = blocked.some(d => clean.includes(d));
            if (!isBlocked && clean.length < 500 && clean.length > 20) {
              found.push(clean);
            }
          }
        }
      }
      return [...new Set(found)];
    }, BLOCKED_DOMAINS);

    return urls;
  } catch (e) {
    return [];
  }
}

// 從搜尋結果中選擇最佳圖片
function selectBestImage(urls, currentImage) {
  if (urls.length === 0) return null;

  // 優先選擇可信來源
  for (const domain of TRUSTED_DOMAINS) {
    for (const url of urls) {
      if (url.includes(domain) && url !== currentImage) {
        return url;
      }
    }
  }

  // 沒有可信來源，選第一個不同的
  for (const url of urls) {
    if (url !== currentImage) return url;
  }

  return null;
}

async function main() {
  const isResume = process.argv.includes('--resume');

  // 載入進度
  let progress = { completed: [], updated: 0, skipped: 0, noResult: 0 };
  if (isResume && fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`📂 載入進度: 已完成 ${progress.completed.length} 組`);
  }

  // 第一步：找出多版本共用同圖的商品群組
  console.log('🔍 查詢多版本共用圖片的商品...');

  const { data: allFigures, error } = await supabase
    .from('figures')
    .select('id, name, manufacturer, version, image_url')
    .not('version', 'is', null)
    .not('image_url', 'is', null)
    .order('name');

  if (error) {
    console.error('❌ 查詢失敗:', error.message);
    return;
  }

  // 按「名稱+工作室+圖片」分組，找出共用圖片的群組
  const groups = new Map();
  for (const fig of allFigures) {
    const key = `${fig.name}|${fig.manufacturer || ''}|${fig.image_url}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fig);
  }

  // 只保留有多個版本且共用同圖的群組
  const needsFetch = [];
  for (const [key, figures] of groups) {
    if (figures.length >= 2) {
      needsFetch.push({ key, figures });
    }
  }

  // 計算需要搜尋的總數
  let totalSearches = 0;
  for (const group of needsFetch) {
    for (const fig of group.figures) {
      if (!progress.completed.includes(fig.id)) totalSearches++;
    }
  }

  console.log(`📊 找到 ${needsFetch.length} 組共用圖片的商品，需搜尋 ${totalSearches} 筆`);

  if (totalSearches === 0) {
    console.log('✅ 沒有需要補圖的商品');
    return;
  }

  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  let searchCount = 0;
  let consecutiveEmpty = 0;

  for (const group of needsFetch) {
    const sample = group.figures[0];
    console.log(`\n📦 ${sample.manufacturer || '?'} ${sample.name} (${group.figures.length} 版本, 共用圖片)`);

    for (const fig of group.figures) {
      if (progress.completed.includes(fig.id)) continue;

      searchCount++;
      const pct = ((searchCount / totalSearches) * 100).toFixed(1);
      process.stdout.write(`  [${pct}%] 搜尋 [${fig.version}]... `);

      const urls = await searchGoogleImage(page, fig.manufacturer, fig.name, fig.version);
      const bestImage = selectBestImage(urls, fig.image_url);

      if (bestImage) {
        // 更新資料庫
        const { error: updateError } = await supabase
          .from('figures')
          .update({ image_url: bestImage })
          .eq('id', fig.id);

        if (!updateError) {
          progress.updated++;
          console.log(`✅ 找到 (${urls.length} 張, 來源: ${TRUSTED_DOMAINS.find(d => bestImage.includes(d)) || '其他'})`);
        } else {
          console.log(`❌ 更新失敗: ${updateError.message}`);
        }
        consecutiveEmpty = 0;
      } else {
        progress.noResult++;
        console.log(`⏭️ 無合適結果 (${urls.length} 張)`);
        consecutiveEmpty++;
      }

      progress.completed.push(fig.id);
      progress.skipped = totalSearches - searchCount;

      // 定期儲存進度
      if (searchCount % 5 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      }

      // 延遲避免被 Google 封鎖
      const delay = 1500 + Math.random() * 1000;
      await sleep(delay);

      // 如果連續太多次無結果，可能被封鎖了
      if (consecutiveEmpty >= 10) {
        console.log('\n⚠️ 連續 10 次無結果，等待 30 秒...');
        await sleep(30000);
        consecutiveEmpty = 0;
      }
    }
  }

  // 儲存最終進度
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  await browser.close();

  console.log('\n========================================');
  console.log('📊 補圖完成！');
  console.log(`   更新: ${progress.updated} 筆`);
  console.log(`   無結果: ${progress.noResult} 筆`);
  console.log(`   總搜尋: ${progress.completed.length} 筆`);
  console.log('========================================');
}

main().catch(console.error);
