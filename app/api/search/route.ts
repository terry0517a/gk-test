import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { searchGoogle } from '@/lib/google-cx'
import type { Figure } from '@/types/database'
import crypto from 'crypto'

// 簡單的 IP hash 用於統計
function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip + 'collector-salt').digest('hex').slice(0, 16)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const tag = searchParams.get('tag')

  if (!query && !tag) {
    return NextResponse.json({ error: '請輸入搜尋關鍵字或選擇標籤' }, { status: 400 })
  }

  // 記錄使用者（搜尋即統計）
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const ipHash = hashIP(ip)
    const now = new Date().toISOString()

    // 先嘗試插入新使用者（用 admin 繞過 RLS）
    const { error: insertError } = await supabaseAdmin
      .from('unique_users')
      .insert({
        ip_hash: ipHash,
        first_seen: now,
        last_seen: now,
      })

    // 如果已存在，更新 last_seen
    if (insertError && insertError.code === '23505') {
      await supabaseAdmin
        .from('unique_users')
        .update({ last_seen: now })
        .eq('ip_hash', ipHash)
    }
  } catch {
    // 忽略錯誤，不影響搜尋功能
  }

  try {
    // 1. 搜尋資料庫 - 擴展搜尋範圍
    let dbQuery = supabase.from('figures').select('*')

    // 如果有標籤篩選
    if (tag) {
      dbQuery = dbQuery.eq('tag', tag)
    }

    // 如果有關鍵字搜尋
    if (query) {
      // 處理常見的字體變體（繁簡轉換）
      const charMap: Record<string, string> = {
        '條': '条', '条': '條',
        '悟': '悟',
        '龍': '龙', '龙': '龍',
        '貓': '猫', '猫': '貓',
      }

      // 將查詢拆分為多個關鍵字（空格分隔）
      const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)

      if (keywords.length <= 1) {
        // 單一關鍵字：原有邏輯
        const queryVariants = [query]
        let altQuery = query
        for (const [from, to] of Object.entries(charMap)) {
          altQuery = altQuery.replace(new RegExp(from, 'g'), to)
        }
        if (altQuery !== query) {
          queryVariants.push(altQuery)
        }

        const searchConditions = queryVariants
          .map(q => `name.ilike.%${q}%,manufacturer.ilike.%${q}%,series.ilike.%${q}%,tag.ilike.%${q}%`)
          .join(',')

        dbQuery = dbQuery.or(searchConditions)
      } else {
        // 多關鍵字：每個關鍵字都必須在某個欄位中出現
        // Supabase 不支援跨欄位 AND+OR 組合，改用寬鬆查詢後在 JS 端過濾
        // 先用第一個關鍵字查詢，取回較大的候選集
        const firstKw = keywords[0]
        const queryVariants = [firstKw]
        let altKw = firstKw
        for (const [from, to] of Object.entries(charMap)) {
          altKw = altKw.replace(new RegExp(from, 'g'), to)
        }
        if (altKw !== firstKw) queryVariants.push(altKw)

        const searchConditions = queryVariants
          .map(q => `name.ilike.%${q}%,manufacturer.ilike.%${q}%,series.ilike.%${q}%,tag.ilike.%${q}%`)
          .join(',')

        dbQuery = dbQuery.or(searchConditions)
      }
    }

    const { data: rawFigures, error } = await dbQuery.order('name').limit(500)

    // 多關鍵字時在 JS 端做交叉過濾
    let figures = rawFigures || []
    if (query) {
      const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)
      if (keywords.length > 1) {
        figures = figures.filter(fig => {
          const searchableText = [fig.name, fig.manufacturer, fig.series, fig.tag, fig.version]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return keywords.every(kw => searchableText.toLowerCase().includes(kw.toLowerCase()))
        })
      }
    }
    figures = figures.slice(0, 200)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
    }

    // 2. 同時搜尋 Google（如果有設定且有關鍵字）
    let googleResults: Awaited<ReturnType<typeof searchGoogle>> = []
    if (query && process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX_ID) {
      try {
        googleResults = await searchGoogle(`${query} 公仔 價格`)
      } catch (e) {
        console.error('Google search error:', e)
      }
    }

    // 3. 查詢每個公仔最近的成交日期
    const figureIds = (figures || []).map(f => f.id)
    let dealDateMap: Record<string, string> = {}

    if (figureIds.length > 0) {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('figure_id, deal_date')
        .in('figure_id', figureIds)
        .not('deal_date', 'is', null)
        .order('deal_date', { ascending: false })

      if (transactions) {
        for (const t of transactions) {
          if (!dealDateMap[t.figure_id]) {
            dealDateMap[t.figure_id] = t.deal_date
          }
        }
      }
    }

    const enrichedFigures = (figures || []).map(f => ({
      ...f,
      last_deal_date: dealDateMap[f.id] || null,
    }))

    return NextResponse.json({
      figures: enrichedFigures,
      google_results: googleResults,
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
