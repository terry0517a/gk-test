import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const filter = searchParams.get('filter') // 'all', 'has_image', 'no_image', 'no_price', 'no_both', 'today', 'yesterday', 'this_week'
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10000')

    let query = supabase
      .from('figures')
      .select('id, name, manufacturer, version, series, tag, original_price, image_url, market_price_min, market_price_max, created_at', { count: 'exact' })

    // 伺服器端搜尋（使用 ilike，與前端一致）
    if (search && search.trim()) {
      const searchTerm = search.trim()
      query = query.or(`name.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%,series.ilike.%${searchTerm}%,tag.ilike.%${searchTerm}%`)
    }

    // 篩選條件
    if (filter === 'has_image') {
      query = query.not('image_url', 'is', null).neq('image_url', '')
    } else if (filter === 'no_image') {
      query = query.or('image_url.is.null,image_url.eq.')
    } else if (filter === 'no_price') {
      query = query.is('original_price', null)
    } else if (filter === 'no_both') {
      query = query.or('image_url.is.null,image_url.eq.').is('original_price', null)
    } else if (filter === 'today') {
      // 今天新增的
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      query = query.gte('created_at', today.toISOString())
    } else if (filter === 'yesterday') {
      // 昨天新增的
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      query = query.gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString())
    } else if (filter === 'this_week') {
      // 本週新增的（最近 7 天）
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      weekAgo.setHours(0, 0, 0, 0)
      query = query.gte('created_at', weekAgo.toISOString())
    }

    // 分頁
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // 時間篩選時按新增時間排序，其他按名稱排序
    const orderBy = (filter === 'today' || filter === 'yesterday' || filter === 'this_week')
      ? 'created_at'
      : 'name'
    const ascending = orderBy === 'name'

    const { data: figures, error, count } = await query
      .order(orderBy, { ascending })
      .range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      figures,
      total: count || 0,
      page,
      pageSize,
      filter: filter || 'all'
    })
  } catch (error) {
    console.error('Get figures error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// 刪除公仔
export async function DELETE(request: NextRequest) {
  try {
    const { id, ids } = await request.json()

    // 支援單一刪除和批量刪除
    const deleteIds = ids || (id ? [id] : [])

    if (deleteIds.length === 0) {
      return NextResponse.json({ error: '缺少公仔 ID' }, { status: 400 })
    }

    // 先刪除相關的交易記錄
    await supabase
      .from('transactions')
      .delete()
      .in('figure_id', deleteIds)

    // 刪除公仔
    const { error } = await supabase
      .from('figures')
      .delete()
      .in('id', deleteIds)

    if (error) {
      console.error('Delete figure error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: deleteIds.length,
      message: `已刪除 ${deleteIds.length} 個公仔`
    })
  } catch (error) {
    console.error('Delete figure error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
