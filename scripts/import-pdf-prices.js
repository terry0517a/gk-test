/**
 * 匯入 PDF 市場價格到資料庫
 * 用法：node scripts/import-pdf-prices.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const jsonPath = path.join(__dirname, '..', 'pdf-import-data.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ pdf-import-data.json 不存在，請先執行 parse-pdf-prices.js');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📄 載入 ${data.length} 筆 PDF 市場價格資料`);

  let updated = 0;
  let notFound = 0;
  let noChange = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const pct = ((i / data.length) * 100).toFixed(1);

    // 用名稱模糊搜尋現有公仔
    let query = supabase
      .from('figures')
      .select('id, name, manufacturer, version, market_price_min, market_price_max')
      .ilike('name', `%${item.name}%`);

    // 如果有版本，進一步篩選
    if (item.version) {
      query = query.ilike('version', `%${item.version}%`);
    }

    const { data: matches, error } = await query.limit(5);

    if (error) {
      console.log(`  ❌ 查詢失敗: ${item.name} - ${error.message}`);
      continue;
    }

    if (!matches || matches.length === 0) {
      notFound++;
      if (i % 20 === 0) {
        process.stdout.write(`  [${pct}%] ⏭️ 找不到: ${item.name}${item.version ? ` [${item.version}]` : ''}\n`);
      }
      continue;
    }

    // 找最匹配的（名稱最接近的）
    let best = matches[0];
    for (const m of matches) {
      // 精確名稱匹配優先
      if (m.name === item.name) { best = m; break; }
      // 工作室也匹配的優先
      if (item.manufacturer && m.manufacturer && m.manufacturer.includes(item.manufacturer)) {
        best = m;
      }
    }

    // 更新市場價格
    const updates = {};
    if (item.market_price_min) {
      const currentMin = best.market_price_min;
      if (!currentMin || item.market_price_min < currentMin) {
        updates.market_price_min = item.market_price_min;
      }
    }
    if (item.market_price_max) {
      const currentMax = best.market_price_max;
      if (!currentMax || item.market_price_max > currentMax) {
        updates.market_price_max = item.market_price_max;
      }
    }

    // 如果完全沒有市場價格，直接設定
    if (!best.market_price_min && item.market_price_min) {
      updates.market_price_min = item.market_price_min;
    }
    if (!best.market_price_max && item.market_price_max) {
      updates.market_price_max = item.market_price_max;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('figures')
        .update(updates)
        .eq('id', best.id);

      if (!updateError) {
        updated++;
        if (updated % 20 === 0 || updated <= 5) {
          console.log(`  [${pct}%] ✅ 更新: ${best.name}${best.version ? ` [${best.version}]` : ''} → $${updates.market_price_min || best.market_price_min}~${updates.market_price_max || best.market_price_max}`);
        }
      }
    } else {
      noChange++;
    }
  }

  console.log('\n========================================');
  console.log('📊 PDF 市場價格匯入完成！');
  console.log(`   更新: ${updated} 筆`);
  console.log(`   無變更: ${noChange} 筆`);
  console.log(`   找不到: ${notFound} 筆`);
  console.log('========================================');
}

main().catch(console.error);
