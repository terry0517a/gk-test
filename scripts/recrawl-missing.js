/**
 * 重爬遺漏商品腳本
 * 比對 crawler-links.json 和 crawler-output.csv，找出遺漏的商品並重新爬取
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  linksFile: path.join(__dirname, '../crawler-links.json'),
  outputFile: path.join(__dirname, '../crawler-output.csv'),
  progressFile: path.join(__dirname, '../crawler-progress.json'),
  delay: 2000,
  maxRetries: 3,
  retryDelay: 5000,
  batchSize: 30,
  batchDelay: 8000,
  excludeKeywords: [
    '裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙', '徽章', '鑰匙圈', '吊飾',
    '燈帶畫', '地毯', '毛毯', '午睡毯', '桌墊', '滑鼠墊', '抱枕',
    '春聯', '對聯', '紅包袋', '福袋', '明信片', '書籤', '遮陽',
    '框畫', 'T恤', 'T-shirt', 'Tshirt', '短袖', '長袖', '上衣', '帽T',
    '衛衣', '外套', '褲', '襪', '鞋', '衣服', '服飾', '服裝',
    'poster', 'keychain', 'badge', 'carpet', 'blanket', 'mousepad'
  ],
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 進度更新
function updateProgress(updates) {
  try {
    const progress = JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf-8'));
    Object.assign(progress, updates);
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
  } catch {
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(updates, null, 2), 'utf-8');
  }
}

// 版本提取（複製自 crawler.js）
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
    { pattern: /DX版|DX/gi, name: 'DX版' },
    { pattern: /EX版|EX/gi, name: 'EX版' },
    { pattern: /高配版?|高配/gi, name: '高配版' },
    { pattern: /低配版?|低配/gi, name: '低配版' },
    { pattern: /頂配版?|頂配/gi, name: '頂配版' },
    { pattern: /電鍍版|電鍍/gi, name: '電鍍版' },
  ];

  for (const { pattern, name: verName } of colorVersions) {
    if (pattern.test(baseName)) version.push(verName);
  }
  for (const { pattern, name: verName } of limitedVersions) {
    if (pattern.test(baseName)) version.push(verName);
  }

  return { baseName, version: version.length > 0 ? version.join(' ') : null, scale };
}

// 清理商品名稱（複製自 crawler.js 的邏輯）
function cleanProductName(rawName) {
  let cleanName = rawName;
  let manufacturer = '';
  let tag = '';

  // 移除 【...】
  cleanName = cleanName.replace(/【[^】]*】/g, '').trim();

  // 提取工作室名稱
  const studioMatch = cleanName.match(/^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室))?)\s+(.+)/i);
  if (studioMatch && studioMatch[1].length <= 15) {
    manufacturer = studioMatch[1].trim();
    cleanName = studioMatch[2].trim();
  }

  // 從 ｜ 後面提取標籤
  if (cleanName.includes('｜')) {
    const parts = cleanName.split('｜');
    cleanName = parts[0].trim();
    tag = parts[1] ? parts[1].trim() : '';
  }

  return { name: cleanName || rawName, manufacturer, tag };
}

async function main() {
  console.log('🔍 重爬遺漏商品腳本');
  console.log('================================\n');

  // 1. 讀取所有連結
  if (!fs.existsSync(CONFIG.linksFile)) {
    console.error('❌ 找不到 crawler-links.json');
    process.exit(1);
  }

  const linksData = JSON.parse(fs.readFileSync(CONFIG.linksFile, 'utf-8'));
  const allLinks = linksData.links;
  console.log(`📂 連結總數: ${allLinks.length}`);

  // 2. 讀取現有 CSV，建立已有商品的完整名稱集合
  // 用「廠商+名稱」合併後的完整字串做比對（與連結名稱清理後一致）
  const existingFullNames = new Set();

  if (fs.existsSync(CONFIG.outputFile)) {
    const csvContent = fs.readFileSync(CONFIG.outputFile, 'utf-8');
    const csvLines = csvContent.split('\n').filter(l => l.trim());
    // CSV 欄位: 名稱\t工作室\t原價\t版本\t比例\t圖片\t來源\t標籤
    for (let i = 1; i < csvLines.length; i++) {
      const cols = csvLines[i].split('\t');
      const name = (cols[0] || '').trim();
      const mfg = (cols[1] || '').trim();
      // 合併為完整名稱（與連結清理後的格式一致）
      const fullName = (mfg ? mfg + ' ' + name : name).toLowerCase().replace(/\s+/g, '');
      existingFullNames.add(fullName);
    }
    console.log(`📄 CSV 已有: ${existingFullNames.size} 個不重複商品`);
  }

  // 3. 找出遺漏的連結（使用 cleanProductName 統一比對邏輯）
  const missingLinks = [];
  for (const link of allLinks) {
    // 檢查原始名稱是否應排除
    const lowerName = link.name.toLowerCase();
    if (CONFIG.excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()))) continue;

    // 用與 CSV 相同的 cleanProductName 清理名稱
    const { name: cleanName, manufacturer } = cleanProductName(link.name);

    // 清理後的名稱也要檢查排除關鍵字
    const cleanLower = cleanName.toLowerCase();
    if (CONFIG.excludeKeywords.some(kw => cleanLower.includes(kw.toLowerCase()))) continue;

    // 用與 CSV 相同的格式比對：manufacturer + name
    const fullName = (manufacturer ? manufacturer + ' ' + cleanName : cleanName).toLowerCase().replace(/\s+/g, '');
    // 也比對不含工作室的名稱（防止 CSV 中工作室欄位為空的情況）
    const nameOnly = cleanName.toLowerCase().replace(/\s+/g, '');

    if (!existingFullNames.has(fullName) && !existingFullNames.has(nameOnly)) {
      missingLinks.push(link);
    }
  }

  console.log(`❓ 遺漏商品: ${missingLinks.length} 個\n`);

  if (missingLinks.length === 0) {
    console.log('✅ 沒有遺漏的商品！');
    return;
  }

  // 4. 啟動瀏覽器重爬
  console.log('🚀 啟動瀏覽器...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const newResults = [];
  let processed = 0;
  let successCount = 0;
  let errorCount = 0;
  const failedLinks = [];

  updateProgress({
    status: 'running',
    phase: '重爬遺漏商品',
    site: 'SCC Toys (補爬)',
    current: 0,
    total: missingLinks.length,
    collected: missingLinks.length,
    success: 0,
    errors: 0,
    currentItem: '',
    startTime: new Date().toISOString(),
    message: `開始重爬 ${missingLinks.length} 個遺漏商品...`,
  });

  for (const product of missingLinks) {
    processed++;

    updateProgress({
      current: processed,
      total: missingLinks.length,
      success: successCount,
      errors: errorCount,
      currentItem: product.name.slice(0, 30),
      message: `[${processed}/${missingLinks.length}] ${product.name.slice(0, 30)}`,
    });

    // 批次休息
    if (processed > 1 && (processed - 1) % CONFIG.batchSize === 0) {
      console.log(`  🛑 批次休息... (${processed - 1}/${missingLinks.length})`);
      await sleep(CONFIG.batchDelay);
    }

    let detailPage = null;
    let pageSuccess = false;

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        detailPage = await browser.newPage();
        await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await detailPage.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(CONFIG.delay);
        pageSuccess = true;
        break;
      } catch (err) {
        if (detailPage) {
          await detailPage.close().catch(() => {});
          detailPage = null;
        }
        if (attempt < CONFIG.maxRetries) {
          console.log(`    ⚠️ 重試 ${attempt}/${CONFIG.maxRetries}: ${product.name.slice(0, 25)}`);
          await sleep(CONFIG.retryDelay);
        }
      }
    }

    if (!pageSuccess) {
      failedLinks.push(product);
      errorCount++;
      if (processed % 50 === 0) {
        console.log(`  進度: ${processed}/${missingLinks.length} (成功 ${successCount}, 失敗 ${errorCount})`);
      }
      continue;
    }

    try {
      // 詳情頁擷取（與 crawler.js 相同邏輯）
      const detailInfo = await detailPage.evaluate(() => {
        const allText = document.body.innerText;
        const variants = [];

        // 圖片
        let betterImage = '';
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) betterImage = ogImage.content;

        if (!betterImage) {
          const imgSelectors = [
            '.product-gallery img', '.product-image img', '.swiper-slide img',
            '[class*="carousel"] img', '.product-photo img',
            '[class*="product"] img[src*="cdn"]', '[class*="product"] img[src*="shopline"]'
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

        const badImageIds = ['6507db252d6cbb001a7fd12d', '6527981f1c9e590020ad939f'];
        if (betterImage && badImageIds.some(id => betterImage.includes(id))) betterImage = '';

        const fakePriceLabels = ['建議售價', '售價', '原價', '優惠價', '先行優惠價',
          '特價', '定價', '預購價', '現貨價', '團購價', '早鳥價', '預售價',
          '付款方式', '運費', '訂金', '尾款'];
        const merchandiseKeywords = ['冰箱貼', '毛毯', '午睡毯', '地毯', '裝飾畫',
          '掛畫', '海報', '桌墊', '滑鼠墊', '抱枕', '貼紙', 'T恤', '衣服',
          '鑰匙扣', '鑰匙圈', '徽章', '胸針', '馬克杯', '杯墊'];

        function isRealVersion(ver) {
          if (fakePriceLabels.some(label => ver.includes(label))) return false;
          if (merchandiseKeywords.some(kw => ver.includes(kw))) return false;
          return true;
        }

        let defaultPrice = null;

        // 下拉選單
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

        // 文字中的版本價格
        const generalVersionPattern = /([\w\u4e00-\u9fff+（）()／/ ·&×＆]+?)\s*[－\-–—：:]\s*全款\s*([\d,]+)/g;
        let vMatch;
        while ((vMatch = generalVersionPattern.exec(allText)) !== null) {
          const ver = vMatch[1].trim();
          const price = parseInt(vMatch[2].replace(/,/g, ''));
          if (price > 0 && ver.length >= 1 && ver.length <= 40 && !variants.some(v => v.version === ver && v.price === price)) {
            if (isRealVersion(ver)) {
              variants.push({ version: ver, price });
            } else if (!defaultPrice || price > defaultPrice) {
              defaultPrice = price;
            }
          }
        }

        // 更寬鬆的模式
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

        // 預設價格
        if (!defaultPrice) {
          const fullPriceMatch = allText.match(/全款[：:\s]*(?:NT\$?|＄|TWD)?[\s]*([\d,]+)/i);
          if (fullPriceMatch) defaultPrice = parseInt(fullPriceMatch[1].replace(/,/g, ''));
        }

        if (!defaultPrice) {
          const priceMatches = allText.match(/(?:NT\$?|＄|TWD)[\s]*([\d,]+)/gi) || [];
          let maxPrice = 0;
          for (const p of priceMatches) {
            const num = parseInt(p.replace(/[^\d]/g, ''));
            if (num > maxPrice && num < 1000000) maxPrice = num;
          }
          if (maxPrice > 0) defaultPrice = maxPrice;
        }

        return { defaultPrice, betterImage, variants: variants.length > 0 ? variants : null };
      });

      // 處理商品名稱
      const { name: finalName, manufacturer, tag } = cleanProductName(product.name);
      const lowerName = finalName.toLowerCase();
      const shouldExclude = CONFIG.excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()));

      if (!shouldExclude && finalName.length > 2) {
        const versionInfo = extractVersionInfo(finalName);
        const placeholderIds = ['6507db252d6cbb001a7fd12d', '6527981f1c9e590020ad939f', 'placeholder', 'default', 'loading'];
        let finalImageUrl = detailInfo.betterImage || product.imageUrl || '';
        if (finalImageUrl && placeholderIds.some(id => finalImageUrl.includes(id))) finalImageUrl = '';

        const source = product.link.includes('nightwind') ? 'NightWind Shop' : 'SCC Toys';

        if (detailInfo.variants && detailInfo.variants.length > 0) {
          for (const variant of detailInfo.variants) {
            newResults.push({
              name: finalName, manufacturer, original_price: variant.price,
              version: variant.version, scale: versionInfo.scale,
              image_url: finalImageUrl, source, tag,
            });
            successCount++;
          }
        } else {
          newResults.push({
            name: finalName, manufacturer, original_price: detailInfo.defaultPrice,
            version: versionInfo.version, scale: versionInfo.scale,
            image_url: finalImageUrl, source, tag,
          });
          successCount++;
        }
      }

      // 定期輸出進度
      if (processed % 50 === 0) {
        console.log(`  進度: ${processed}/${missingLinks.length} (成功 ${successCount}, 失敗 ${errorCount})`);
        // 定期儲存結果
        appendResults(newResults);
      }
    } catch (err) {
      failedLinks.push(product);
      errorCount++;
    } finally {
      if (detailPage) await detailPage.close().catch(() => {});
    }
  }

  // 最終儲存
  appendResults(newResults);

  await browser.close();

  // 儲存失敗連結
  if (failedLinks.length > 0) {
    const failedFile = path.join(__dirname, '../crawler-recrawl-failed.json');
    fs.writeFileSync(failedFile, JSON.stringify({
      site: 'recrawl-missing',
      count: failedLinks.length,
      links: failedLinks,
      savedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    console.log(`\n❌ ${failedLinks.length} 個連結仍失敗，已儲存到 crawler-recrawl-failed.json`);
  }

  updateProgress({
    status: 'completed',
    phase: '補爬完成',
    current: processed,
    total: missingLinks.length,
    success: successCount,
    errors: errorCount,
    message: `補爬完成！成功 ${successCount} 筆，失敗 ${errorCount} 筆`,
  });

  console.log(`\n================================`);
  console.log(`📊 補爬完成！`);
  console.log(`   處理: ${processed} 個商品`);
  console.log(`   成功: ${successCount} 筆`);
  console.log(`   失敗: ${errorCount} 個`);
  console.log(`================================`);
}

// 追加結果到 CSV（不覆蓋現有資料）
function appendResults(results) {
  if (results.length === 0) return;

  // 去重
  const seen = new Set();
  const unique = [];
  for (const item of results) {
    const key = `${item.name}|${item.version || ''}|${item.scale || ''}`.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // 讀取現有 CSV
  let existingContent = '';
  if (fs.existsSync(CONFIG.outputFile)) {
    existingContent = fs.readFileSync(CONFIG.outputFile, 'utf-8');
  }

  // 追加新行
  const newRows = unique.map(item =>
    `${item.name}\t${item.manufacturer}\t${item.original_price || ''}\t${item.version || ''}\t${item.scale || ''}\t${item.image_url || ''}\t${item.source}\t${item.tag || ''}`
  );

  // 確保現有內容以換行結尾
  if (existingContent && !existingContent.endsWith('\n')) {
    existingContent += '\n';
  }

  fs.writeFileSync(CONFIG.outputFile, existingContent + newRows.join('\n') + '\n', 'utf-8');
  console.log(`  💾 已追加 ${unique.length} 筆到 CSV`);
}

main().catch(err => {
  console.error('❌ 腳本錯誤:', err);
  updateProgress({ status: 'error', message: err.message });
  process.exit(1);
});
