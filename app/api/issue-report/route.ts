import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'issue-salt').digest('hex').slice(0, 16)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, title, description, contact } = body

    // 驗證必填欄位
    if (!type || !title || !description) {
      return NextResponse.json({ error: '請填寫必要欄位' }, { status: 400 })
    }

    // 驗證問題類型
    const validTypes = ['bug', 'suggestion', 'data_error', 'other']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: '無效的問題類型' }, { status: 400 })
    }

    // 驗證長度
    if (title.length > 100) {
      return NextResponse.json({ error: '標題不能超過100字' }, { status: 400 })
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: '描述不能超過2000字' }, { status: 400 })
    }

    // 取得 IP 並 hash
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIP(ip)

    // 檢查同一 IP 短時間內的提交次數（防濫用）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('issue_reports')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneHourAgo)

    if (count && count >= 5) {
      return NextResponse.json({ error: '提交頻率過高，請稍後再試' }, { status: 429 })
    }

    // 新增問題回報
    const { data, error } = await supabase
      .from('issue_reports')
      .insert({
        type,
        title: title.trim(),
        description: description.trim(),
        contact: contact?.trim() || null,
        ip_hash: ipHash,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Insert issue report error:', error)
      return NextResponse.json({ error: '提交失敗' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    console.error('Issue report error:', error)
    return NextResponse.json({ error: '提交失敗' }, { status: 500 })
  }
}
