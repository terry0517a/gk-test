import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { id, name, manufacturer, series, original_price, market_price_min, market_price_max, tag } = await request.json()

    if (!id) {
      return NextResponse.json({ error: '缺少公仔 ID' }, { status: 400 })
    }

    // 建立更新物件，只包含有值的欄位
    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer
    if (series !== undefined) updateData.series = series
    if (original_price !== undefined) updateData.original_price = original_price ? Number(original_price) : null
    if (market_price_min !== undefined) updateData.market_price_min = market_price_min ? Number(market_price_min) : null
    if (market_price_max !== undefined) updateData.market_price_max = market_price_max ? Number(market_price_max) : null
    if (tag !== undefined) updateData.tag = tag || null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '沒有要更新的資料' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('figures')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update figure error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      figure: data,
      message: '更新成功'
    })
  } catch (error) {
    console.error('Update figure error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}
