import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

// 生成短分享碼
function generateShareCode(): string {
  return crypto.randomBytes(4).toString('hex') // 8 字元
}

// 建立分享連結
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items, nickname } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '沒有追蹤項目可分享' }, { status: 400 })
    }

    // 簡化儲存的資料
    const simplifiedItems = items.map((item: {
      figure_id: string
      name: string
      image_url: string | null
      current_price_min: number | null
      current_price_max: number | null
    }) => ({
      figure_id: item.figure_id,
      name: item.name,
      image_url: item.image_url,
      price_min: item.current_price_min,
      price_max: item.current_price_max,
    }))

    // 生成唯一的分享碼
    let shareCode = generateShareCode()
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from('shared_collections')
        .select('id')
        .eq('share_code', shareCode)
        .single()

      if (!existing) break

      shareCode = generateShareCode()
      attempts++
    }

    // 儲存分享資料
    const { data, error } = await supabase
      .from('shared_collections')
      .insert({
        share_code: shareCode,
        nickname: nickname || null,
        items: simplifiedItems,
      })
      .select()
      .single()

    if (error) {
      console.error('Create share error:', error)
      return NextResponse.json({ error: '建立分享連結失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      share_code: shareCode,
      share_url: `/share/${shareCode}`,
      items_count: simplifiedItems.length,
    })
  } catch (error) {
    console.error('Share collection error:', error)
    return NextResponse.json({ error: '分享失敗' }, { status: 500 })
  }
}

// 取得所有公開分享（可選，用於探索功能）
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get('limit') || '20')

  try {
    const { data, error } = await supabase
      .from('shared_collections')
      .select('share_code, nickname, items, view_count, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Get shared collections error:', error)
      return NextResponse.json({ error: '載入失敗' }, { status: 500 })
    }

    const collections = (data || []).map(item => ({
      share_code: item.share_code,
      nickname: item.nickname,
      items_count: Array.isArray(item.items) ? item.items.length : 0,
      view_count: item.view_count,
      created_at: item.created_at,
    }))

    return NextResponse.json({ collections })
  } catch (error) {
    console.error('Get shared collections error:', error)
    return NextResponse.json({ error: '載入失敗' }, { status: 500 })
  }
}
