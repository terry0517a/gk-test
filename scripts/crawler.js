/**
 * GK 公仔爬蟲腳本 (v2 - 支援詳情頁全款價格)
 *
 * 使用方式：
 * 1. 安裝依賴：npm install puppeteer
 * 2. 執行：node scripts/crawler.js
 * 3. 產生的 CSV 檔案可以用批量匯入功能上傳
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 命令列參數
const args = process.argv.slice(2);
const RESUME_MODE = args.includes('--resume') || args.includes('-r');
const STAGE2_ONLY = args.includes('--stage2') || args.includes('-s2');

// 設定
const CONFIG = {
  // 要爬取的網站
  sites: ['scctoys', 'nightwind'],
  // 每個網站爬取的頁數 (設 999 = 爬到沒有為止)
  maxPages: 999,
  // 輸出檔案
  outputFile: path.join(__dirname, '../crawler-output.csv'),
  // 進度檔案
  progressFile: path.join(__dirname, '../crawler-progress.json'),
  // 收集的連結檔案（用於斷點續傳）
  linksFile: path.join(__dirname, '../crawler-links.json'),
  // 失敗連結檔案（用於重試）
  failedLinksFile: path.join(__dirname, '../crawler-failed-links.json'),
  // 請求間隔（毫秒）- 增加到 1500ms 避免被封鎖
  delay: 1500,
  // 每個連結的重試次數
  maxRetries: 3,
  // 重試間隔（毫秒）
  retryDelay: 3000,
  // 批次大小 - 每處理多少個連結後暫停一下
  batchSize: 50,
  // 批次間隔（毫秒）
  batchDelay: 5000,
  // 過濾關鍵字（非公仔商品）
  excludeKeywords: [
    '裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙', '徽章', '鑰匙圈', '吊飾',
    '燈帶畫', '地毯', '毛毯', '午睡毯', '桌墊', '滑鼠墊', '抱枕',
    '春聯', '對聯', '紅包袋', '福袋', '明信片', '書籤', '遮陽',
    '框畫',
    'poster', 'keychain', 'badge', 'carpet', 'blanket', 'mousepad'
  ],
};

// 儲存收集的連結
function saveCollectedLinks(links, site) {
  try {
    const data = { site, links, savedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG.linksFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  💾 已儲存 ${links.length} 個連結到 crawler-links.json`);
  } catch (e) {
    console.error('儲存連結失敗:', e.message);
  }
}

// 載入之前收集的連結
function loadCollectedLinks() {
  try {
    if (fs.existsSync(CONFIG.linksFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.linksFile, 'utf-8'));
      console.log(`  📂 載入 ${data.links.length} 個已儲存的連結 (${data.site})`);
      return data;
    }
  } catch (e) {
    console.error('載入連結失敗:', e.message);
  }
  return null;
}

// 儲存失敗的連結
function saveFailedLinks(failedLinks, site) {
  try {
    const data = { site, links: failedLinks, savedAt: new Date().toISOString() };
    fs.writeFileSync(CONFIG.failedLinksFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  💾 已儲存 ${failedLinks.length} 個失敗連結到 crawler-failed-links.json`);
  } catch (e) {
    console.error('儲存失敗連結失敗:', e.message);
  }
}

// 載入失敗的連結（用於重試）
function loadFailedLinks() {
  try {
    if (fs.existsSync(CONFIG.failedLinksFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.failedLinksFile, 'utf-8'));
      console.log(`  📂 載入 ${data.links.length} 個失敗連結準備重試 (${data.site})`);
      return data;
    }
  } catch (e) {
    console.error('載入失敗連結失敗:', e.message);
  }
  return null;
}

// 帶重試的頁面訪問函數
async function gotoWithRetry(page, url, options = {}, maxRetries = CONFIG.maxRetries) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
        ...options
      });
      return true;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(CONFIG.retryDelay);
      }
    }
  }
  throw lastError;
}

// 進度追蹤
const progress = {
  status: 'idle', // idle, running, completed, error
  phase: '', // 階段描述
  site: '', // 當前網站
  current: 0, // 當前處理數
  total: 0, // 總數
  collected: 0, // 已收集商品數
  success: 0, // 成功數
  errors: 0, // 錯誤數
  currentItem: '', // 當前處理的商品名稱
  startTime: null,
  message: '',
};

// 更新並儲存進度
function updateProgress(updates) {
  Object.assign(progress, updates);
  try {
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
  } catch (e) {
    // 忽略寫入錯誤
  }
}

// 儲存結果
const results = [];

// 延遲函數
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 版本提取函數
function extractVersionInfo(name) {
  let baseName = name;
  let version = [];
  let scale = null;

  // 提取比例 (1/4, 1/6, 1/8, 1:4, etc.)
  const scaleMatch = baseName.match(/\b(1[\/:](?:1|2|3|4|5|6|7|8|10|12))\b/i);
  if (scaleMatch) {
    scale = scaleMatch[1].replace(':', '/');
  }

  // 顏色版本關鍵字
  const colorVersions = [
    { pattern: /黑色版|黑版|黑化版|暗黑版|Black\s*(?:Ver|Version)?/gi, name: '黑色版' },
    { pattern: /白色版|白版|White\s*(?:Ver|Version)?/gi, name: '白色版' },
    { pattern: /透明版|透明限定|Clear\s*(?:Ver|Version)?/gi, name: '透明版' },
    { pattern: /原色版|GK原色|素體版|Unpainted/gi, name: '原色版' },
    { pattern: /特別配色|特殊配色|Special\s*Color/gi, name: '特別配色版' },
    { pattern: /夜光版|發光版|Glow/gi, name: '夜光版' },
    { pattern: /金色版|金版|Gold\s*(?:Ver|Version)?/gi, name: '金色版' },
    { pattern: /銀色版|銀版|Silver\s*(?:Ver|Version)?/gi, name: '銀色版' },
    { pattern: /血戰版|戰損版|Battle\s*(?:Damage|Ver)/gi, name: '戰損版' },
  ];

  // 限定版本關鍵字
  const limitedVersions = [
    { pattern: /限量版|限量/gi, name: '限量版' },
    { pattern: /限定版|限定/gi, name: '限定版' },
    { pattern: /特典版|特典/gi, name: '特典版' },
    { pattern: /首批版|首批特裝|初回版|初回限定/gi, name: '首批版' },
    { pattern: /豪華版|豪華/gi, name: '豪華版' },
    { pattern: /標準版|普通版|Standard/gi, name: '標準版' },
    { pattern: /完全版|完整版|Complete/gi, name: '完全版' },
    { pattern: /DX版|DX/gi, name: 'DX版' },
    { pattern: /EX版|EX/gi, name: 'EX版' },
    { pattern: /SP版|SP/gi, name: 'SP版' },
    { pattern: /Premium|豪華限定/gi, name: 'Premium版' },
    { pattern: /Resin|樹脂版/gi, name: '樹脂版' },
    { pattern: /PVC版|PVC/gi, name: 'PVC版' },
    { pattern: /高配版?|高配/gi, name: '高配版' },
    { pattern: /低配版?|低配/gi, name: '低配版' },
    { pattern: /頂配版?|頂配/gi, name: '頂配版' },
    { pattern: /簡配版?|簡配/gi, name: '簡配版' },
    { pattern: /大師版|大師/gi, name: '大師版' },
    { pattern: /收藏版|典藏版/gi, name: '收藏版' },
    { pattern: /精裝版|精裝/gi, name: '精裝版' },
    { pattern: /特裝版|特裝/gi, name: '特裝版' },
    { pattern: /進階版|進階/gi, name: '進階版' },
    { pattern: /基礎版|基礎/gi, name: '基礎版' },
    { pattern: /電鍍版|電鍍/gi, name: '電鍍版' },
  ];

  // 檢查顏色版本
  for (const { pattern, name: verName } of colorVersions) {
    if (pattern.test(baseName)) {
      version.push(verName);
    }
  }

  // 檢查限定版本
  for (const { pattern, name: verName } of limitedVersions) {
    if (pattern.test(baseName)) {
      version.push(verName);
    }
  }

  // 檢查 A版/B版/C版 等
  const abcMatch = baseName.match(/\b([A-Z])版\b/);
  if (abcMatch) {
    version.push(`${abcMatch[1]}版`);
  }

  return {
    baseName,
    version: version.length > 0 ? version.join(' ') : null,
    scale,
  };
}

// 即時儲存結果
function saveResults() {
  const uniqueResults = [];
  const seen = new Set();

  for (const item of results) {
    const key = `${item.name}|${item.version || ''}|${item.scale || ''}`.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(item);
    }
  }

  const csvHeader = '名稱\t工作室\t原價\t版本\t比例\t圖片\t來源\t標籤';
  const csvRows = uniqueResults.map(item =>
    `${item.name}\t${item.manufacturer}\t${item.original_price || ''}\t${item.version || ''}\t${item.scale || ''}\t${item.image_url || ''}\t${item.source}\t${item.tag || ''}`
  );
  const csvContent = [csvHeader, ...csvRows].join('\n');

  fs.writeFileSync(CONFIG.outputFile, '\ufeff' + csvContent, 'utf-8');
  return uniqueResults.length;
}

// ========== SCC Toys 爬蟲 (兩階段) ==========
async function crawlSCCToys(browser, resumeLinks = null) {
  console.log('\n🔍 開始爬取 SCC Toys...');
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // 儲存所有商品的基本資訊
  let productList = [];

  // 如果有續傳連結，直接使用
  if (resumeLinks && resumeLinks.length > 0) {
    productList = resumeLinks;
    console.log(`  ⏩ 續傳模式：跳過第一階段，使用 ${productList.length} 個已收集連結`);

    updateProgress({
      site: 'SCC Toys',
      phase: '續傳模式：跳過第一階段',
      collected: productList.length,
      message: `使用 ${productList.length} 個已收集連結`,
    });
  } else {
    updateProgress({
      site: 'SCC Toys',
      phase: '第一階段：收集商品連結',
      current: 0,
      total: 0,
      collected: 0,
      message: '正在掃描商品列表頁面...',
    });

    try {
      // === 第一階段：收集所有商品連結 ===
      console.log('  📋 第一階段：收集商品連結...');

    // 動態發現所有分類 URL
    console.log('    🔍 正在發現所有分類...');
    let categories = [];
    try {
      await page.goto('https://www.scctoys.com.tw/products', { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
      const discoveredCategories = await page.evaluate(() => {
        const urls = new Set();
        document.querySelectorAll('a[href*="/categories/"]').forEach(el => {
          const href = el.href.split('?')[0]; // 移除查詢參數
          if (href.includes('/categories/')) urls.add(href);
        });
        return [...urls];
      });

      // 過濾掉非商品分類（衣物、地毯等周邊）
      const skipCategories = ['clothing', 'floor-mats', 'fridge-magnets', 'car-front-sun-visor'];
      categories = discoveredCategories.filter(url => {
        const slug = url.split('/categories/')[1];
        return !skipCategories.some(skip => slug === skip);
      });

      console.log(`    ✅ 發現 ${categories.length} 個分類`);
    } catch (err) {
      console.log(`    ❌ 動態發現分類失敗: ${err.message}，使用備用清單`);
    }

    // 備用：如果動態發現失敗或結果太少
    if (categories.length < 20) {
      console.log('    ⚠️ 使用備用分類清單');
      categories = [
        'https://www.scctoys.com.tw/products',
        'https://www.scctoys.com.tw/categories/gk%E7%8E%B0%E8%B2%A8',
        'https://www.scctoys.com.tw/categories/gk%E9%A0%90%E8%B3%BC',
        'https://www.scctoys.com.tw/categories/one-piece-gk',
        'https://www.scctoys.com.tw/categories/dragon-ball-gk',
        'https://www.scctoys.com.tw/categories/pokemon-gk',
        'https://www.scctoys.com.tw/categories/naruto-gk',
        'https://www.scctoys.com.tw/categories/jujutsu-kaisen-gk',
        'https://www.scctoys.com.tw/categories/demon-slayer-gk',
        'https://www.scctoys.com.tw/categories/bleach-gk',
        'https://www.scctoys.com.tw/categories/attack-on-titan-gk',
        'https://www.scctoys.com.tw/categories/chainsaw-man-gk',
        'https://www.scctoys.com.tw/categories/final-fantasy-gk',
        'https://www.scctoys.com.tw/categories/fate-gk',
        'https://www.scctoys.com.tw/categories/genshin-impact-gk',
        'https://www.scctoys.com.tw/categories/honkai-star-rail-gk',
        'https://www.scctoys.com.tw/categories/pvc-2025',
        'https://www.scctoys.com.tw/categories/pvc-2026',
        'https://www.scctoys.com.tw/categories/pvc-2024',
        'https://www.scctoys.com.tw/categories/r18',
        'https://www.scctoys.com.tw/categories/r18-women',
        'https://www.scctoys.com.tw/categories/r18-men',
        'https://www.scctoys.com.tw/categories/merchandise',
        'https://www.scctoys.com.tw/categories/in-stock',
        'https://www.scctoys.com.tw/categories/in-stock-tw',
        'https://www.scctoys.com.tw/categories/in-stock-overseas',
        'https://www.scctoys.com.tw/categories/pre-order-closed',
        'https://www.scctoys.com.tw/categories/sold-out',
        'https://www.scctoys.com.tw/categories/final-payment',
        'https://www.scctoys.com.tw/categories/in-stock-supplier',
        'https://www.scctoys.com.tw/categories/frame-pic',
        'https://www.scctoys.com.tw/categories/frame-pic-in-stock-supplier',
      ];
    }

    // 確保主商品列表在第一個
    if (!categories.includes('https://www.scctoys.com.tw/products')) {
      categories.unshift('https://www.scctoys.com.tw/products');
    }

    for (const categoryUrl of categories) {
      console.log(`    📂 分類: ${categoryUrl.split('/').pop()}`);

      for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
        const url = `${categoryUrl}?page=${pageNum}`;

        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await sleep(CONFIG.delay);

          // 滾動頁面載入圖片
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
          await sleep(300);

          // 提取商品基本資訊
          const products = await page.evaluate(() => {
            const items = [];
            const productElements = document.querySelectorAll('.product-item, .product-card, [class*="ProductCard"], [class*="product-list"] > div');

            productElements.forEach(el => {
              const nameEl = el.querySelector('h3, h4, .product-name, .product-title, [class*="title"], [class*="name"]');
              const name = nameEl?.textContent?.trim();

              const linkEl = el.querySelector('a[href*="product"]');
              const link = linkEl?.href;

              // 圖片
              const imgEl = el.querySelector('img');
              let imageUrl = '';
              if (imgEl) {
                imageUrl = imgEl.getAttribute('src') ||
                           imgEl.getAttribute('data-src') ||
                           imgEl.getAttribute('data-original') || '';
              }
              if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://www.scctoys.com.tw' + imageUrl;
              }
              if (imageUrl && (imageUrl.includes('placeholder') || imageUrl.includes('loading') || imageUrl.includes('blank') || imageUrl.includes('data:image') || imageUrl.includes('6507db252d6cbb001a7fd12d') || imageUrl.includes('6527981f1c9e590020ad939f'))) {
                imageUrl = '';
              }

              if (name && name.length > 2 && link) {
                items.push({ name, link, imageUrl: imageUrl || '' });
              }
            });

            return items;
          });

          if (products.length === 0) {
            console.log(`      ✅ 分類結束 (第 ${pageNum - 1} 頁)`);
            break;
          }

          // 非公仔商品關鍵字（過濾衣服、周邊等）
          const excludeKeywords = ['T恤', 'T-shirt', 'Tshirt', '短袖', '長袖', '上衣', '帽T', '衛衣', '外套', '褲', '襪', '鞋', '衣服', '服飾', '服裝', '抱枕', '地毯', '毛毯', '桌墊', '滑鼠墊', '遮陽', '雨傘'];

          // 過濾重複並加入列表
          for (const p of products) {
            const lowerName = p.name.toLowerCase();
            if (excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()))) continue;
            if (!productList.some(existing => existing.link === p.link)) {
              productList.push(p);
            }
          }

          console.log(`      第 ${pageNum} 頁: ${products.length} 個商品 (累計 ${productList.length})`);

          updateProgress({
            collected: productList.length,
            message: `已收集 ${productList.length} 個商品連結`,
          });

          // 檢查是否有下一頁
          const hasNext = await page.evaluate((currentPage) => {
            const pageLinks = document.querySelectorAll('a[href*="page="]');
            let maxPage = currentPage;
            pageLinks.forEach(link => {
              const match = link.href.match(/page=(\d+)/);
              if (match) {
                const num = parseInt(match[1]);
                if (num > maxPage) maxPage = num;
              }
            });
            return maxPage > currentPage;
          }, pageNum);

          if (!hasNext) {
            console.log(`      ✅ 分類結束 (第 ${pageNum} 頁)`);
            break;
          }

        } catch (err) {
          console.log(`      ❌ 錯誤: ${err.message}`);
          break;
        }
      }
    }

    console.log(`\n  📦 共收集 ${productList.length} 個商品連結`);

    // 儲存收集的連結（用於斷點續傳）
    saveCollectedLinks(productList, 'SCC Toys');

    } catch (err) {
      console.error('第一階段錯誤:', err.message);
    }
  } // end of else (非續傳模式)

  // 追蹤失敗的連結
  const failedLinks = [];

  try {
    // === 第二階段：逐一訪問詳情頁取得全款價格 ===
    console.log('  💰 第二階段：取得全款價格...');
    console.log(`  ⚙️ 設定: 重試${CONFIG.maxRetries}次, 間隔${CONFIG.delay}ms, 批次${CONFIG.batchSize}個`);

    updateProgress({
      phase: '第二階段：取得全款價格',
      current: 0,
      total: productList.length,
      message: `開始處理 ${productList.length} 個商品詳情頁...`,
    });

    let processed = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const product of productList) {
      processed++;

      updateProgress({
        current: processed,
        total: productList.length,
        success: successCount,
        errors: errorCount,
        currentItem: product.name.slice(0, 30),
        message: `處理中: ${product.name.slice(0, 30)}${product.name.length > 30 ? '...' : ''}`,
      });

      // 批次休息 - 每處理一批就暫停一下，避免被封鎖
      if (processed > 1 && (processed - 1) % CONFIG.batchSize === 0) {
        console.log(`    🛑 批次休息中... (已處理 ${processed - 1}/${productList.length})`);
        await sleep(CONFIG.batchDelay);
      }

      // 每個商品用新的頁面，避免 detached frame 問題
      let detailPage = null;
      let pageSuccess = false;

      for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
          detailPage = await browser.newPage();
          await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

          await detailPage.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(CONFIG.delay);
          pageSuccess = true;
          break; // 成功就跳出重試迴圈
        } catch (retryErr) {
          if (detailPage) {
            await detailPage.close().catch(() => {});
            detailPage = null;
          }
          if (attempt < CONFIG.maxRetries) {
            await sleep(CONFIG.retryDelay);
          }
        }
      }

      if (!pageSuccess) {
        // 所有重試都失敗，記錄這個連結
        failedLinks.push(product);
        errorCount++;
        if (processed % 100 === 0 || failedLinks.length % 50 === 0) {
          console.log(`    進度: ${processed}/${productList.length} (成功 ${successCount}, 失敗 ${failedLinks.length})`);
          // 定期儲存失敗連結
          saveFailedLinks(failedLinks, 'SCC Toys');
        }
        continue;
      }

      try {

        // 在詳情頁提取全款價格和版本資訊
        const detailInfo = await detailPage.evaluate(() => {
          const allText = document.body.innerText;
          const variants = []; // 儲存不同版本

          // 取得更好的圖片
          let betterImage = '';

          // 優先使用 og:image meta 標籤
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage && ogImage.content) {
            betterImage = ogImage.content;
          }

          // 如果沒有 og:image，找商品主圖
          if (!betterImage) {
            // 找商品輪播圖或主圖
            const imgSelectors = [
              '.product-gallery img',
              '.product-image img',
              '.swiper-slide img',
              '[class*="carousel"] img',
              '.product-photo img',
              '[class*="product"] img[src*="cdn"]',
              '[class*="product"] img[src*="shopline"]'
            ];

            for (const selector of imgSelectors) {
              const img = document.querySelector(selector);
              if (img) {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
                if (src && !src.includes('placeholder') && !src.includes('logo') && !src.includes('icon')) {
                  betterImage = src;
                  break;
                }
              }
            }
          }

          // 過濾占位圖 - SCC Toys 的已知占位圖 ID
          const badImageIds = ['6507db252d6cbb001a7fd12d', '6527981f1c9e590020ad939f'];
          if (betterImage && badImageIds.some(id => betterImage.includes(id))) {
            betterImage = '';
          }

          // 價格標籤（不是版本名）
          const fakePriceLabels = ['建議售價', '售價', '原價', '優惠價', '先行優惠價',
            '特價', '定價', '預購價', '現貨價', '團購價', '早鳥價', '預售價',
            '付款方式', '運費', '訂金', '尾款'];
          // 非公仔商品（周邊商品，不應作為版本）
          const merchandiseKeywords = ['冰箱貼', '毛毯', '午睡毯', '地毯', '裝飾畫',
            '掛畫', '海報', '桌墊', '滑鼠墊', '抱枕', '貼紙', 'T恤', '衣服',
            '鑰匙扣', '鑰匙圈', '徽章', '胸針', '馬克杯', '杯墊'];

          function isRealVersion(ver) {
            if (fakePriceLabels.some(label => ver.includes(label))) return false;
            if (merchandiseKeywords.some(kw => ver.includes(kw))) return false;
            return true;
          }

          let defaultPrice = null;

          // 嘗試找出版本選項和對應價格
          // 先嘗試從下拉選單或選項中提取版本價格
          const options = document.querySelectorAll('select option, [class*="variant"] button, [class*="spec"] button');
          options.forEach(opt => {
            const text = (opt.textContent || opt.innerText || '').trim();
            const priceMatch = text.match(/全款[：:\s]*(?:NT\$?|＄)?[\s]*([\d,]+)/);
            if (priceMatch) {
              const price = parseInt(priceMatch[1].replace(/,/g, ''));
              let versionName = text.replace(priceMatch[0], '').trim();
              versionName = versionName.replace(/[－\-–—：:]\s*$/, '').trim();
              if (price > 500 && price < 1000000 && versionName.length >= 1 && versionName.length <= 30) {
                if (isRealVersion(versionName)) {
                  variants.push({ version: versionName, price });
                } else if (!defaultPrice || price > defaultPrice) {
                  defaultPrice = price;
                }
              }
            }
          });

          // 從文字中尋找版本和價格的配對
          // SCC 格式：版本名[－–—-]全款XXXX、訂金YYYY（未含國際運費）
          // 注意：／/ 是版本名的一部分（如 1/6、單體大和／原價），不是分隔符
          // 模式1：版本名－全款XXXX（通用格式）
          const generalVersionPattern = /([\w\u4e00-\u9fff+（）()／/ ·&×＆]+?)\s*[－\-–—：:]\s*全款\s*([\d,]+)/g;
          let vMatch;
          while ((vMatch = generalVersionPattern.exec(allText)) !== null) {
            const ver = vMatch[1].trim();
            const price = parseInt(vMatch[2].replace(/,/g, ''));
            if (price > 0 && ver.length >= 1 && ver.length <= 40 && !variants.some(v => v.version === ver && v.price === price)) {
              if (isRealVersion(ver)) {
                variants.push({ version: ver, price });
              } else if (!defaultPrice || price > defaultPrice) {
                // 把假版本的價格記為預設價格（取最高的全款價）
                defaultPrice = price;
              }
            }
          }

          // 模式2：更寬鬆 - 找所有「XXX－全款YYYY」（只在模式1沒找到時）
          if (variants.length === 0) {
            const p2 = /([^\n,、]{2,30}?)\s*[－\-–—]\s*全款\s*([\d,]+)/g;
            let m2;
            while ((m2 = p2.exec(allText)) !== null) {
              const ver = m2[1].trim().replace(/^[：:\s⫸]+/, '');
              const price = parseInt(m2[2].replace(/,/g, ''));
              if (price > 0 && ver.length >= 1 && ver.length <= 30 && !variants.some(v => v.version === ver)) {
                if (!/^\d+$/.test(ver) && isRealVersion(ver)) {
                  variants.push({ version: ver, price });
                } else if (!defaultPrice || price > defaultPrice) {
                  defaultPrice = price;
                }
              }
            }
          }

          // 如果還沒有預設價格，從全款文字中提取
          if (!defaultPrice) {
            const fullPriceMatch = allText.match(/全款[：:\s]*(?:NT\$?|＄|TWD)?[\s]*([\d,]+)/i);
            if (fullPriceMatch) {
              defaultPrice = parseInt(fullPriceMatch[1].replace(/,/g, ''));
            }
          }

          // 如果沒有全款，找最大的價格
          if (!defaultPrice) {
            const priceMatches = allText.match(/(?:NT\$?|＄|TWD)[\s]*([\d,]+)/gi) || [];
            let maxPrice = 0;
            for (const p of priceMatches) {
              const num = parseInt(p.replace(/[^\d]/g, ''));
              if (num > maxPrice && num < 1000000) maxPrice = num;
            }
            if (maxPrice > 0) defaultPrice = maxPrice;
          }

          return {
            defaultPrice,
            betterImage,
            variants: variants.length > 0 ? variants : null
          };
        });

        // 處理商品名稱
        let cleanName = product.name;
        let manufacturer = '';

        cleanName = cleanName.replace(/【[^】]*】/g, '').trim();

        const studioMatch = cleanName.match(/^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室))?)\s+(.+)/i);
        if (studioMatch && studioMatch[1].length <= 15) {
          manufacturer = studioMatch[1].trim();
          cleanName = studioMatch[2].trim();
        }

        // 從 ｜ 後面提取系列標籤
        let tag = '';
        if (cleanName.includes('｜')) {
          const parts = cleanName.split('｜');
          cleanName = parts[0].trim();
          tag = parts[1] ? parts[1].trim() : '';
        }

        const finalName = cleanName || product.name;
        const lowerName = finalName.toLowerCase();
        const shouldExclude = CONFIG.excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()));

        if (!shouldExclude && finalName.length > 2) {
          const versionInfo = extractVersionInfo(finalName);

          // 過濾占位圖 URL
          const placeholderIds = ['6507db252d6cbb001a7fd12d', '6527981f1c9e590020ad939f', 'placeholder', 'default', 'loading'];
          let finalImageUrl = detailInfo.betterImage || product.imageUrl || '';
          if (finalImageUrl && placeholderIds.some(id => finalImageUrl.includes(id))) {
            finalImageUrl = '';
          }

          // 如果有多個版本，為每個版本建立條目
          if (detailInfo.variants && detailInfo.variants.length > 0) {
            for (const variant of detailInfo.variants) {
              results.push({
                name: finalName,
                manufacturer,
                original_price: variant.price,
                version: variant.version,
                scale: versionInfo.scale,
                image_url: finalImageUrl,
                source: 'SCC Toys',
                tag,
              });
              successCount++;
            }
          } else {
            // 沒有找到版本特定價格，使用預設價格
            results.push({
              name: finalName,
              manufacturer,
              original_price: detailInfo.defaultPrice,
              version: versionInfo.version,
              scale: versionInfo.scale,
              image_url: finalImageUrl,
              source: 'SCC Toys',
              tag,
            });
            successCount++;
          }
        }

        // 每 50 個商品儲存一次並顯示進度
        if (processed % 50 === 0) {
          const saved = saveResults();
          console.log(`    進度: ${processed}/${productList.length} (成功 ${successCount} 筆)`);
        }

      } catch (err) {
        // 處理過程中的錯誤（不是連線錯誤）
        failedLinks.push(product);
        errorCount++;
        if (processed % 100 === 0) {
          console.log(`    進度: ${processed}/${productList.length} (成功 ${successCount}, 失敗 ${failedLinks.length})`);
        }
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }
    }

    // 最終儲存
    const saved = saveResults();
    console.log(`  ✅ SCC Toys 完成 (${saved} 筆)`);
    console.log(`  ❌ 失敗連結: ${failedLinks.length} 個`);

    // 儲存失敗連結供之後重試
    if (failedLinks.length > 0) {
      saveFailedLinks(failedLinks, 'SCC Toys');
      console.log(`  💡 提示: 使用 --retry-failed 參數重試失敗的連結`);
    }

  } catch (err) {
    console.error('SCC Toys 爬取失敗:', err.message);
  } finally {
    await page.close();
  }
}

// ========== NightWind Shop 爬蟲 ==========
async function crawlNightWind(browser) {
  console.log('\n🔍 開始爬取 NightWind Shop...');
  console.log('  ⚠️ 注意：NightWind 使用複雜的 SPA 分頁，目前只能爬取第一頁');
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  updateProgress({
    site: 'NightWind Shop',
    phase: '載入頁面',
    current: 0,
    total: 0,
    message: '正在載入 NightWind 商品頁面...',
  });

  try {
    await page.goto('https://www.nightwindshop.com/product/all', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    // 滾動頁面
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
    await sleep(1000);

    // 提取商品
    const products = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('li .pt_items_block, .pt_item').forEach(el => {
        const nameEl = el.querySelector('.pt_title, h4, h5');
        const name = nameEl?.textContent?.trim();
        const originPriceEl = el.querySelector('.pt_origin, .js_origin_price');
        const salePriceEl = el.querySelector('.pt_sale, .js_pt_sale');
        const price = originPriceEl?.textContent?.trim() || salePriceEl?.textContent?.trim() || '';

        // 圖片 - 多嘗試幾個 lazy loading 屬性
        const imgEl = el.querySelector('img');
        let imageUrl = '';
        if (imgEl) {
          imageUrl = imgEl.getAttribute('src')
            || imgEl.getAttribute('data-src')
            || imgEl.getAttribute('data-lazy-src')
            || imgEl.getAttribute('data-original')
            || '';
        }
        // 也嘗試從 background-image CSS 取得
        if (!imageUrl) {
          const bgEl = el.querySelector('[style*="background-image"]');
          if (bgEl) {
            const bgMatch = bgEl.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
            if (bgMatch) imageUrl = bgMatch[1];
          }
        }
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://www.nightwindshop.com' + imageUrl;
        }

        if (name && name.length > 2) items.push({ name, price, imageUrl: imageUrl || '' });
      });
      return items;
    });

    console.log(`  📄 找到 ${products.length} 個商品`);

    updateProgress({
      phase: '處理商品資料',
      total: products.length,
      message: `找到 ${products.length} 個商品，正在處理...`,
    });

    let processedCount = 0;
    for (const product of products) {
      processedCount++;
      updateProgress({
        current: processedCount,
        currentItem: product.name.slice(0, 30),
      });
      // 提取價格（NightWind 應該顯示的是全款）
      let priceNum = null;
      if (product.price) {
        const priceClean = product.price.replace(/[$\s]/g, '');
        const match = priceClean.match(/[\d,]+/);
        if (match) {
          priceNum = parseInt(match[0].replace(/,/g, ''));
          if (priceNum < 500 || priceNum > 10000000) priceNum = null;
        }
      }

      // 清理名稱
      let cleanName = product.name;
      let manufacturer = '';

      cleanName = cleanName.replace(/『[^』]*』/g, '').replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '').trim();
      cleanName = cleanName.replace(/授權方[：:][^\s《]+/g, '').trim();
      cleanName = cleanName.replace(/《[^》]+》/g, '').trim();

      const studioMatch = cleanName.match(/^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室))?)\s+(.+)/i);
      if (studioMatch && studioMatch[1].length <= 20 && studioMatch[1].length >= 2) {
        manufacturer = studioMatch[1].trim();
        cleanName = studioMatch[2].trim();
      }

      cleanName = cleanName.replace(/正版授權\s*/g, '').trim();
      cleanName = cleanName.replace(/\s*(雕像|手辦|模型|公仔)$/g, '').trim();

      const finalName = cleanName || product.name;
      const lowerName = finalName.toLowerCase();
      const shouldExclude = CONFIG.excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()));

      if (!shouldExclude && finalName.length > 2) {
        const versionInfo = extractVersionInfo(finalName);

        results.push({
          name: finalName,
          manufacturer,
          original_price: priceNum,
          version: versionInfo.version,
          scale: versionInfo.scale,
          image_url: product.imageUrl || '',
          source: 'NightWind',
          tag: '',
        });
      }
    }

    const saved = saveResults();
    console.log(`  ✅ NightWind 爬取完成 (累計 ${saved} 筆)`);

  } catch (err) {
    console.error('NightWind 爬取失敗:', err.message);
    saveResults();
  } finally {
    await page.close();
  }
}

// ========== 主程式 ==========
async function main() {
  console.log('🚀 GK 公仔爬蟲啟動 (v2 - 支援詳情頁全款價格)');
  console.log(`📋 設定: ${CONFIG.sites.join(', ')}`);

  if (RESUME_MODE || STAGE2_ONLY) {
    console.log('⏩ 續傳模式：將載入之前收集的連結，跳過第一階段');
  } else {
    console.log('⚠️ 注意: 需要進入每個商品詳情頁，速度較慢');
  }
  console.log('');

  // 檢查是否有續傳資料
  let resumeData = null;
  if (RESUME_MODE || STAGE2_ONLY) {
    resumeData = loadCollectedLinks();
    if (!resumeData) {
      console.log('❌ 找不到之前收集的連結，將從頭開始爬取');
    }
  }

  updateProgress({
    status: 'running',
    phase: '啟動中...',
    startTime: new Date().toISOString(),
    message: resumeData ? '續傳模式：正在啟動瀏覽器' : '正在啟動瀏覽器',
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    if (CONFIG.sites.includes('scctoys')) {
      // 如果是續傳模式且有 SCC Toys 的連結，傳入連結
      const sccLinks = (resumeData && resumeData.site === 'SCC Toys') ? resumeData.links : null;
      await crawlSCCToys(browser, sccLinks);
    }

    if (CONFIG.sites.includes('nightwind') && !STAGE2_ONLY) {
      await crawlNightWind(browser);
    }

    const finalCount = saveResults();
    console.log(`\n📊 總共爬取 ${results.length} 筆，去重後 ${finalCount} 筆`);
    console.log(`\n✅ 已儲存到: ${CONFIG.outputFile}`);

    updateProgress({
      status: 'importing',
      phase: '匯入資料庫',
      success: finalCount,
      message: `爬取完成 ${finalCount} 筆，正在匯入資料庫...`,
    });

    // 自動匯入資料庫
    console.log('\n📥 自動匯入資料庫...');
    try {
      const { execSync } = require('child_process');
      execSync('node scripts/import-crawled.js --overwrite', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        timeout: 600000,
      });
      console.log('\n✅ 匯入完成！');
    } catch (importErr) {
      console.error('\n❌ 匯入失敗:', importErr.message);
      console.log('💡 可手動執行: node scripts/import-crawled.js --overwrite');
    }

    updateProgress({
      status: 'completed',
      phase: '完成',
      success: finalCount,
      message: `爬取完成！共 ${finalCount} 筆資料，已匯入資料庫`,
    });

  } catch (err) {
    updateProgress({
      status: 'error',
      phase: '錯誤',
      message: err.message,
    });
    throw err;
  } finally {
    await browser.close();
  }
}

// 執行
main().catch(console.error);
