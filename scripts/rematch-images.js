/**
 * 從 crawler-output.csv 重新匹配圖片到資料庫
 *
 * 策略：
 * 1. 讀取 CSV 中所有商品名稱和圖片 URL
 * 2. 讀取資料庫中所有無圖片的公仔
 * 3. 用更精確的名稱匹配找到最佳對應
 * 4. 確保每張圖片只分配給一個公仔
 *
 * 使用方式：
 *   node scripts/rematch-images.js [--dry-run]
 */

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
const DRY_RUN = process.argv.includes('--dry-run');

// 已使用的圖片 URL（防止重複）
const usedImages = new Set();

// 清理名稱（用於匹配）
function cleanName(name) {
  return name
    .replace(/[「」『』【】《》（）()[\]{}｜|]/g, '')
    .replace(/[^\u4e00-\u9fffA-Za-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

// 計算兩個名稱的匹配分數
function matchScore(dbName, csvName, dbManufacturer, csvManufacturer) {
  const a = cleanName(dbName);
  const b = cleanName(csvName);

  if (a.length === 0 || b.length === 0) return 0;

  // 完全匹配
  if (a === b) return 1.0;

  // 一個包含另一個
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.7 + (shorter / longer) * 0.3;
  }

  // 字元級匹配（雙向）
  let forwardMatch = 0;
  for (const c of a) {
    if (b.includes(c)) forwardMatch++;
  }
  let backwardMatch = 0;
  for (const c of b) {
    if (a.includes(c)) backwardMatch++;
  }

  const forwardScore = a.length > 0 ? forwardMatch / a.length : 0;
  const backwardScore = b.length > 0 ? backwardMatch / b.length : 0;
  let score = (forwardScore + backwardScore) / 2;

  // 工作室匹配加分
  if (dbManufacturer && csvManufacturer) {
    const mA = cleanName(dbManufacturer);
    const mB = cleanName(csvManufacturer);
    if (mA && mB && (mA.includes(mB) || mB.includes(mA))) {
      score = Math.min(1.0, score + 0.15);
    }
  }

  return score;
}

async function main() {
  console.log('🖼️ 從 CSV 重新匹配公仔圖片');
  if (DRY_RUN) console.log('(DRY RUN 模式 - 不會實際更新)');

  // 讀取 CSV
  const csvPath = path.join(__dirname, '../crawler-output.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('找不到 crawler-output.csv');
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1); // 跳過標題

  // 解析 CSV 為商品列表
  const csvProducts = [];
  for (const line of dataLines) {
    const cols = line.split('\t');
    const name = cols[0]?.trim();
    const manufacturer = cols[1]?.trim() || '';
    const imageUrl = cols[5]?.trim() || '';

    if (name && imageUrl && imageUrl.startsWith('http')) {
      csvProducts.push({ name, manufacturer, imageUrl });
    }
  }
  console.log(`CSV 商品數: ${csvProducts.length} (有圖片的)`);

  // 去重 CSV 圖片 - 同一張圖只保留第一個出現的商品
  const uniqueImageProducts = [];
  const seenCsvImages = new Set();
  for (const p of csvProducts) {
    if (!seenCsvImages.has(p.imageUrl)) {
      seenCsvImages.add(p.imageUrl);
      uniqueImageProducts.push(p);
    }
  }
  console.log(`唯一圖片商品數: ${uniqueImageProducts.length}`);

  // 讀取資料庫中所有無圖片的公仔
  let dbFigures = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('figures')
      .select('id, name, manufacturer')
      .is('image_url', null)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    dbFigures = dbFigures.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`資料庫無圖片公仔: ${dbFigures.length}`);

  // 載入已使用的圖片
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('figures')
      .select('image_url')
      .not('image_url', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(f => usedImages.add(f.image_url));
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`已使用圖片數: ${usedImages.size}\n`);

  // 匹配策略：對每個 DB 公仔，找 CSV 中最佳匹配
  let matched = 0;
  let noMatch = 0;
  let duplicateSkip = 0;
  let lowScore = 0;
  const updates = []; // { id, imageUrl, dbName, csvName, score }

  for (const fig of dbFigures) {
    let bestScore = 0;
    let bestProduct = null;

    for (const csvProd of uniqueImageProducts) {
      // 跳過已使用的圖片
      if (usedImages.has(csvProd.imageUrl)) continue;

      const score = matchScore(fig.name, csvProd.name, fig.manufacturer, csvProd.manufacturer);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = csvProd;
      }
    }

    if (!bestProduct) {
      noMatch++;
      continue;
    }

    if (bestScore < 0.5) {
      lowScore++;
      continue;
    }

    // 標記圖片為已使用
    usedImages.add(bestProduct.imageUrl);
    updates.push({
      id: fig.id,
      imageUrl: bestProduct.imageUrl,
      dbName: fig.name,
      csvName: bestProduct.name,
      score: bestScore,
    });
    matched++;
  }

  console.log(`匹配結果:`);
  console.log(`  ✅ 匹配成功: ${matched}`);
  console.log(`  ❌ 無匹配: ${noMatch}`);
  console.log(`  ⚠️ 分數太低: ${lowScore}`);

  // 顯示部分匹配結果
  console.log(`\n前 30 個匹配:`);
  updates.slice(0, 30).forEach((u, i) => {
    console.log(`  ${i + 1}. [${(u.score * 100).toFixed(0)}%] "${u.dbName}" ← "${u.csvName}"`);
  });

  // 分數分布
  const scoreBuckets = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0 };
  for (const u of updates) {
    const pct = u.score * 100;
    if (pct >= 90) scoreBuckets['90-100']++;
    else if (pct >= 80) scoreBuckets['80-89']++;
    else if (pct >= 70) scoreBuckets['70-79']++;
    else if (pct >= 60) scoreBuckets['60-69']++;
    else scoreBuckets['50-59']++;
  }
  console.log(`\n分數分布:`);
  for (const [range, count] of Object.entries(scoreBuckets)) {
    console.log(`  ${range}%: ${count}`);
  }

  if (DRY_RUN) {
    console.log('\n(DRY RUN - 不更新資料庫)');
    return;
  }

  // 批次更新資料庫
  console.log(`\n正在更新 ${updates.length} 個公仔的圖片...`);
  let updated = 0;
  let updateErrors = 0;

  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);

    for (const u of batch) {
      const { error } = await supabase
        .from('figures')
        .update({ image_url: u.imageUrl })
        .eq('id', u.id);

      if (error) {
        updateErrors++;
      } else {
        updated++;
      }
    }

    console.log(`  已更新 ${Math.min(i + 50, updates.length)}/${updates.length}`);
  }

  console.log(`\n✅ 完成！更新 ${updated} 個，失敗 ${updateErrors} 個`);
}

main().catch(console.error);
