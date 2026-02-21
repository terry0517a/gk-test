import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status') // pending, approved, rejected, or null for all

    // 取得交易記錄，包含公仔名稱
    let query = supabase
      .from('transactions')
      .select(`
        id,
        price,
        source,
        created_at,
        ip_hash,
        status,
        figures (
          id,
          name,
          manufacturer,
          market_price_min,
          market_price_max
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })

    // 篩選狀態
    if (status) {
      query = query.eq('status', status)
    }

    const { data: transactions, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      console.error('Fetch transactions error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 取得待審核數量
    const { count: pendingCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return NextResponse.json({
      transactions,
      total: count || 0,
      pendingCount: pendingCount || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Transactions error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// 審核交易記錄
export async function PATCH(request: NextRequest) {
  try {
    const { id, action } = await request.json() // action: 'approve' or 'reject'

    if (!id || !action) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: '無效的操作' }, { status: 400 })
    }

    // 取得交易記錄
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*, figures(*)')
      .eq('id', id)
      .single()

    if (fetchError || !transaction) {
      return NextResponse.json({ error: '找不到交易記錄' }, { status: 404 })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    // 更新交易狀態（使用 admin client 繞過 RLS）
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', id)

    if (updateError) {
      console.error('Update transaction error:', updateError)
      return NextResponse.json({ error: '更新失敗' }, { status: 500 })
    }

    // 如果是批准，更新公仔的市場價格
    if (action === 'approve' && transaction.figures) {
      const figure = transaction.figures
      const price = transaction.price
      const currentMin = figure.market_price_min
      const currentMax = figure.market_price_max

      const newMin = currentMin !== null ? Math.min(currentMin, price) : price
      const newMax = currentMax !== null ? Math.max(currentMax, price) : price

      if (newMin !== currentMin || newMax !== currentMax) {
        await supabase
          .from('figures')
          .update({
            market_price_min: newMin,
            market_price_max: newMax,
          })
          .eq('id', figure.id)
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? '已批准' : '已拒絕'
    })
  } catch (error) {
    console.error('Update transaction error:', error)
    return NextResponse.json({ error: '操作失敗' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: '缺少交易 ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete transaction error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete transaction error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
