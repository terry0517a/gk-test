import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'collector-salt').digest('hex').slice(0, 16)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, price, source, category, manufacturer } = body

    if (!name || !price) {
      return NextResponse.json({ error: '請填寫公仔名稱和價格' }, { status: 400 })
    }

    if (price <= 0 || price > 10000000) {
      return NextResponse.json({ error: '價格超出合理範圍' }, { status: 400 })
    }

    // 取得 IP 並 hash
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIP(ip)

    // 檢查同一 IP 短時間內的提交次數（防濫用）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneHourAgo)

    if (count && count >= 20) {
      return NextResponse.json({ error: '提交頻率過高，請稍後再試' }, { status: 429 })
    }

    // 搜尋是否已有此公仔
    const { data: existingFigures } = await supabase
      .from('figures')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1)

    let figureId: string

    if (existingFigures && existingFigures.length > 0) {
      // 已有此公仔，使用現有的
      figureId = existingFigures[0].id

      // 如果現有公仔沒有廠商資料，且用戶提供了廠商，則更新
      if (!existingFigures[0].manufacturer && manufacturer) {
        await supabase
          .from('figures')
          .update({ manufacturer: manufacturer.trim() })
          .eq('id', figureId)
      }
    } else {
      // 新增公仔
      const { data: newFigure, error: insertFigureError } = await supabase
        .from('figures')
        .insert({
          name: name.trim(),
          manufacturer: manufacturer || null,
          series: category || null,
          market_price_min: price,
          market_price_max: price,
        })
        .select()
        .single()

      if (insertFigureError || !newFigure) {
        console.error('Insert figure error:', insertFigureError)
        return NextResponse.json({
          error: `建立資料失敗: ${insertFigureError?.message || '未知錯誤'}`,
          details: insertFigureError
        }, { status: 500 })
      }

      figureId = newFigure.id
    }

    // 新增成交紀錄（待審核）
    const { error: insertTxError } = await supabase
      .from('transactions')
      .insert({
        figure_id: figureId,
        price,
        source: source || null,
        ip_hash: ipHash,
        status: 'pending',
      })

    if (insertTxError) {
      console.error('Insert transaction error:', insertTxError)
      return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
    }

    // 追蹤使用者到 unique_users 表（如果存在）
    try {
      await supabase
        .from('unique_users')
        .upsert({
          ip_hash: ipHash,
          last_seen: new Date().toISOString(),
        }, {
          onConflict: 'ip_hash',
        })
    } catch {
      // 忽略錯誤（表可能不存在）
    }

    // 市場價格不再自動更新，需要後台審核通過後才更新

    return NextResponse.json({ success: true, message: '提交成功，等待審核' })
  } catch (error) {
    console.error('Report price error:', error)
    return NextResponse.json({ error: '提交失敗' }, { status: 500 })
  }
}
