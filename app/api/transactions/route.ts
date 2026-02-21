import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Figure } from '@/types/database'
import crypto from 'crypto'

// 簡單的 IP hash 用於防濫用
function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'collector-salt').digest('hex').slice(0, 16)
}

// 檢查價格合理性
function validatePrice(
  price: number,
  originalPrice: number | null,
  marketPriceMin: number | null,
  marketPriceMax: number | null
): { valid: boolean; reason?: string } {
  if (price <= 0) {
    return { valid: false, reason: '價格必須大於 0' }
  }

  if (price > 10000000) {
    return { valid: false, reason: '價格超出合理範圍' }
  }

  // 如果有市場價格參考，檢查是否偏離太多
  if (marketPriceMin && marketPriceMax) {
    const marketAvg = (marketPriceMin + marketPriceMax) / 2
    if (price > marketAvg * 10 || price < marketAvg * 0.1) {
      return { valid: false, reason: '價格與市場行情差異過大，請確認是否輸入正確' }
    }
  }

  // 如果有原價參考
  if (originalPrice && price > originalPrice * 20) {
    return { valid: false, reason: '價格與原價差異過大，請確認是否輸入正確' }
  }

  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { figure_id, price, source } = body

    if (!figure_id || !price) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // 取得公仔資料以驗證價格
    const { data, error: figureError } = await supabase
      .from('figures')
      .select('*')
      .eq('id', figure_id)
      .single()

    const figure = data as Figure | null

    if (figureError || !figure) {
      return NextResponse.json({ error: '找不到此公仔' }, { status: 404 })
    }

    // 驗證價格合理性
    const validation = await validatePrice(
      price,
      figure.original_price,
      figure.market_price_min,
      figure.market_price_max
    )

    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason }, { status: 400 })
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

    if (count && count >= 10) {
      return NextResponse.json({ error: '提交頻率過高，請稍後再試' }, { status: 429 })
    }

    // 新增成交紀錄（預設為待審核狀態）
    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        figure_id,
        price,
        source: source || null,
        ip_hash: ipHash,
        status: 'pending', // 待審核
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert transaction error:', insertError)
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

    // 注意：市場價格不再自動更新，需要後台審核通過後才更新

    return NextResponse.json({ success: true, transaction, message: '提交成功，等待審核' })
  } catch (error) {
    console.error('Transaction error:', error)
    return NextResponse.json({ error: '提交失敗' }, { status: 500 })
  }
}
