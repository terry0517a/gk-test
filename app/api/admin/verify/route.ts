import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // 從 Authorization header 取得 token
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    // 簡單驗證：token 存在且長度正確 (sha256 hex = 64 chars)
    if (typeof token === 'string' && token.length === 64) {
      return NextResponse.json({ valid: true })
    }

    return NextResponse.json({ valid: false }, { status: 401 })
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
