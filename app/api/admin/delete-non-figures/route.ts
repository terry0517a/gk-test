import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

// 刪除非公仔商品（春聯、畫等）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { keywords } = body

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { error: '請提供要刪除的關鍵字' },
        { status: 400 }
      )
    }

    let totalDeleted = 0
    const deletedItems: string[] = []

    for (const keyword of keywords) {
      // 先查詢要刪除的商品
      const { data: figures, error: selectError } = await supabase
        .from('figures')
        .select('id, name')
        .ilike('name', `%${keyword}%`)

      if (selectError) {
        console.error(`Select error for ${keyword}:`, selectError)
        continue
      }

      if (!figures || figures.length === 0) {
        continue
      }

      // 收集要刪除的 ID
      const idsToDelete = figures.map(f => f.id)

      // 先刪除相關的交易記錄
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .in('figure_id', idsToDelete)

      if (txError) {
        console.error(`Delete transactions error for ${keyword}:`, txError)
      }

      // 刪除商品
      const { error: deleteError } = await supabase
        .from('figures')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        console.error(`Delete figures error for ${keyword}:`, deleteError)
        continue
      }

      totalDeleted += figures.length
      deletedItems.push(...figures.map(f => f.name))
    }

    return NextResponse.json({
      success: true,
      deleted_count: totalDeleted,
      deleted_items: deletedItems.slice(0, 20), // 只顯示前20個
      message: `已刪除 ${totalDeleted} 個非公仔商品`
    })
  } catch (error) {
    console.error('Delete non-figures error:', error)
    return NextResponse.json(
      { error: '刪除失敗' },
      { status: 500 }
    )
  }
}
