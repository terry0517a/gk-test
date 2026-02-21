import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // 取得總公仔數量
    const { count: figuresCount } = await supabase
      .from('figures')
      .select('*', { count: 'exact', head: true })

    // 取得有圖片的公仔數量
    const { count: withImageCount } = await supabase
      .from('figures')
      .select('*', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .neq('image_url', '')

    // 取得有原價的公仔數量
    const { count: withPriceCount } = await supabase
      .from('figures')
      .select('*', { count: 'exact', head: true })
      .not('original_price', 'is', null)

    // 取得總交易記錄數量
    const { count: transactionsCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })

    // 嘗試從 unique_users 表取得歷史使用者數量
    let uniqueUserCount = 0
    const { count: uniqueUsersCount, error: uniqueUsersError } = await supabase
      .from('unique_users')
      .select('*', { count: 'exact', head: true })

    if (!uniqueUsersError && uniqueUsersCount !== null) {
      // 如果 unique_users 表存在，使用它
      uniqueUserCount = uniqueUsersCount
    } else {
      // 回退到從 transactions 表統計
      const { data: uniqueUsers } = await supabase
        .from('transactions')
        .select('ip_hash')

      uniqueUserCount = uniqueUsers
        ? new Set(uniqueUsers.map(u => u.ip_hash)).size
        : 0
    }

    // 取得今日交易數量
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: todayTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())

    // 取得本週交易數量
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { count: weekTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())

    // 每日訪客統計（從 daily_visits 表）
    const todayStr = today.toISOString().slice(0, 10)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)

    let todayVisitors = 0
    let yesterdayVisitors = 0
    let weeklyVisitors: { date: string; count: number }[] = []

    try {
      // 今日訪客數
      const { count: todayCount } = await supabase
        .from('daily_visits')
        .select('*', { count: 'exact', head: true })
        .eq('visit_date', todayStr)

      todayVisitors = todayCount || 0

      // 昨日訪客數
      const { count: yesterdayCount } = await supabase
        .from('daily_visits')
        .select('*', { count: 'exact', head: true })
        .eq('visit_date', yesterdayStr)

      yesterdayVisitors = yesterdayCount || 0

      // 近 7 天每日訪客數
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)

      const { data: weeklyData } = await supabase
        .from('daily_visits')
        .select('visit_date')
        .gte('visit_date', sevenDaysAgoStr)
        .lte('visit_date', todayStr)

      // 用 Map 統計每日人數
      const dateCountMap = new Map<string, number>()
      if (weeklyData) {
        for (const row of weeklyData) {
          const d = row.visit_date
          dateCountMap.set(d, (dateCountMap.get(d) || 0) + 1)
        }
      }

      // 補齊 7 天（沒有資料的日期填 0）
      for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo)
        d.setDate(d.getDate() + i)
        const dateStr = d.toISOString().slice(0, 10)
        weeklyVisitors.push({
          date: dateStr,
          count: dateCountMap.get(dateStr) || 0,
        })
      }
    } catch {
      // daily_visits 表可能尚未建立，靜默失敗
    }

    return NextResponse.json({
      figures_count: figuresCount || 0,
      transactions_count: transactionsCount || 0,
      unique_users: uniqueUserCount,
      today_transactions: todayTransactions || 0,
      week_transactions: weekTransactions || 0,
      with_image_count: withImageCount || 0,
      without_image_count: (figuresCount || 0) - (withImageCount || 0),
      with_price_count: withPriceCount || 0,
      without_price_count: (figuresCount || 0) - (withPriceCount || 0),
      today_visitors: todayVisitors,
      yesterday_visitors: yesterdayVisitors,
      weekly_visitors: weeklyVisitors,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: '載入統計失敗' }, { status: 500 })
  }
}
