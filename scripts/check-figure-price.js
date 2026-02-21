/**
 * 檢查公仔價格資料
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

// 要查詢的公仔名稱
const searchName = process.argv[2] || '五條悟';

async function checkFigure() {
  console.log(`\n🔍 搜尋公仔: "${searchName}"\n`);

  // 查詢公仔
  const { data: figures, error } = await supabase
    .from('figures')
    .select('id, name, market_price_min, market_price_max, original_price')
    .ilike('name', `%${searchName}%`)
    .limit(10);

  if (error) {
    console.error('查詢失敗:', error.message);
    return;
  }

  if (!figures || figures.length === 0) {
    console.log('找不到符合的公仔');
    return;
  }

  console.log(`找到 ${figures.length} 個符合的公仔:\n`);

  for (const figure of figures) {
    console.log(`📦 ${figure.name}`);
    console.log(`   ID: ${figure.id}`);
    console.log(`   原價: ${figure.original_price || '(無)'}`);
    console.log(`   市場最低價: ${figure.market_price_min}`);
    console.log(`   市場最高價: ${figure.market_price_max}`);

    // 查詢相關交易紀錄
    const { data: transactions } = await supabase
      .from('transactions')
      .select('price, created_at, source')
      .eq('figure_id', figure.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (transactions && transactions.length > 0) {
      console.log(`   交易紀錄 (最近 ${transactions.length} 筆):`);
      for (const tx of transactions) {
        const date = new Date(tx.created_at).toLocaleDateString('zh-TW');
        console.log(`     - ${date}: NT$ ${tx.price.toLocaleString()} ${tx.source ? `(${tx.source})` : ''}`);
      }
    } else {
      console.log('   交易紀錄: (無)');
    }
    console.log('');
  }
}

checkFigure().catch(console.error);
