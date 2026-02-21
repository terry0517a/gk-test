import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mailer'

/**
 * Email 發送 API
 *
 * POST /api/email/send
 * Body: { email: string, subject: string, html: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, subject, html } = await request.json()

    if (!email || !subject || !html) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: '無效的 Email 地址' }, { status: 400 })
    }

    const result = await sendMail(email, subject, html)

    return NextResponse.json({
      success: true,
      simulated: result.simulated,
      message: result.simulated ? '郵件已模擬發送（尚未設定 Gmail 環境變數）' : '郵件已發送',
    })
  } catch {
    return NextResponse.json({ error: '郵件發送失敗' }, { status: 500 })
  }
}
