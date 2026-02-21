import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Figure } from '@/types/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // 取得公仔資料
    const { data, error } = await supabase
      .from('figures')
      .select('*')
      .eq('id', id)
      .single()

    const figure = data as Figure | null

    if (error || !figure) {
      return NextResponse.json({ error: '找不到此公仔' }, { status: 404 })
    }

    // 取得最近的成交紀錄（僅顯示已審核通過的）
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('figure_id', id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      figure,
      transactions: transactions || [],
    })
  } catch (error) {
    console.error('Get figure error:', error)
    return NextResponse.json({ error: '取得資料失敗' }, { status: 500 })
  }
}
