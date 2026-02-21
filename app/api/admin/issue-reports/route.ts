import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

// 取得問題回報列表
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status') // pending, in_progress, resolved, closed, all
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    let query = supabase
      .from('issue_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Get issue reports error:', error)
      return NextResponse.json({ error: '載入失敗' }, { status: 500 })
    }

    return NextResponse.json({
      reports: data || [],
      total: count || 0,
    })
  } catch (error) {
    console.error('Issue reports error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}

// 更新問題回報狀態
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, admin_note } = body

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    const validStatuses = ['pending', 'in_progress', 'resolved', 'closed']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: '無效的狀態' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (admin_note !== undefined) updates.admin_note = admin_note

    const { error } = await supabase
      .from('issue_reports')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error('Update issue report error:', error)
      return NextResponse.json({ error: '更新失敗' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update issue report error:', error)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// 刪除問題回報
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('issue_reports')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete issue report error:', error)
      return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete issue report error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
