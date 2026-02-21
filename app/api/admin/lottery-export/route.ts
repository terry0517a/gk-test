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
        })
      }
    }

    // 生成 CSV
    const BOM = '\uFEFF'
    const header = 'Email,累積抽獎券張數,最後回報時間'
    const rows = Array.from(grouped.values())
      .map(entry => {
        const tickets = entry.reportCount + entry.screenshotCount + (entry.hasSocial ? 1 : 0)
        const lastTime = new Date(entry.lastReportAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        return `${entry.email},${tickets},${lastTime}`
      })
      .sort((a, b) => {
        const ticketsA = parseInt(a.split(',')[1])
        const ticketsB = parseInt(b.split(',')[1])
        return ticketsB - ticketsA
      })

    const csv = BOM + header + '\n' + rows.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="lottery-candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch {
    return NextResponse.json({ error: '匯出失敗' }, { status: 500 })
  }
}
