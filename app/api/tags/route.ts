import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // 使用 RPC 或手動查詢取得標籤及數量
    // Supabase JS client 不直接支援 GROUP BY，用 rpc 或 raw query
    // 改用 select all tags then count in JS (效能可接受，tags 數量有限)
    const { data, error } = await supabase
      .from('figures')
      .select('tag')
      .not('tag', 'is', null)

    if (error) {
      console.error('Tags query error:', error)
      return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    }

    // 統計各標籤數量
    const tagCounts: Record<string, number> = {}
    for (const row of data || []) {
      if (row.tag) {
        tagCounts[row.tag] = (tagCounts[row.tag] || 0) + 1
      }
    }

    // 轉成陣列並按數量排序
    const tags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ tags })
  } catch (error) {
    console.error('Tags error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
