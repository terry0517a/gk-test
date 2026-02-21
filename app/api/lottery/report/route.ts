import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, figure_name, studio, deal_price, deal_date, screenshot_url, social_share_url } = body

    // 驗證必填欄位
    if (!email || !figure_name || !studio || deal_price == null || !deal_date) {
      return NextResponse.json(
        { error: '請填寫所有必填欄位' },
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

    // 驗證價格
    const price = Number(deal_price)
    if (isNaN(price) || price <= 0 || price > 10000000) {
      return NextResponse.json(
        { error: '請輸入有效的成交價格' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const hasScreenshot = !!screenshot_url
    const hasSharedSocial = !!social_share_url

    const { data, error } = await supabase
      .from('price_reports')
      .insert({
        email: email.trim(),
        figure_name: figure_name.trim(),
        studio: studio.trim(),
        deal_price: price,
        deal_date: deal_date,
        has_screenshot: hasScreenshot,
        has_shared_social: hasSharedSocial,
        screenshot_url: screenshot_url || null,
        social_share_url: social_share_url || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { error: '提交失敗，請稍後再試' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json(
      { error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}
