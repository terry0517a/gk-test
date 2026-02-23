import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // 統計 transactions 表中各 figure_id 出現次數，取 Top 5
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('figure_id')

    if (txError) {
      console.error('Popular figures transaction query error:', txError)
    }

    let figureIds: string[] = []

    if (transactions && transactions.length > 0) {
      // Count occurrences
      const countMap = new Map<string, number>()
      for (const t of transactions) {
        if (t.figure_id) {
          countMap.set(t.figure_id, (countMap.get(t.figure_id) || 0) + 1)
        }
      }
      // Sort by count desc, take top 5
      figureIds = Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id)
    }

    // If we have transaction-based IDs, fetch those figures
    if (figureIds.length > 0) {
      const { data: figures, error } = await supabase
        .from('figures')
        .select('id, name, manufacturer, image_url, market_price_min, market_price_max')
        .in('id', figureIds)

      if (!error && figures && figures.length > 0) {
        // Sort by the original order (most transactions first)
        const sorted = figureIds
          .map(id => figures.find(f => f.id === id))
          .filter(Boolean)

        return NextResponse.json({ figures: sorted })
      }
    }

    // Fallback: get recently updated figures with market prices
    const { data: fallbackFigures, error: fallbackError } = await supabase
      .from('figures')
      .select('id, name, manufacturer, image_url, market_price_min, market_price_max')
      .not('market_price_min', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5)

    if (fallbackError) {
      console.error('Popular figures fallback error:', fallbackError)
      return NextResponse.json({ figures: [] })
    }

    return NextResponse.json({ figures: fallbackFigures || [] })
  } catch (error) {
    console.error('Popular figures error:', error)
    return NextResponse.json({ figures: [] })
  }
}
