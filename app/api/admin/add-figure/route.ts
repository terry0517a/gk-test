import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, manufacturer, series, original_price, market_price_min, market_price_max } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '請輸入公仔名稱' }, { status: 400 })
    }

    // 檢查是否已存在同名公仔
    const { data: existing } = await supabase
      .from('figures')
      .select('id')
      .ilike('name', name.trim())
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '已有同名公仔存在' }, { status: 400 })
    }

    // 新增公仔
    const { data: newFigure, error: insertError } = await supabase
      .from('figures')
      .insert({
        name: name.trim(),
        manufacturer: manufacturer?.trim() || null,
        series: series?.trim() || null,
        original_price: original_price ? Number(original_price) : null,
        market_price_min: market_price_min ? Number(market_price_min) : null,
        market_price_max: market_price_max ? Number(market_price_max) : null,
      })
      .select()
      .single()

    if (insertError || !newFigure) {
      console.error('Insert figure error:', insertError)
      return NextResponse.json({ error: '新增失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      figure: newFigure,
      message: '公仔新增成功',
    })
  } catch (error) {
    console.error('Add figure error:', error)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }
}
