/**
 * 解析 公仔價格 PDF 文字，整合成後台可匯入的 JSON 格式
 * 用法：node scripts/parse-pdf-prices.js
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

// 解析一行資料：「工作室 名稱（版本） 價格」
function parseLine(line) {
  line = line.trim();
  if (!line) return null;

  // 去掉序號前綴：「1.」「1、」「1.商品:」等
  line = line.replace(/^\d+[.、．]\s*/, '');
  line = line.replace(/^商品[:：]\s*/i, '');

  // 去掉「售」「出售」等前綴
  line = line.replace(/^(?:售|出售|賣)\s*/, '');

  // 提取價格（行尾的數字，可能有 $ 或 元）
  const priceMatch = line.match(/[\$＄]?\s*([\d,]+)\s*(?:元)?$/);
  if (!priceMatch) return null;

  const price = parseInt(priceMatch[1].replace(/,/g, ''));
  if (price < 300 || price > 200000) return null;

  // 去掉價格部分
  let rest = line.slice(0, line.lastIndexOf(priceMatch[0])).trim();
  // 去掉尾部的 $ 符號
  rest = rest.replace(/[\$＄\s]+$/, '').trim();

  if (!rest || rest.length < 2) return null;

  // 提取版本（括號內的文字）
  let version = null;
  const versionPatterns = [
    /[（(]([^）)]+)[）)]/g,  // 中英文括號
  ];

  const versions = [];
  for (const pattern of versionPatterns) {
    let m;
    while ((m = pattern.exec(rest)) !== null) {
      const v = m[1].trim();
      // 過濾非版本的括號內容
      if (v.includes('拆擺') || v.includes('全新') || v.includes('拆檢') ||
          v.includes('無損') || v.includes('回盒') || v.includes('不含') ||
          v.includes('含運') || v.includes('可議') || v.includes('售出') ||
          v.includes('暫售') || v.length > 20) continue;
      versions.push(v);
    }
  }
  if (versions.length > 0) {
    version = versions.join(' ');
    // 從名稱中移除版本括號
    for (const v of versions) {
      rest = rest.replace(`（${v}）`, '').replace(`(${v})`, '').trim();
    }
  }

  // 提取比例
  let scale = null;
  const scaleMatch = rest.match(/\b(1[\/:](?:1|2|3|4|5|6|7|8|10|12))\b/);
  if (scaleMatch) {
    scale = scaleMatch[1].replace(':', '/');
  }

  // 提取工作室（第一個空格前的文字，通常是英文或短中文）
  let manufacturer = null;
  let name = rest;

  // 常見格式：「工作室 名稱」
  const studioMatch = rest.match(/^([A-Za-z0-9\u4e00-\u9fff&.·]+(?:\s*(?:Studio|Studios|工作室|社|模玩))?)\s+(.+)/i);
  if (studioMatch && studioMatch[1].length <= 15 && studioMatch[1].length >= 1) {
    manufacturer = studioMatch[1].trim();
    name = studioMatch[2].trim();
  }

  // 清理名稱
  name = name.replace(/【[^】]*】/g, '').trim();
  name = name.replace(/\s+/g, ' ').trim();

  if (!name || name.length < 2) return null;

  // 過濾非公仔
  const excludeKeywords = ['裝飾畫', '冰箱貼', '海報', '掛畫', '貼紙', '桌墊', '滑鼠墊',
    '抱枕', '地毯', '毛毯', 'T恤', '衣服', '紀念鈔', '歷史本文', '指針'];
  if (excludeKeywords.some(kw => name.includes(kw))) return null;

  return {
    name,
    manufacturer,
    version,
    scale,
    market_price_min: price,
    market_price_max: price,
  };
}

// 解析整份 PDF 文字
function parseFullText(text) {
  const results = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // 嘗試合併下一行的價格（有時價格在下一行）
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (/^[\$＄]?\s*[\d,]+\s*(?:元)?$/.test(nextLine) && !/[\d]/.test(line.slice(-1))) {
        line = line + nextLine;
        i++; // 跳過下一行
      }
    }

    const parsed = parseLine(line);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

// 去重
function dedup(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.name}|${item.version || ''}`.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      // 取較高價格作為 max，較低作為 min
      const existing = seen.get(key);
      existing.market_price_min = Math.min(existing.market_price_min, item.market_price_min);
      existing.market_price_max = Math.max(existing.market_price_max, item.market_price_max);
    }
  }
  return Array.from(seen.values());
}

async function main() {
  const allResults = [];

  for (const fileName of ['公仔價格07.pdf', '公仔價格08.pdf']) {
    const filePath = path.join(__dirname, '..', fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️ 跳過: ${fileName} (不存在)`);
      continue;
    }

    console.log(`📄 解析: ${fileName}`);
    const buf = fs.readFileSync(filePath);
    const data = await pdf(buf);
    const items = parseFullText(data.text);
    console.log(`   找到 ${items.length} 筆資料`);
    allResults.push(...items);
  }

  // 去重
  const unique = dedup(allResults);
  console.log(`\n📊 合計: ${allResults.length} 筆，去重後: ${unique.length} 筆`);

  // 輸出 JSON（給後台 bulk-import 用）
  const jsonPath = path.join(__dirname, '..', 'pdf-import-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`✅ 已輸出: pdf-import-data.json`);

  // 也輸出 TSV 方便檢視
  const tsvPath = path.join(__dirname, '..', 'pdf-import-data.tsv');
  const header = '名稱\t工作室\t版本\t比例\t市場最低價\t市場最高價';
  const rows = unique.map(item =>
    `${item.name}\t${item.manufacturer || ''}\t${item.version || ''}\t${item.scale || ''}\t${item.market_price_min}\t${item.market_price_max}`
  );
  fs.writeFileSync(tsvPath, '\ufeff' + [header, ...rows].join('\n'), 'utf-8');
  console.log(`✅ 已輸出: pdf-import-data.tsv`);

  // 顯示前 20 筆
  console.log('\n📋 前 20 筆預覽:');
  for (const item of unique.slice(0, 20)) {
    const ver = item.version ? ` [${item.version}]` : '';
    const scl = item.scale ? ` (${item.scale})` : '';
    const mfg = item.manufacturer ? `${item.manufacturer} ` : '';
    console.log(`  ${mfg}${item.name}${ver}${scl} - $${item.market_price_min}~${item.market_price_max}`);
  }
}

main().catch(console.error);
