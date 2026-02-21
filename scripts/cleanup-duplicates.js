/**
 * 清理重複公仔 + 補上缺失的版本標註
 *
 * Case 1: 同名同價全無版本 → 刪除多餘（保留資料最完整的一筆）
 * Case 2: 同名不同價全無版本 → 用價格推斷版本
 * Case 3a: 部分有版本，無版本的跟某個有版本的同價 → 刪除無版本的（重複）
 * Case 3b: 部分有版本，無版本的價格跟所有版本都不同 → 補標版本
 *
 * 使用方式：
 *   node scripts/cleanup-duplicates.js           # 預覽模式
 *   node scripts/cleanup-duplicates.js --apply    # 實際執行
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const APPLY = process.argv.includes('--apply');

async function getAllFigures() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('figures')
      .select('id, name, version, scale, original_price, manufacturer, image_url')
      .order('name')
      .range(offset, offset + 999);
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

// 判斷哪筆資料更完整（用於保留）
function dataScore(item) {
  let score = 0;
  if (item.image_url) score += 10;
  if (item.image_url && item.image_url.includes('supabase.co')) score += 5; // admin 上傳的更有價值
  if (item.manufacturer) score += 3;
  if (item.original_price) score += 2;
  if (item.version) score += 2;
  if (item.scale) score += 1;
  return score;
}

async function main() {
  console.log(APPLY ? '🔧 執行模式：將實際修改資料庫' : '👀 預覽模式：不會修改資料庫（加 --apply 執行）');
  console.log('');

  const all = await getAllFigures();
  console.log(`📊 資料庫共 ${all.length} 筆公仔\n`);

  // 按 name 分組
  const nameMap = {};
  for (const f of all) {
    if (!nameMap[f.name]) nameMap[f.name] = [];
    nameMap[f.name].push(f);
  }

  const toDelete = [];
  const toUpdate = [];

  let case1Del = 0;
  let case2Fix = 0;
  let case3aDel = 0;
  let case3bFix = 0;

  for (const [name, items] of Object.entries(nameMap)) {
    if (items.length <= 1) continue;

    const noVer = items.filter(i => !i.version);
    const hasVer = items.filter(i => i.version);

    // === Case 1: 全部無版本 ===
    if (noVer.length === items.length) {
      // 按 price + scale 分組找真正重複
      const groups = {};
      for (const item of items) {
        const key = `${item.original_price || ''}|${item.scale || ''}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }

      for (const [key, dupes] of Object.entries(groups)) {
        if (dupes.length > 1) {
          // 保留資料最完整的
          dupes.sort((a, b) => dataScore(b) - dataScore(a));
          for (let i = 1; i < dupes.length; i++) {
            toDelete.push(dupes[i].id);
            case1Del++;
          }
        }
      }

      // 剩下不同價的補版本（Case 2）
      const remainingNoVer = items.filter(i => !toDelete.includes(i.id) && !i.version);
      if (remainingNoVer.length > 1) {
        const prices = [...new Set(remainingNoVer.map(i => i.original_price).filter(Boolean))];
        if (prices.length > 1) {
          prices.sort((a, b) => a - b);
          for (const item of remainingNoVer) {
            if (!item.original_price) continue;
            let label = null;
            if (prices.length === 2) {
              label = item.original_price === prices[0] ? '普通版' : '豪華版';
            } else if (prices.length === 3) {
              const idx = prices.indexOf(item.original_price);
              label = ['普通版', '精裝版', '豪華版'][idx];
            } else {
              const idx = prices.indexOf(item.original_price);
              label = String.fromCharCode(65 + idx) + '版';
            }
            if (label) {
              toUpdate.push({ id: item.id, version: label });
              case2Fix++;
            }
          }
        }
      }
      continue;
    }

    // === Case 3: 部分有版本，部分沒有 ===
    if (noVer.length > 0 && hasVer.length > 0) {
      for (const item of noVer) {
        // 3a: 無版本的價格跟某個有版本的相同 → 重複，刪除
        const samePrice = hasVer.find(v => v.original_price === item.original_price && v.scale === item.scale);
        if (samePrice) {
          // 比較資料完整度，保留更好的
          if (dataScore(item) > dataScore(samePrice)) {
            // 無版本的資料更好 → 把版本複製過來，刪掉有版本的
            toUpdate.push({ id: item.id, version: samePrice.version });
            toDelete.push(samePrice.id);
          } else {
            toDelete.push(item.id);
          }
          case3aDel++;
          continue;
        }

        // 3b: 價格不同 → 這是新版本，需要標註
        // 嘗試根據價格高低推斷
        if (item.original_price) {
          const allPrices = items.filter(i => i.original_price && !toDelete.includes(i.id)).map(i => i.original_price);
          const maxPrice = Math.max(...allPrices);
          const minPrice = Math.min(...allPrices);

          let label = null;
          if (item.original_price === maxPrice) {
            label = '頂配版';
          } else if (item.original_price === minPrice) {
            label = '基礎版';
          } else {
            label = `$${item.original_price}版`;
          }
          toUpdate.push({ id: item.id, version: label });
          case3bFix++;
        } else {
          // 沒價格的無版本條目，可能是多餘的
          const samePriceNull = hasVer.find(v => !v.original_price);
          if (samePriceNull) {
            toDelete.push(item.id);
            case3aDel++;
          }
        }
      }
    }
  }

  // 報告
  console.log('=== 清理計畫 ===');
  console.log(`🗑️ Case 1 刪除（同名同價全無版本的重複）: ${case1Del} 筆`);
  console.log(`🏷️ Case 2 補版本（同名不同價全無版本）: ${case2Fix} 筆`);
  console.log(`🗑️ Case 3a 刪除（無版本但跟有版本的同價）: ${case3aDel} 筆`);
  console.log(`🏷️ Case 3b 補版本（無版本且價格獨特）: ${case3bFix} 筆`);
  console.log(`\n總計: 刪除 ${toDelete.length} 筆, 補版本 ${toUpdate.length} 筆`);
  console.log('');

  // 範例
  const delExamples = all.filter(f => toDelete.includes(f.id)).slice(0, 10);
  if (delExamples.length > 0) {
    console.log('=== 刪除範例 ===');
    delExamples.forEach(d => console.log(`  🗑️ ${d.name.slice(0, 40)} | ver:${d.version || '空'} | $${d.original_price || '無'}`));
    console.log('');
  }
  const updExamples = toUpdate.slice(0, 15);
  if (updExamples.length > 0) {
    console.log('=== 補版本範例 ===');
    updExamples.forEach(u => {
      const fig = all.find(f => f.id === u.id);
      console.log(`  🏷️ ${fig.name.slice(0, 40)} | $${fig.original_price || '無'} → ${u.version}`);
    });
    console.log('');
  }

  // 執行
  if (APPLY) {
    if (toDelete.length > 0) {
      console.log(`\n🗑️ 正在刪除 ${toDelete.length} 筆...`);
      for (let i = 0; i < toDelete.length; i += 50) {
        const batch = toDelete.slice(i, i + 50);
        const { error } = await supabase.from('figures').delete().in('id', batch);
        if (error) console.error(`  ❌ 刪除失敗:`, error.message);
        else console.log(`  ✅ 已刪除 ${Math.min(i + 50, toDelete.length)}/${toDelete.length}`);
      }
    }

    if (toUpdate.length > 0) {
      console.log(`\n🏷️ 正在補版本 ${toUpdate.length} 筆...`);
      let ok = 0;
      for (const u of toUpdate) {
        const { error } = await supabase.from('figures').update({ version: u.version }).eq('id', u.id);
        if (!error) ok++;
      }
      console.log(`  ✅ 已更新 ${ok}/${toUpdate.length} 筆`);
    }

    console.log(`\n✅ 清理完成！資料庫剩餘約 ${all.length - toDelete.length} 筆`);
  } else {
    console.log('💡 確認無誤後執行: node scripts/cleanup-duplicates.js --apply');
  }
}

main().catch(console.error);
