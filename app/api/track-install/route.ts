import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import crypto from 'crypto'

function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'collector-salt').digest('hex').slice(0, 16)
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIP(ip)

    let platform = 'unknown'
    let method = 'unknown'
    try {
      const body = await request.json()
      if (body.platform) platform = body.platform
      if (body.method) method = body.method
    } catch {}

    await supabase
      .from('pwa_installs')
      .upsert(
        { ip_hash: ipHash, platform, install_method: method },
        { onConflict: 'ip_hash', ignoreDuplicates: true }
      )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Track install error:', error)
    return NextResponse.json({ ok: true }) // 靜默失敗
  }
}
