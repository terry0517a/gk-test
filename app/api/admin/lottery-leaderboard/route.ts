import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

interface ReportRow {
  email: string
  has_screenshot: boolean
  has_shared_social: boolean
  created_at: string
}

export async function GET() {
  try {
    // 取得所有已核准的回報
    const { data, error } = await supabase
      .from('price_reports')
      .select('email, has_screenshot, has_shared_social, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const reports = (data || []) as ReportRow[]

    // 按 Email 分組計算
    const grouped = new Map<string, {
      email: string
      reportCount: number
      screenshotCount: number
      hasSocial: boolean
      totalTickets: number
      lastReportAt: string
    }>()

    for (const r of reports) {
      const existing = grouped.get(r.email)
      if (existing) {
        existing.reportCount++
        if (r.has_screenshot) existing.screenshotCount++
        if (r.has_shared_social) existing.hasSocial = true
        if (r.created_at > existing.lastReportAt) existing.lastReportAt = r.created_at
      } else {
        grouped.set(r.email, {
          email: r.email,
          reportCount: 1,
          screenshotCount: r.has_screenshot ? 1 : 0,
          hasSocial: r.has_shared_social,
          lastReportAt: r.created_at,
          totalTickets: 0,
        })
      }
    }

    // 計算總券數
    const leaderboard = Array.from(grouped.values()).map(entry => {
      entry.totalTickets = entry.reportCount + entry.screenshotCount + (entry.hasSocial ? 1 : 0)
      return entry
    })

    // 按券數排序
    leaderboard.sort((a, b) => b.totalTickets - a.totalTickets)

    return NextResponse.json({ leaderboard })
  } catch {
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}
