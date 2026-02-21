import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { figureId } = await request.json()

    if (!figureId) {
      return NextResponse.json({ error: '缺少公仔 ID' }, { status: 400 })
    }

    // 取得公仔資料
    const { data: figure, error: figureError } = await supabase
      .from('figures')
      .select('*')
      .eq('id', figureId)
      .single()

    if (figureError || !figure) {
      return NextResponse.json({ error: '找不到公仔' }, { status: 404 })
    }

    // 建立搜尋關鍵字 - 嘗試更精確的搜尋
    const searchQuery = `${figure.name} ${figure.manufacturer || ''} GK 公仔 定價 價格 NT`.trim()

    // 使用 Google Custom Search 搜尋
    let searchResults: string[] = []
    let googleError: string | null = null

    if (!GOOGLE_API_KEY || !GOOGLE_CX_ID) {
      return NextResponse.json({
        error: 'Google API 未設定',
        details: { hasApiKey: !!GOOGLE_API_KEY, hasCxId: !!GOOGLE_CX_ID }
      }, { status: 500 })
    }

    try {
      const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(searchQuery)}&num=5`
      console.log('Searching:', searchQuery)
      const googleRes = await fetch(googleUrl)
      const googleData = await googleRes.json()

      console.log('Google response:', JSON.stringify(googleData).slice(0, 500))

      if (googleData.error) {
        googleError = googleData.error.message || 'Google API 錯誤'
      } else if (googleData.items) {
        searchResults = googleData.items.map((item: { title: string; snippet: string }) =>
          `${item.title}: ${item.snippet}`
        )
      }
    } catch (err) {
      console.error('Google search error:', err)
      googleError = err instanceof Error ? err.message : '搜尋請求失敗'
    }

    if (googleError) {
      return NextResponse.json({
        error: `Google 搜尋失敗: ${googleError}`,
        searchQuery
      }, { status: 500 })
    }

    if (searchResults.length === 0) {
      return NextResponse.json({
        error: '搜尋不到相關資訊',
        searchQuery
      }, { status: 404 })
    }

    // 使用 AI 分析搜尋結果提取價格
    let extractedPrice: number | null = null
    let aiError: string | null = null

    if (OPENROUTER_API_KEY) {
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [
              {
                role: 'user',
                content: `從以下搜尋結果中找出「${figure.name}」GK公仔的價格（定價、售價、原價皆可）。

搜尋結果：
${searchResults.join('\n\n')}

規則：
1. 找出任何與這個公仔相關的價格數字
2. 優先找新台幣(NT$、TWD)價格，其次找人民幣或日幣價格
3. 如果是人民幣，乘以4.5轉換成新台幣
4. 如果是日幣，乘以0.22轉換成新台幣
5. 只回傳最終的新台幣數字，不要任何其他文字
6. 如果完全找不到價格，回傳 0

範例回應：3500`
              }
            ],
            max_tokens: 50,
          }),
        })

        if (!aiRes.ok) {
          aiError = `AI API 錯誤: ${aiRes.status}`
        } else {
          const aiData = await aiRes.json()
          const priceText = aiData.choices?.[0]?.message?.content?.trim()
          console.log('AI response:', priceText)

          if (priceText) {
            const parsed = parseInt(priceText.replace(/[^0-9]/g, ''), 10)
            if (!isNaN(parsed) && parsed > 0 && parsed < 10000000) {
              extractedPrice = parsed
            }
          }
        }
      } catch (err) {
        console.error('AI extraction error:', err)
        aiError = err instanceof Error ? err.message : 'AI 分析失敗'
      }
    } else {
      aiError = 'OpenRouter API 未設定'
    }

    if (!extractedPrice) {
      return NextResponse.json({
        error: aiError || '無法從搜尋結果中提取價格',
        searchResults: searchResults.slice(0, 3),
        searchQuery,
      }, { status: 404 })
    }

    // 更新資料庫
    const { error: updateError } = await supabase
      .from('figures')
      .update({ original_price: extractedPrice })
      .eq('id', figureId)

    if (updateError) {
      return NextResponse.json({ error: '更新資料庫失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      original_price: extractedPrice,
      message: `已找到並儲存原價：NT$ ${extractedPrice.toLocaleString()}`,
    })
  } catch (error) {
    console.error('Fetch original price error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
