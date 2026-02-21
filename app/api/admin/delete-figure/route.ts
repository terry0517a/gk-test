import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { figureId } = await request.json()

    if (!figureId) {
      return NextResponse.json({ error: '缺少公仔 ID' }, { status: 400 })
    }

    const id = figureId

    // 先取得公仔資訊（包含名稱和圖片 URL）
    const { data: figure, error: fetchError } = await supabase
      .from('figures')
      .select('name, image_url')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('Fetch figure error:', fetchError)
      return NextResponse.json({ error: '找不到公仔' }, { status: 404 })
    }

    // 如果有圖片，先從 Storage 刪除
    if (figure.image_url && figure.image_url.includes('supabase')) {
      const urlParts = figure.image_url.split('/')
      const fileName = urlParts[urlParts.length - 1]

      await supabase.storage
        .from('figures')
        .remove([fileName])
    }

    // 加入封鎖名單，防止爬蟲重新匯入
    if (figure.name) {
      await supabase
        .from('blocked_figures')
        .insert({ name: figure.name, reason: '手動刪除' })
    }

    // 先刪除相關的交易記錄
    const { error: deleteTransactionsError } = await supabase
      .from('transactions')
      .delete()
      .eq('figure_id', id)

    if (deleteTransactionsError) {
      console.error('Delete transactions error:', deleteTransactionsError)
      // 繼續執行，可能沒有相關交易記錄
    }

    // 刪除公仔
    const { data: deleted, error: deleteError } = await supabase
      .from('figures')
      .delete()
      .eq('id', id)
      .select()

    if (deleteError) {
      console.error('Delete figure error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 檢查是否真的有刪除
    if (!deleted || deleted.length === 0) {
      console.error('Delete returned empty - RLS policy may be blocking')
      return NextResponse.json({
        error: '刪除失敗，請檢查 Supabase RLS 是否有設定 DELETE 權限'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '刪除成功'
    })
  } catch (error) {
    console.error('Delete figure error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
