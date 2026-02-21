import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: '請輸入密碼' }, { status: 400 })
    }

    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not set in environment variables')
      return NextResponse.json({ error: '系統設定錯誤' }, { status: 500 })
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: '密碼錯誤' }, { status: 401 })
    }

    // 產生簡單的 token (使用密碼 hash + 時間戳)
    const token = crypto
      .createHash('sha256')
      .update(adminPassword + Date.now().toString())
      .digest('hex')

    return NextResponse.json({
      success: true,
      token,
      message: '登入成功'
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: '登入失敗' }, { status: 500 })
  }
}
