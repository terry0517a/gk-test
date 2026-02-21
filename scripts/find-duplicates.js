/**
 * 找出資料庫中的重複公仔，並刪除多餘的（保留較完整的那筆）
 * 用法：node scripts/find-duplicates.js          (只顯示重複)
 *       node scripts/find-duplicates.js --delete  (刪除重複)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const doDelete = process.argv.includes('--delete');

async function main() {
  // 取得所有公仔
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('figures')
      .select('id, name, manufacturer, version, scale, original_price, image_url, market_price_min, market_price_max, created_at')
      .range(from, from + pageSize - 1);
    if (error) { console.log('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    from += pageSize;
  }
  console.log(`Total figures: ${all.length}`);

  // 分組：相同 name + version + manufacturer = 重複
  const groups = new Map();
  for (const fig of all) {
    const name = (fig.name || '').trim().toLowerCase();
    const version = (fig.version || '').trim().toLowerCase();
    const mfg = (fig.manufacturer || '').trim().toLowerCase();
    const key = `${name}|${version}|${mfg}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fig);
  }

  // 找出有重複的組
  const dupes = [];
  for (const [key, items] of groups) {
    if (items.length > 1) {
      dupes.push({ key, items });
    }
  }

  let totalExtra = 0;
  for (const d of dupes) {
    totalExtra += d.items.length - 1;
  }

  console.log(`Duplicate groups: ${dupes.length}`);
  console.log(`Extra duplicate items to remove: ${totalExtra}`);

  if (dupes.length === 0) {
    console.log('No duplicates found!');
    return;
  }

  // 顯示前 30 組
  console.log('\nSample duplicates:');
  dupes.slice(0, 30).forEach(d => {
    const sample = d.items[0];
    console.log(`  [${d.items.length}x] ${sample.manufacturer || '?'} ${sample.name} ${sample.version ? '[' + sample.version + ']' : ''}`);
  });

  if (!doDelete) {
    console.log('\nRun with --delete to remove duplicates');
    return;
  }

  // 刪除重複 - 保留資料最完整的那筆
  console.log('\nDeleting duplicates...');
  let deleted = 0;

  for (const d of dupes) {
    // 排序：有圖片 > 有價格 > 有市場價 > 較新的
    const sorted = d.items.sort((a, b) => {
      // 有圖片的優先
      const aImg = a.image_url ? 1 : 0;
      const bImg = b.image_url ? 1 : 0;
      if (aImg !== bImg) return bImg - aImg;

      // 有原價的優先
      const aPrice = a.original_price ? 1 : 0;
      const bPrice = b.original_price ? 1 : 0;
      if (aPrice !== bPrice) return bPrice - aPrice;

      // 有市場價的優先
      const aMarket = a.market_price_min ? 1 : 0;
      const bMarket = b.market_price_min ? 1 : 0;
      if (aMarket !== bMarket) return bMarket - aMarket;

      // 較新的優先
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // 保留第一筆（最完整），刪除其餘
    const keep = sorted[0];
    const removeIds = sorted.slice(1).map(f => f.id);

    // 先刪除相關的交易記錄
    await supabase.from('transactions').delete().in('figure_id', removeIds);

    // 刪除重複公仔
    const { error } = await supabase.from('figures').delete().in('id', removeIds);
    if (error) {
      console.log(`  Error deleting: ${keep.name} - ${error.message}`);
    } else {
      deleted += removeIds.length;
    }

    if (deleted % 100 === 0 && deleted > 0) {
      console.log(`  Progress: ${deleted} deleted...`);
    }
  }

  console.log(`\nDone! Deleted ${deleted} duplicate items.`);
  console.log(`Remaining figures: ${all.length - deleted}`);
}

main().catch(console.error);
