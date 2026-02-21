/**
 * 修正公仔價格範圍
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('請設定環境變數');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 參數
const figureId = process.argv[2];
const newMin = parseInt(process.argv[3]);
const newMax = parseInt(process.argv[4]);

if (!figureId || isNaN(newMin) || isNaN(newMax)) {
  console.log('用法: node fix-figure-price.js <figure_id> <min_price> <max_price>');
  console.log('範例: node fix-figure-price.js 8556945f-ff6c-49e9-ac97-ca70f4bff4dc 32000 38000');
  process.exit(1);
}

async function fixPrice() {
  console.log(`\n🔧 修正公仔價格...`);
  console.log(`   ID: ${figureId}`);
  console.log(`   新最低價: ${newMin}`);
  console.log(`   新最高價: ${newMax}`);

  const { data, error } = await supabase
    .from('figures')
    .update({
      market_price_min: newMin,
      market_price_max: newMax,
    })
    .eq('id', figureId)
    .select('name, market_price_min, market_price_max')
    .single();

  if (error) {
    console.error('\n❌ 更新失敗:', error.message);
    return;
  }

  console.log(`\n✅ 更新成功！`);
  console.log(`   公仔: ${data.name}`);
  console.log(`   市場價格: NT$ ${data.market_price_min.toLocaleString()} - ${data.market_price_max.toLocaleString()}`);
}

fixPrice().catch(console.error);
