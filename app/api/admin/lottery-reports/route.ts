import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

// 取得抽獎回報列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // pending, approved, rejected
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('price_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { count: pendingCount } = await supabase
      .from('price_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    // 檢查重複：相同 figure_name 的其他回報（不限 email）
    const reportsWithDuplicates = await Promise.all(
      (data || []).map(async (report: Record<string, unknown>) => {
        const { data: duplicates } = await supabase
          .from('price_reports')
          .select('id, email, figure_name, deal_price, status, created_at')
          .ilike('figure_name', report.figure_name as string)
          .neq('id', report.id as string)
          .order('created_at', { ascending: false })
          .limit(5)

        return {
          ...report,
          duplicates: duplicates && duplicates.length > 0 ? duplicates : null,
        }
      })
    )

    return NextResponse.json({
      reports: reportsWithDuplicates,
      total: count || 0,
      pendingCount: pendingCount || 0,
      limit,
      offset,
    })
  } catch {
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// 審核回報（核准 / 退回）
export async function PATCH(request: NextRequest) {
  try {
    const { id, action, admin_note } = await request.json()

    if (!id || !action) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: '無效的操作' }, { status: 400 })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const updateData: Record<string, string> = { status: newStatus }
    if (admin_note) {
      updateData.admin_note = admin_note
    }

    const { data, error } = await supabase
      .from('price_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: '更新失敗' }, { status: 500 })
    }

    // [Hook] 核准時預留：未來可將價格寫入公仔價格主表
    if (action === 'approve' && data) {
      await onReportApproved(data)
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? '已核准' : '已退回',
    })
  } catch {
    return NextResponse.json({ error: '操作失敗' }, { status: 500 })
  }
}

/**
 * 正規化名稱：去除空格、全形空格、轉小寫
 */
function normalize(str: string): string {
  return str.replace(/[\s\u3000]+/g, '').toLowerCase()
}

/**
 * 當回報被核准時，將價格寫入公仔價格主表
 * 1. 先精準匹配（不分大小寫）
 * 2. 若找不到，用正規化比對（去空格 + 忽略大小寫）
 * 3. 若仍找不到，自動新增一筆 figure 記錄
 */
async function onReportApproved(report: Record<string, unknown>) {
  const figureName = report.figure_name as string
  const dealPrice = Number(report.deal_price)
  const dealDate = (report.deal_date as string) || null

  if (!figureName || isNaN(dealPrice)) return

  try {
    // 第一步：精準匹配（名稱完全一致，不分大小寫）
    const { data: exactMatch } = await supabase
      .from('figures')
      .select('id, name, market_price_min, market_price_max')
      .ilike('name', figureName)
      .limit(1)

    let matched = exactMatch && exactMatch.length > 0 ? exactMatch[0] : null

    // 第二步：正規化匹配（去空格 + 忽略大小寫）
    if (!matched) {
      const normalizedInput = normalize(figureName)
      const { data: allFigures } = await supabase
        .from('figures')
        .select('id, name, market_price_min, market_price_max')

      if (allFigures) {
        matched = allFigures.find(f => normalize(f.name) === normalizedInput) || null
      }
    }

    let figureId: string

    if (matched) {
      // 找到匹配的公仔 → 更新市場價格
      figureId = matched.id

      const currentMin = matched.market_price_min
      const currentMax = matched.market_price_max
      const newMin = currentMin !== null ? Math.min(currentMin, dealPrice) : dealPrice
      const newMax = currentMax !== null ? Math.max(currentMax, dealPrice) : dealPrice

      if (newMin !== currentMin || newMax !== currentMax) {
        await supabase
          .from('figures')
          .update({ market_price_min: newMin, market_price_max: newMax })
          .eq('id', matched.id)
      }
    } else {
      // 找不到匹配 → 新增公仔
      const { data: newFigure, error: insertError } = await supabase
        .from('figures')
        .insert({
          name: figureName,
          market_price_min: dealPrice,
          market_price_max: dealPrice,
        })
        .select('id')
        .single()

      if (insertError || !newFigure) {
        console.error('Failed to create figure:', insertError)
        return
      }
      figureId = newFigure.id
    }

    // 寫入成交紀錄
    await supabase.from('transactions').insert({
      figure_id: figureId,
      price: dealPrice,
      deal_date: dealDate,
      source: 'price_report',
      status: 'approved',
    })
  } catch (err) {
    console.error('onReportApproved error:', err)
  }
}
