/**
 * 找出 CSV 中缺失的連結，產生新的 links 檔案只包含這些缺失項
 */
const fs = require('fs');
const path = require('path');

const linksData = require('../crawler-links.json');
const csv = fs.readFileSync(path.join(__dirname, '../crawler-output.csv'), 'utf-8');
const csvLines = csv.split('\n').filter(l => l.trim());

// 從 CSV 建立已有商品的名稱集合（用清理後的名稱比對）
const csvNames = new Set();
for (const line of csvLines) {
  const cols = line.split('\t');
  if (cols[0]) {
    // 存完整名稱和前15字元做模糊比對
    csvNames.add(cols[0].trim());
  }
}

// 清理連結名稱（跟爬蟲一樣的邏輯）
function cleanLinkName(name) {
  let clean = name.replace(/【[^】]*】/g, '').trim();
  // 提取工作室和公仔名
  const studioMatch = clean.match(/^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室))?)\s+(.+)/i);
  if (studioMatch && studioMatch[1].length <= 15) {
    clean = studioMatch[2].trim();
  }
  // 移除系列標籤
  if (clean.includes('｜')) {
    clean = clean.split('｜')[0].trim();
  }
  return clean;
}

// 找出缺失的連結
const missing = [];
for (const link of linksData.links) {
  const cleanName = cleanLinkName(link.name);
  // 檢查 CSV 中是否有這個商品（用名稱前15字元模糊比對）
  const found = csvLines.some(line => {
    const csvName = line.split('\t')[0]?.trim();
    if (!csvName) return false;
    // 精確匹配或前15字元匹配
    if (csvName === cleanName) return true;
    if (cleanName.length >= 10 && csvName.includes(cleanName.slice(0, 10))) return true;
    if (csvName.length >= 10 && cleanName.includes(csvName.slice(0, 10))) return true;
    return false;
  });

  if (!found) {
    missing.push(link);
  }
}

console.log(`Total links: ${linksData.links.length}`);
console.log(`CSV entries: ${csvLines.length}`);
console.log(`Missing links: ${missing.length}`);

// 分類顯示
const categories = {
  'GK': missing.filter(m => m.name.includes('GK')),
  'PVC': missing.filter(m => m.name.includes('PVC')),
  '框畫/裝飾': missing.filter(m => m.name.includes('框畫') || m.name.includes('裝飾畫')),
  '其他': missing.filter(m => !m.name.includes('GK') && !m.name.includes('PVC') && !m.name.includes('框畫') && !m.name.includes('裝飾畫')),
};
for (const [cat, items] of Object.entries(categories)) {
  console.log(`  ${cat}: ${items.length}`);
}

// 儲存缺失連結為新的 links 檔案
const missingData = {
  site: linksData.site,
  links: missing,
  savedAt: new Date().toISOString(),
};
const outPath = path.join(__dirname, '../crawler-links-missing.json');
fs.writeFileSync(outPath, JSON.stringify(missingData, null, 2), 'utf-8');
console.log(`\nSaved to: crawler-links-missing.json`);
