/**
 * 匯入爬蟲資料到資料庫
 */

const fs = require('fs');
const path = require('path');

// Supabase 設定 - 從環境變數或 .env.local 讀取
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 優先使用 service role key（繞過 RLS），否則用 anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 請設定 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 檢查是否為快速匯入模式
const isQuickMode = process.argv.includes('--quick');
// 檢查是否強制更新價格（覆蓋舊的預購價）
const forceUpdatePrice = process.argv.includes('--update-prices');
// 覆蓋模式：新資料有值就覆蓋舊資料（仍保護 admin 上傳的圖片）
const overwriteMode = process.argv.includes('--overwrite');
const csvFileName = isQuickMode ? 'crawler-output-quick.csv' : 'crawler-output.csv';

// 讀取 CSV 檔案
const csvPath = path.join(__dirname, '..', csvFileName);

if (!fs.existsSync(csvPath)) {
  console.error(`❌ 找不到檔案: ${csvFileName}`);
  console.log('   請先執行爬蟲腳本');
  process.exit(1);
}

console.log(`📂 模式: ${isQuickMode ? '快速匯入（最新商品）' : '完整匯入'}`);
if (overwriteMode) {
  console.log(`🔄 覆蓋模式：新資料有值就覆蓋舊資料（保護 admin 上傳的圖片）`);
} else if (forceUpdatePrice) {
  console.log(`💰 強制更新價格模式：將覆蓋舊的預購價為全款價格`);
}
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// 解析 CSV (Tab 分隔)
const lines = csvContent.split('\n').filter(line => line.trim());
const header = lines[0].replace(/^\ufeff/, ''); // 移除 BOM
const dataLines = lines.slice(1);

console.log(`📄 讀取到 ${dataLines.length} 筆資料`);

// 版本模糊匹配：判斷兩個版本字串是否指同一版本
function versionsMatch(dbVersion, crawlVersion) {
  if (dbVersion === crawlVersion) return true;
  if (!dbVersion && !crawlVersion) return true;
  if (!dbVersion || !crawlVersion) return false;
  const a = dbVersion.toLowerCase().replace(/\s+/g, '');
  const b = crawlVersion.toLowerCase().replace(/\s+/g, '');
  // 互相包含
  if (a.includes(b) || b.includes(a)) return true;
  // 核心關鍵字匹配（兩邊都包含同一關鍵字就算匹配）
  const keywords = ['高配', '低配', '頂配', '簡配', '豪華', '標準', '限定', '限量',
    '黑色', '白色', '透明', '夜光', '金色', '銀色', '戰損', '原色', '電鍍',
    '首批', '特典', '收藏', '典藏', '精裝', '特裝', '進階', '基礎', '大師',
    'dx', 'ex', 'sp', 'premium', 'resin', 'pvc'];
  for (const kw of keywords) {
    if (a.includes(kw) && b.includes(kw)) return true;
  }
  return false;
}

async function importData() {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const cols = line.split('\t');
    const name = cols[0]?.trim();
    const manufacturer = cols[1]?.trim() || null;
    const originalPrice = cols[2]?.trim() ? parseInt(cols[2].replace(/,/g, '')) : null;
    const version = cols[3]?.trim() || null;
    const scale = cols[4]?.trim() || null;
    const imageUrl = cols[5]?.trim() || null;  // 圖片欄位
    const tag = cols[7]?.trim() || null;       // 標籤欄位（第 8 欄）

    if (!name) continue;

    // 過濾掉裝飾畫、冰箱貼等非公仔商品
    const excludeKeywords = ['裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙'];
    if (excludeKeywords.some(kw => name.includes(kw))) {
      console.log(`  ⏭️ 跳過非公仔: ${name}`);
      skipped++;
      continue;
    }

    // 檢查是否在封鎖名單（已刪除的資料）
    // 如果表格不存在則跳過檢查
    try {
      const { data: blocked, error: blockedError } = await supabase
        .from('blocked_figures')
        .select('id')
        .ilike('name', `%${name.slice(0, 15)}%`)
        .limit(1);

      if (!blockedError && blocked && blocked.length > 0) {
        console.log(`  🚫 已封鎖: ${name}`);
        skipped++;
        continue;
      }
    } catch (e) {
      // 表格不存在，繼續處理
    }

    // === 匹配邏輯：精確名稱 → 模糊名稱，版本在 JS 端模糊比對 ===
    const selectCols = 'id, original_price, manufacturer, version, scale, image_url, tag';

    // 1. 先用精確名稱查詢
    let { data: candidates } = await supabase
      .from('figures')
      .select(selectCols)
      .eq('name', name)
      .limit(10);

    // 2. 精確沒找到 → 模糊匹配（前 25 字）
    if (!candidates || candidates.length === 0) {
      const { data } = await supabase
        .from('figures')
        .select(selectCols)
        .ilike('name', `%${name.slice(0, 25)}%`)
        .limit(10);
      candidates = data || [];
    }

    // 3. 在 JS 端做版本模糊匹配
    let existing = null;

    if (candidates && candidates.length > 0) {
      if (version) {
        // 有版本 → 找版本匹配的
        const verMatches = candidates.filter(e => versionsMatch(e.version, version));
        if (verMatches.length > 0) {
          const scaleMatch = verMatches.find(e => e.scale === scale);
          existing = [scaleMatch || verMatches[0]];
        } else {
          // 沒找到版本匹配 → 找無版本的來更新版本
          const noVerMatches = candidates.filter(e => !e.version);
          if (noVerMatches.length > 0) {
            let bestMatch = null;
            let bestDiff = Infinity;
            for (const m of noVerMatches) {
              if (m.original_price && originalPrice) {
                const diff = Math.abs(m.original_price - originalPrice);
                if (diff < bestDiff) { bestDiff = diff; bestMatch = m; }
              } else if (!m.original_price && !bestMatch) {
                bestMatch = m;
              }
            }
            if (bestMatch && (!originalPrice || !bestMatch.original_price || bestDiff / originalPrice < 0.1)) {
              bestMatch._updateVersion = true;
              existing = [bestMatch];
            }
          }
        }
      } else {
        // 沒版本 → 找也沒版本的
        const noVerMatches = candidates.filter(e => !e.version);
        if (noVerMatches.length > 0) {
          const scaleMatch = noVerMatches.find(e => e.scale === scale);
          existing = [scaleMatch || noVerMatches[0]];
        }
      }
    }

    if (existing && existing.length > 0) {
      // 更新欄位
      const updates = {};

      if (overwriteMode) {
        // 覆蓋模式：新資料有值就覆蓋
        if (originalPrice) updates.original_price = originalPrice;
        if (manufacturer) updates.manufacturer = manufacturer;
        if (scale) updates.scale = scale;
        if (tag) updates.tag = tag;
        if (version) updates.version = version;
        // 圖片：仍保護 admin 上傳的（supabase.co）
        if (imageUrl && !(existing[0].image_url && existing[0].image_url.includes('supabase.co'))) {
          updates.image_url = imageUrl;
        }
      } else {
        // 原本邏輯：只更新空欄位
        // 更新版本（從無版本 → 有版本）
        if (existing[0]._updateVersion && version) {
          updates.version = version;
        }

        // 更新原價：如果是強制更新模式或舊資料沒有原價
        if (originalPrice && (!existing[0].original_price || forceUpdatePrice)) {
          updates.original_price = originalPrice;
        }
        if (!existing[0].manufacturer && manufacturer) {
          updates.manufacturer = manufacturer;
        }
        if (!existing[0].scale && scale) {
          updates.scale = scale;
        }
        if (tag && !existing[0].tag) {
          updates.tag = tag;
        }
        if (imageUrl && existing[0].image_url !== imageUrl) {
          // 如果是 admin 上傳的圖片（supabase），保留不覆蓋
          if (existing[0].image_url && existing[0].image_url.includes('supabase.co')) {
            // 保留 admin 上傳的圖片
          } else {
            updates.image_url = imageUrl;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('figures')
          .update(updates)
          .eq('id', existing[0].id);

        if (!error) {
          updated++;
          const verStr = version ? ` [${version}]` : '';
          const scaleStr = scale ? ` (${scale})` : '';
          const priceInfo = updates.original_price ? ` (原價: ${updates.original_price})` : '';
          const verUpdate = updates.version ? ` 🏷️版本:${updates.version}` : '';
          console.log(`  📝 更新: ${name.slice(0, 25)}...${verStr}${scaleStr}${priceInfo}${verUpdate}`);
        }
      } else {
        const verStr = version ? ` [${version}]` : '';
        const scaleStr = scale ? ` (${scale})` : '';
        console.log(`  ⏭️ 已存在: ${name.slice(0, 20)}...${verStr}${scaleStr}`);
        skipped++;
      }
    } else {
      // 新增 - 檢查圖片是否被不同工作室的公仔使用
      let safeImageUrl = imageUrl;
      if (imageUrl) {
        const { data: imgExists } = await supabase
          .from('figures')
          .select('id, name, manufacturer')
          .eq('image_url', imageUrl)
          .limit(1);

        if (imgExists && imgExists.length > 0) {
          const existing = imgExists[0];
          // 模糊名稱匹配（前 10 字相同就算同一公仔不同版本）
          const nameA = (existing.name || '').replace(/\s+/g, '').slice(0, 10);
          const nameB = (name || '').replace(/\s+/g, '').slice(0, 10);
          const sameName = nameA && nameB && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA));
          const sameMfg = !manufacturer || !existing.manufacturer || existing.manufacturer === manufacturer;
          if (!sameName && !sameMfg) {
            console.log(`  🖼️ 圖片重複跳過: ${name.slice(0, 20)} (已被 ${existing.name.slice(0, 20)} 使用)`);
            safeImageUrl = null;
          }
        }
      }

      const { error } = await supabase
        .from('figures')
        .insert({
          name,
          manufacturer,
          original_price: originalPrice,
          version,
          scale,
          image_url: safeImageUrl,
          tag,
        });

      if (!error) {
        inserted++;
        const verStr = version ? ` [${version}]` : '';
        const scaleStr = scale ? ` (${scale})` : '';
        console.log(`  ✅ 新增: ${name}${verStr}${scaleStr} (原價: ${originalPrice || '無'})`);
      } else {
        console.log(`  ❌ 失敗: ${name} - ${error.message}`);
      }
    }
  }

  console.log(`\n📊 匯入完成！`);
  console.log(`   新增: ${inserted} 筆`);
  console.log(`   更新: ${updated} 筆`);
  console.log(`   跳過: ${skipped} 筆`);
}

importData().catch(console.error);
