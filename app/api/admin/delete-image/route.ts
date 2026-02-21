import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { figureId } = await request.json()

    if (!figureId) {
      return NextResponse.json({ error: '缺少 figureId' }, { status: 400 })
    }

    // 先取得目前的圖片 URL
    const { data: figure, error: fetchError } = await supabase
      .from('figures')
      .select('image_url')
      .eq('id', figureId)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: '找不到公仔' }, { status: 404 })
    }

    // 如果有圖片，從 Storage 刪除
    if (figure.image_url) {
      // 從 URL 取得檔名
      const urlParts = figure.image_url.split('/')
      const fileName = urlParts[urlParts.length - 1]

      // 嘗試從 Storage 刪除（如果是存在 Storage 的話）
      if (figure.image_url.includes('supabase')) {
        await supabase.storage
          .from('figures')
          .remove([fileName])
      }
    }

    // 更新資料庫，清除 image_url
    const { error: updateError } = await supabase
      .from('figures')
      .update({ image_url: null })
      .eq('id', figureId)

    if (updateError) {
      return NextResponse.json({ error: '更新資料庫失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '圖片已刪除'
    })
  } catch (error) {
    console.error('Delete image error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
