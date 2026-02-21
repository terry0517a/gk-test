const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkAndPopulate() {
  console.log('🔍 檢查 unique_users 表...')

  // 檢查 unique_users 表是否存在
  const { data: tableCheck, error: tableError } = await supabase
    .from('unique_users')
    .select('*', { count: 'exact', head: true })

  if (tableError) {
    console.log('❌ unique_users 表不存在或無法訪問')
    console.log('錯誤:', tableError.message)
    console.log('\n請在 Supabase SQL Editor 執行以下 SQL：')
    console.log(`
-- 建立 unique_users 表
CREATE TABLE IF NOT EXISTS unique_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT UNIQUE NOT NULL,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_unique_users_ip_hash ON unique_users(ip_hash);
    `)
    return
  }

  console.log('✅ unique_users 表存在')

  // 檢查現有資料
  const { count: uniqueCount } = await supabase
    .from('unique_users')
    .select('*', { count: 'exact', head: true })

  console.log(`目前 unique_users 有 ${uniqueCount || 0} 筆資料`)

  // 從 transactions 取得所有 ip_hash
  const { data: transactions } = await supabase
    .from('transactions')
    .select('ip_hash, created_at')

  if (!transactions || transactions.length === 0) {
    console.log('⚠️ transactions 表中沒有資料')
    return
  }

  // 整理唯一的 ip_hash
  const ipMap = new Map()
  for (const tx of transactions) {
    if (!tx.ip_hash) continue
    if (!ipMap.has(tx.ip_hash)) {
      ipMap.set(tx.ip_hash, {
        first_seen: tx.created_at,
        last_seen: tx.created_at
      })
    } else {
      const existing = ipMap.get(tx.ip_hash)
      if (tx.created_at < existing.first_seen) {
        existing.first_seen = tx.created_at
      }
      if (tx.created_at > existing.last_seen) {
        existing.last_seen = tx.created_at
      }
    }
  }

  console.log(`從 transactions 找到 ${ipMap.size} 個獨立使用者`)

  // 插入到 unique_users
  let inserted = 0
  for (const [ip_hash, times] of ipMap) {
    const { error } = await supabase
      .from('unique_users')
      .upsert({
        ip_hash,
        first_seen: times.first_seen,
        last_seen: times.last_seen
      }, {
        onConflict: 'ip_hash'
      })

    if (!error) {
      inserted++
    }
  }

  console.log(`✅ 已同步 ${inserted} 個使用者到 unique_users 表`)

  // 再次檢查
  const { count: finalCount } = await supabase
    .from('unique_users')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 最終 unique_users 數量: ${finalCount}`)
}

checkAndPopulate().catch(console.error)
