import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 取得特定分享的追蹤清單
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!code) {
    return NextResponse.json({ error: '缺少分享碼' }, { status: 400 })
  }

  try {
    // 取得分享資料
    const { data, error } = await supabase
      .from('shared_collections')
      .select('*')
      .eq('share_code', code)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: '找不到此分享' }, { status: 404 })
    }

    // 增加瀏覽次數
    await supabase
      .from('shared_collections')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('share_code', code)

    // 取得最新的公仔價格資訊
    const figureIds = (data.items as { figure_id: string }[]).map(item => item.figure_id)

    const { data: figures } = await supabase
      .from('figures')
      .select('id, name, image_url, market_price_min, market_price_max, manufacturer')
      .in('id', figureIds)

    // 合併最新價格
    const figuresMap = new Map(figures?.map(f => [f.id, f]) || [])

    const itemsWithLatestPrices = (data.items as {
      figure_id: string
      name: string
      image_url: string | null
      price_min: number | null
      price_max: number | null
    }[]).map(item => {
      const latestFigure = figuresMap.get(item.figure_id)
      return {
        ...item,
        latest_price_min: latestFigure?.market_price_min || null,
        latest_price_max: latestFigure?.market_price_max || null,
        manufacturer: latestFigure?.manufacturer || null,
        // 判斷價格變化
        price_changed: latestFigure ? (
          latestFigure.market_price_min !== item.price_min ||
          latestFigure.market_price_max !== item.price_max
        ) : false,
      }
    })

    return NextResponse.json({
      share_code: data.share_code,
      nickname: data.nickname,
      items: itemsWithLatestPrices,
      view_count: (data.view_count || 0) + 1,
      created_at: data.created_at,
    })
  } catch (error) {
    console.error('Get shared collection error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}
