/**
 * GK 公仔快速爬蟲腳本（只爬最新幾頁）
 *
 * 用途：部署後定期執行，只抓取最新上架的公仔
 *
 * 使用方式：
 * 1. node scripts/crawler-quick.js           # 預設爬取前 3 頁
 * 2. node scripts/crawler-quick.js --pages=5 # 指定頁數
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 解析命令列參數
const args = process.argv.slice(2);
let maxPages = 3; // 預設只爬 3 頁
let startPage = 1; // 起始頁碼
let skipNightWind = false;

for (const arg of args) {
  if (arg.startsWith('--pages=')) {
    maxPages = parseInt(arg.split('=')[1]) || 3;
  } else if (arg.startsWith('--start=')) {
    startPage = parseInt(arg.split('=')[1]) || 1;
  } else if (arg === '--no-nightwind') {
    skipNightWind = true;
  }
}

// 設定
const CONFIG = {
  maxPages,
  outputFile: path.join(__dirname, '../crawler-output-quick.csv'),
  delay: 1000,
  excludeKeywords: [
    '裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙', '徽章', '鑰匙圈', '吊飾',
    '燈帶畫', '地毯', '毛毯', '午睡毯', '卡磚', '桌墊', '滑鼠墊', '抱枕',
    'poster', 'keychain', 'badge', 'carpet', 'blanket', 'mousepad'
  ],
};

const results = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 版本提取函數
function extractVersionInfo(name) {
  let baseName = name;
  let version = [];
  let scale = null;

  const scaleMatch = baseName.match(/\b(1[\/:](?:1|2|3|4|5|6|7|8|10|12))\b/i);
  if (scaleMatch) {
    scale = scaleMatch[1].replace(':', '/');
  }

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
  ];

  for (const { pattern, name: verName } of colorVersions) {
    if (pattern.test(baseName)) {
      version.push(verName);
    }
  }

  for (const { pattern, name: verName } of limitedVersions) {
    if (pattern.test(baseName)) {
      version.push(verName);
    }
  }

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

// 從商品詳情頁解析版本和全款價格
async function scrapeProductDetail(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(500);

    const detail = await page.evaluate(() => {
      // 取得商品描述文字
      const descText = document.body.innerText || document.body.textContent;

      // 解析製作團隊
      const mfgMatch = descText.match(/製作團隊[：:]\s*(\S+)/);
      const manufacturer = mfgMatch ? mfgMatch[1] : '';

      // 解析版本和全款價格
      // 使用 innerText 取得更乾淨的文字
      const pageText = document.body.innerText || descText;

      const versionPrices = [];
      let match;

      // 格式1：版本名[－–—-]全款XXXX（通用格式）
      // 注意：／/ 是版本名的一部分（如 1/6、單體大和／原價），不是分隔符
      const versionPattern = /([\w\u4e00-\u9fff+（）()／/ ·&×＆]+?)\s*[－\-–—]\s*全款\s*([\d,]+)/g;
      while ((match = versionPattern.exec(pageText)) !== null) {
        const version = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ''));
        if (price > 0 && version.length >= 1 && version.length <= 40 && !versionPrices.find(v => v.version === version && v.price === price)) {
          if (!version.includes('付款') && !version.includes('運費')) {
            versionPrices.push({ version, price });
          }
        }
      }

      // 格式2：更寬鬆 - 找所有「XXX－全款YYYY」（只在格式1沒找到時）
      if (versionPrices.length === 0) {
        const p2 = /([^\n,、]{2,30}?)\s*[－\-–—]\s*全款\s*([\d,]+)/g;
        while ((match = p2.exec(pageText)) !== null) {
          const ver = match[1].trim().replace(/^[：:\s⫸]+/, '');
          const price = parseInt(match[2].replace(/,/g, ''));
          if (price > 0 && ver.length >= 1 && ver.length <= 30 && !versionPrices.find(v => v.version === ver)) {
            if (!/^\d+$/.test(ver) && !ver.includes('訂金') && !ver.includes('尾款') && !ver.includes('付款')) {
              versionPrices.push({ version: ver, price });
            }
          }
        }
      }

      // 格式3：從下拉選單/選項按鈕提取版本
      if (versionPrices.length === 0) {
        const options = document.querySelectorAll('select option, [class*="variant"] button, [class*="spec"] button');
        options.forEach(opt => {
          const text = opt.textContent || opt.innerText || '';
          const versionMatch = text.match(/(普通版|標準版|限定版|豪華版|DX版|EX版|SP版|[A-D]版|黑色版|白色版|透明版|特典版|大師版|精裝版|典藏版)/i);
          const priceMatch = text.match(/(?:全款|售價)?[：:\s]*(?:NT\$?|＄)?[\s]*([\d,]+)/);
          if (versionMatch && priceMatch) {
            const price = parseInt(priceMatch[1].replace(/,/g, ''));
            if (price > 1000 && price < 1000000 && !versionPrices.find(v => v.version === versionMatch[1])) {
              versionPrices.push({ version: versionMatch[1], price });
            }
          }
        });
      }

      // 格式4：如果沒找到版本格式，找獨立的「全款YYYY」
      if (versionPrices.length === 0) {
        const simplePattern = /(?:原價|售價|建議售價)?[－\-–—：:]*全款\s*([\d,]+)/g;
        while ((match = simplePattern.exec(pageText)) !== null) {
          const price = parseInt(match[1].replace(/,/g, ''));
          if (price > 0 && !versionPrices.find(v => v.price === price)) {
            versionPrices.push({ version: null, price });
          }
        }
      }

      // 解析規格尺寸中的比例
      const scaleMatch = descText.match(/規格尺寸[：:]\s*(1[/:](?:\d+))/);
      const scale = scaleMatch ? scaleMatch[1].replace(':', '/') : null;

      // 從詳情頁抓取高品質商品圖片
      let detailImage = '';
      // 優先從商品圖片輪播/主圖抓取
      const galleryImg = document.querySelector(
        '.product-gallery img, .product-image img, .slick-slide img, ' +
        '[class*="gallery"] img, [class*="Gallery"] img, ' +
        '[class*="product-photo"] img, [class*="ProductPhoto"] img, ' +
        '.boxify-image img'
      );
      if (galleryImg) {
        const srcset = galleryImg.getAttribute('srcset') || galleryImg.getAttribute('data-srcset') || '';
        if (srcset) {
          // 從 srcset 取最高解析度
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
      // 過濾無效圖片
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

// 快速爬取 SCC Toys（只爬前幾頁）
async function crawlSCCToys(browser) {
  console.log('\n🔍 快速爬取 SCC Toys...');
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    // 所有分類（與完整版爬蟲一致）
    const categories = [
      'https://www.scctoys.com.tw/products',
      'https://www.scctoys.com.tw/categories/gk%E7%8E%B0%E8%B2%A8',
      'https://www.scctoys.com.tw/categories/gk%E9%A0%90%E8%B3%BC',
      // 作品專區 GK
      'https://www.scctoys.com.tw/categories/one-piece-gk',
      'https://www.scctoys.com.tw/categories/dragon-ball-gk',
      'https://www.scctoys.com.tw/categories/pokemon-gk',
      'https://www.scctoys.com.tw/categories/naruto-gk',
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
    ];

    // 第一階段：從列表頁收集商品名稱、連結、圖片
    const allProducts = [];
    const seenLinks = new Set();

    for (const categoryUrl of categories) {
      const categoryName = decodeURIComponent(categoryUrl.split('/').pop());
      console.log(`\n  📂 分類: ${categoryName}`);

    const endPage = startPage + CONFIG.maxPages - 1;
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const url = `${categoryUrl}?page=${pageNum}`;
      console.log(`    📄 第 ${pageNum}/${endPage} 頁...`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(CONFIG.delay);

        await page.waitForSelector('.product-item, .product-card, [class*="product"]', { timeout: 10000 }).catch(() => {});

        // 滾動頁面以觸發懶加載圖片
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
        await sleep(1000);

        const products = await page.evaluate(() => {
          const items = [];
          const productElements = document.querySelectorAll('.product-item, .product-card, [class*="ProductCard"], [class*="product-list"] > div');

          productElements.forEach(el => {
            const nameEl = el.querySelector('h3, h4, .product-name, .product-title, [class*="title"], [class*="name"]');
            const name = nameEl?.textContent?.trim();

            const linkEl = el.querySelector('a[href*="product"]');
            const link = linkEl?.href;

            // 圖片
            let imageUrl = '';
            const imgEl = el.querySelector('img');
            if (imgEl) {
              imageUrl = imgEl.dataset.src || imgEl.dataset.original || imgEl.dataset.lazy || imgEl.dataset.lazySrc || imgEl.src || '';
              if (!imageUrl && imgEl.srcset) {
                const srcsetParts = imgEl.srcset.split(',');
                if (srcsetParts.length > 0) {
                  imageUrl = srcsetParts[0].trim().split(' ')[0];
                }
              }
            }
            if (!imageUrl) {
              const bgEl = el.querySelector('[style*="background-image"]');
              if (bgEl) {
                const style = bgEl.getAttribute('style') || '';
                const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
                if (bgMatch) imageUrl = bgMatch[1];
              }
            }

            if (imageUrl && !imageUrl.startsWith('http')) {
              imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://www.scctoys.com.tw' + imageUrl;
            }
            if (imageUrl && (imageUrl.includes('placeholder') || imageUrl.includes('loading') || imageUrl.includes('blank') || imageUrl.includes('data:image'))) {
              imageUrl = '';
            }

            if (name && name.length > 2) {
              items.push({ name, link: link || '', imageUrl: imageUrl || '' });
            }
          });

          return items;
        });

        const beforeCount = allProducts.length;
        for (const p of products) {
          if (p.link && !seenLinks.has(p.link)) {
            seenLinks.add(p.link);
            allProducts.push(p);
          }
        }
        const newCount = allProducts.length - beforeCount;
        console.log(`      找到 ${products.length} 個商品 (新增 ${newCount}, 累計 ${allProducts.length})`);

        if (products.length === 0) break;

      } catch (err) {
        console.log(`    ❌ 錯誤: ${err.message}`);
        break;
      }

      await sleep(CONFIG.delay);
    }
    } // end categories loop

    console.log(`\n  📦 共收集 ${allProducts.length} 個不重複商品連結`);

    // 第二階段：進入每個商品詳情頁取得全款價格和版本
    console.log(`\n  🔎 開始抓取 ${allProducts.length} 個商品詳情...`);

    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];

      let manufacturer = '';
      let cleanName = product.name;
      cleanName = cleanName.replace(/【[^】]*】/g, '').trim();

      const studioPatterns = [
        /^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室))?)\s+(.+)/i,
      ];

      for (const pattern of studioPatterns) {
        const match = cleanName.match(pattern);
        if (match && match[1].length <= 15) {
          manufacturer = match[1].trim();
          cleanName = match[2].trim();
          break;
        }
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
      const shouldExclude = CONFIG.excludeKeywords.some(kw =>
        lowerName.includes(kw.toLowerCase())
      );

      if (shouldExclude || finalName.length <= 2) continue;

      // 進入詳情頁取得版本、全款價格和高品質圖片
      let detailVersions = [];
      let detailMfg = '';
      let detailScale = null;
      let detailImage = '';

      if (product.link) {
        const detail = await scrapeProductDetail(page, product.link);
        detailVersions = detail.versionPrices;
        detailMfg = detail.manufacturer;
        detailScale = detail.scale;
        detailImage = detail.detailImage || '';
        await sleep(800);
      }

      // 優先使用詳情頁圖片，列表頁圖片作為備用
      const bestImage = detailImage || product.imageUrl || '';

      if (detailVersions.length > 0) {
        // 有多個版本，為每個版本建立獨立條目
        for (const vp of detailVersions) {
          const versionInfo = extractVersionInfo(finalName);
          const version = vp.version
            ? (versionInfo.version ? `${versionInfo.version} ${vp.version}` : vp.version)
            : versionInfo.version;

          results.push({
            name: finalName,
            manufacturer: detailMfg || manufacturer,
            original_price: vp.price,
            version: version,
            scale: detailScale || versionInfo.scale,
            image_url: bestImage,
            source: 'SCC Toys',
            tag,
          });
        }
        const verList = detailVersions.map(v => `${v.version || '預設'}=$${v.price}`).join(', ');
        const imgTag = detailImage ? '🖼️' : '📷';
        console.log(`    [${i + 1}/${allProducts.length}] ${finalName.slice(0, 25)}... ✅ ${imgTag} ${detailVersions.length} 個版本 (${verList})`);
      } else {
        // 沒有從詳情頁取到價格，不設定價格（避免存入訂金）
        const versionInfo = extractVersionInfo(finalName);
        results.push({
          name: finalName,
          manufacturer: detailMfg || manufacturer,
          original_price: null,
          version: versionInfo.version,
          scale: detailScale || versionInfo.scale,
          image_url: bestImage,
          source: 'SCC Toys',
          tag,
        });
        const imgTag = detailImage ? '🖼️' : '📷';
        console.log(`    [${i + 1}/${allProducts.length}] ${finalName.slice(0, 25)}... ⚠️ ${imgTag} 無全款價格`);
      }
    }
  } catch (err) {
    console.error('SCC Toys 爬取失敗:', err.message);
  } finally {
    await page.close();
  }
}

// 快速爬取 NightWind（只爬第一頁）
async function crawlNightWind(browser) {
  console.log('\n🔍 快速爬取 NightWind Shop...');
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto('https://www.nightwindshop.com/product/all', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    await page.waitForSelector('.pt_items_block, .pt_item', { timeout: 15000 }).catch(() => {});

    // 滾動頁面以觸發懶加載圖片
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
    await sleep(1000);

    const products = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('li .pt_items_block, .pt_item').forEach(el => {
        const nameEl = el.querySelector('.pt_title, h4, h5');
        const name = nameEl?.textContent?.trim();
        const originPriceEl = el.querySelector('.pt_origin, .js_origin_price');
        const salePriceEl = el.querySelector('.pt_sale, .js_pt_sale');
        const price = originPriceEl?.textContent?.trim() || salePriceEl?.textContent?.trim() || '';

        // 圖片 - 嘗試多種方式抓取
        let imageUrl = '';
        const imgEl = el.querySelector('img');
        if (imgEl) {
          imageUrl = imgEl.dataset.src || imgEl.dataset.original || imgEl.dataset.lazy || imgEl.dataset.lazySrc || imgEl.src || '';
          if (!imageUrl && imgEl.srcset) {
            const srcsetParts = imgEl.srcset.split(',');
            if (srcsetParts.length > 0) {
              imageUrl = srcsetParts[0].trim().split(' ')[0];
            }
          }
        }
        if (!imageUrl) {
          const bgEl = el.querySelector('[style*="background-image"]');
          if (bgEl) {
            const style = bgEl.getAttribute('style') || '';
            const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
            if (bgMatch) imageUrl = bgMatch[1];
          }
        }

        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://www.nightwindshop.com' + imageUrl;
        }
        if (imageUrl && (imageUrl.includes('placeholder') || imageUrl.includes('loading') || imageUrl.includes('blank') || imageUrl.includes('data:image'))) {
          imageUrl = '';
        }

        if (name && name.length > 2) items.push({ name, price, imageUrl: imageUrl || '' });
      });
      return items;
    });

    console.log(`  📄 找到 ${products.length} 個商品`);

    for (const product of products) {
      let priceNum = null;
      if (product.price) {
        const priceClean = product.price.replace(/[$\s]/g, '');
        const match = priceClean.match(/[\d,]+/);
        if (match) {
          priceNum = parseInt(match[0].replace(/,/g, ''));
          if (priceNum < 500 || priceNum > 10000000) priceNum = null;
        }
      }

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

  } catch (err) {
    console.error('NightWind 爬取失敗:', err.message);
  } finally {
    await page.close();
  }
}

// 主程式
async function main() {
  console.log('🚀 GK 公仔爬蟲啟動');
  console.log(`📋 設定: 第 ${startPage} ~ ${startPage + CONFIG.maxPages - 1} 頁${skipNightWind ? '（跳過 NightWind）' : ''}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await crawlSCCToys(browser);
    if (!skipNightWind) {
      await crawlNightWind(browser);
    }

    const finalCount = saveResults();
    console.log(`\n📊 總共爬取 ${results.length} 筆，去重後 ${finalCount} 筆`);
    console.log(`\n✅ 已儲存到: ${CONFIG.outputFile}`);

    // 自動匯入資料庫
    console.log('\n📥 自動匯入資料庫...');
    try {
      const { execSync } = require('child_process');
      execSync('node scripts/import-crawled.js --quick --update-prices', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        timeout: 600000,
      });
      console.log('\n✅ 匯入完成！');
    } catch (importErr) {
      console.error('\n❌ 匯入失敗:', importErr.message);
      console.log('💡 可手動執行: node scripts/import-crawled.js --quick --update-prices');
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
