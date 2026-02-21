import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { transactionId } = await request.json()

    if (!transactionId) {
      return NextResponse.json({ error: '缺少交易 ID' }, { status: 400 })
    }

    // 取得交易記錄
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, figures(*)')
      .eq('id', transactionId)
      .single()

    if (txError || !transaction) {
      return NextResponse.json({ error: '找不到交易記錄' }, { status: 404 })
    }

    const figureId = transaction.figure_id
    const reportedPrice = transaction.price
    const figure = transaction.figures

    // 計算新的價格範圍（只擴展，不縮小）
    const currentMin = figure?.market_price_min || reportedPrice
    const currentMax = figure?.market_price_max || reportedPrice

    const newMin = Math.min(currentMin, reportedPrice)
    const newMax = Math.max(currentMax, reportedPrice)

    // 更新公仔的市場價格範圍（使用 admin client 繞過 RLS）
    const { error: updateError } = await supabase
      .from('figures')
      .update({
        market_price_min: newMin,
        market_price_max: newMax,
      })
      .eq('id', figureId)

    if (updateError) {
      return NextResponse.json({ error: '更新價格失敗' }, { status: 500 })
    }

    // 更新交易狀態為已批准
    await supabase
      .from('transactions')
      .update({ status: 'approved' })
      .eq('id', transactionId)

    return NextResponse.json({
      success: true,
      message: '價格已更新到公仔資料',
      figure_id: figureId,
    })
  } catch (error) {
    console.error('Approve transaction error:', error)
    return NextResponse.json({ error: '操作失敗' }, { status: 500 })
  }
}
