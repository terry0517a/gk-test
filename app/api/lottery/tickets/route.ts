import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json(
        { error: '請提供 Email' },
        { status: 400 }
      )
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '請輸入有效的 Email 地址' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: reports, error } = await supabase
      .from('price_reports')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase query error:', error)
      return NextResponse.json(
        { error: '查詢失敗，請稍後再試' },
        { status: 500 }
      )
    }

    if (!reports || reports.length === 0) {
      return NextResponse.json({
        tickets: 0,
        reports: [],
        breakdown: { base: 0, screenshot: 0, social: 0 },
      })
    }

    // 只有審核通過的才計算抽獎券
    const approved = reports.filter(r => r.status === 'approved')

    // 每筆核准回報 +1
    const baseTickets = approved.length
    // 有截圖的每筆 +1
    const screenshotTickets = approved.filter(r => r.has_screenshot).length
    // 曾分享社群（不論次數）+1
    const hasSocial = approved.some(r => r.has_shared_social)
    const socialTickets = hasSocial ? 1 : 0

    const totalTickets = baseTickets + screenshotTickets + socialTickets

    return NextResponse.json({
      tickets: totalTickets,
      reports,
      breakdown: {
        base: baseTickets,
        screenshot: screenshotTickets,
        social: socialTickets,
      },
    })
  } catch {
    return NextResponse.json(
      { error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}
