import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendMail } from '@/lib/mailer'

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

    // 重複資料偵測：同 Email + 作品名稱 + 成交價格 + 成交日期 視為重複
    const { data: existing } = await supabase
      .from('price_reports')
      .select('id')
      .eq('email', email.trim())
      .eq('figure_name', figure_name.trim())
      .eq('deal_price', price)
      .eq('deal_date', deal_date)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: '此筆成交紀錄已回報過，請勿重複提交' },
        { status: 400 }
      )
    }

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

    // Fire-and-forget：寄送回報成功確認信，不阻擋回應
    sendMail(
      email.trim(),
      '📋【回報成功】GK 報價王 — 您的成交回報已送出！',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">🎉 成交回報已送出！</h2>
          <p>您好，</p>
          <p>您在「<strong>GK 報價王</strong>」活動中回報的成交紀錄已成功送出，以下是您的回報資訊：</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #ddd;">${email.trim()}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">作品名稱</td><td style="padding: 8px; border: 1px solid #ddd;">${figure_name.trim()}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">工作室</td><td style="padding: 8px; border: 1px solid #ddd;">${studio.trim()}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">成交價格</td><td style="padding: 8px; border: 1px solid #ddd;">NT$ ${price.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">成交日期</td><td style="padding: 8px; border: 1px solid #ddd;">${deal_date}</td></tr>
          </table>
          <p>📌 您的回報目前正在 <strong>審核中</strong>，審核完成後您將獲得抽獎券，届時會再通知您。</p>
          <p style="color: #888; font-size: 14px; margin-top: 24px;">— GK 收藏家團隊</p>
        </div>
      `
    ).catch((err) => console.error('[Email] 回報確認信發送失敗:', err))

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json(
      { error: '伺服器錯誤' },
      { status: 500 }
    )
  }
}
