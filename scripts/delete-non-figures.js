const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function deleteNonFigures() {
  const keywords = ['春聯', '對聯', '紅包袋', '紅包', '畫', '掛畫', '裝飾畫', '燈帶畫', '框畫', '海報', '貼紙']

  console.log('🗑️ 開始刪除非公仔商品...')
  console.log('關鍵字:', keywords.join(', '))

  let totalDeleted = 0
  const deletedItems = []

  for (const keyword of keywords) {
    // 查詢要刪除的商品
    const { data: figures, error: selectError } = await supabase
      .from('figures')
      .select('id, name')
      .ilike('name', `%${keyword}%`)

    if (selectError) {
      console.error(`查詢 "${keyword}" 錯誤:`, selectError.message)
      continue
    }

    if (!figures || figures.length === 0) {
      console.log(`  "${keyword}": 無匹配商品`)
      continue
    }

    console.log(`  "${keyword}": 找到 ${figures.length} 個商品`)

    // 收集要刪除的 ID
    const idsToDelete = figures.map(f => f.id)

    // 先刪除相關的交易記錄
    const { error: txError } = await supabase
      .from('transactions')
      .delete()
      .in('figure_id', idsToDelete)

    if (txError) {
      console.error(`  刪除交易記錄錯誤:`, txError.message)
    }

    // 刪除商品
    const { error: deleteError } = await supabase
      .from('figures')
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      console.error(`  刪除商品錯誤:`, deleteError.message)
      continue
    }

    totalDeleted += figures.length
    deletedItems.push(...figures.map(f => f.name))
    console.log(`  ✅ 已刪除 ${figures.length} 個`)
  }

  console.log('\n📊 刪除完成!')
  console.log(`總共刪除: ${totalDeleted} 個商品`)

  if (deletedItems.length > 0 && deletedItems.length <= 30) {
    console.log('\n刪除的商品:')
    deletedItems.forEach(name => console.log(`  - ${name}`))
  }
}

deleteNonFigures().catch(console.error)
