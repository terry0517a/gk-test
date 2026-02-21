import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import crypto from 'crypto'

function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'collector-salt').digest('hex').slice(0, 16)
}

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIP(ip)

    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    // UPSERT: 若同日同 IP 已存在則不重複插入
    await supabase
      .from('daily_visits')
      .upsert(
        { visit_date: today, ip_hash: ipHash },
        { onConflict: 'visit_date,ip_hash', ignoreDuplicates: true }
      )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Track visit error:', error)
    return NextResponse.json({ ok: true }) // 靜默失敗，不影響使用者體驗
  }
}
