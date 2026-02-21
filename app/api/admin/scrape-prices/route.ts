import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

// 抓取網頁內容
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      next: { revalidate: 3600 }, // 快取 1 小時
    })
    if (!res.ok) return null
    return await res.text()
  } catch (err) {
    console.error('Fetch error:', err)
    return null
  }
}

// 從 MyFigureCollection 搜尋
async function searchMFC(figureName: string): Promise<{ price: number | null; url: string | null }> {
  try {
    const searchUrl = `https://myfigurecollection.net/search.php?type_id=0&root=-1&type_strict=1&type_p=-1&keywords=${encodeURIComponent(figureName)}`
    const html = await fetchPage(searchUrl)
    if (!html) return { price: null, url: null }

    // 提取搜尋結果中的價格資訊
    // MFC 頁面格式：找到商品連結和價格
    const priceMatch = html.match(/¥([\d,]+)|￥([\d,]+)|\$([\d,]+)/i)
    if (priceMatch) {
      const priceStr = priceMatch[1] || priceMatch[2] || priceMatch[3]
      const price = parseInt(priceStr.replace(/,/g, ''))
      // 日幣轉新台幣
      const twdPrice = Math.round(price * 0.22)
      return { price: twdPrice, url: searchUrl }
    }
    return { price: null, url: searchUrl }
  } catch {
    return { price: null, url: null }
  }
}

// 從 SCC Toys 搜尋
async function searchSCCToys(figureName: string): Promise<{ price: number | null; url: string | null }> {
  try {
    const searchUrl = `https://www.scctoys.com.tw/search?q=${encodeURIComponent(figureName)}`
    const html = await fetchPage(searchUrl)
    if (!html) return { price: null, url: null }

    // 尋找價格標籤 (通常是 NT$ 或 TWD)
    const priceMatches = html.match(/NT\$?\s*([\d,]+)|TWD\s*([\d,]+)|定價[：:]\s*([\d,]+)/gi)
    if (priceMatches && priceMatches.length > 0) {
      for (const match of priceMatches) {
        const numMatch = match.match(/([\d,]+)/)
        if (numMatch) {
          const price = parseInt(numMatch[1].replace(/,/g, ''))
          if (price > 100 && price < 10000000) {
            return { price, url: searchUrl }
          }
        }
      }
    }
    return { price: null, url: searchUrl }
  } catch {
    return { price: null, url: null }
  }
}

// 從 NightWind Shop 搜尋
async function searchNightWind(figureName: string): Promise<{ price: number | null; url: string | null }> {
  try {
    const searchUrl = `https://www.nightwindshop.com/search?q=${encodeURIComponent(figureName)}`
    const html = await fetchPage(searchUrl)
    if (!html) return { price: null, url: null }

    // 尋找價格
    const priceMatches = html.match(/NT\$?\s*([\d,]+)|TWD\s*([\d,]+)|售價[：:]\s*([\d,]+)/gi)
    if (priceMatches && priceMatches.length > 0) {
      for (const match of priceMatches) {
        const numMatch = match.match(/([\d,]+)/)
        if (numMatch) {
          const price = parseInt(numMatch[1].replace(/,/g, ''))
          if (price > 100 && price < 10000000) {
            return { price, url: searchUrl }
          }
        }
      }
    }
    return { price: null, url: searchUrl }
  } catch {
    return { price: null, url: null }
  }
}

// 使用 AI 從網頁內容提取價格
async function extractPriceWithAI(html: string, figureName: string): Promise<number | null> {
  if (!OPENROUTER_API_KEY) return null

  // 清理 HTML，只保留文字內容
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 8000) // 限制長度

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{
          role: 'user',
          content: `從以下網頁內容中找出「${figureName}」GK公仔的定價/售價。

網頁內容：
${textContent}

規則：
1. 找出這個公仔的定價或售價
2. 如果有多個價格，選擇最可能是官方定價的
3. 如果是人民幣(¥/RMB/CNY)，乘以4.5轉新台幣
4. 如果是日幣(¥/JPY)，乘以0.22轉新台幣
5. 只回傳最終的新台幣數字
6. 找不到就回傳 0

回應格式：只回傳數字，例如 12000`
        }],
        max_tokens: 50,
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const priceText = data.choices?.[0]?.message?.content?.trim()
    if (priceText) {
      const price = parseInt(priceText.replace(/[^0-9]/g, ''))
      if (!isNaN(price) && price > 0 && price < 10000000) {
        return price
      }
    }
  } catch (err) {
    console.error('AI extraction error:', err)
  }
  return null
}

// 搜尋單一公仔的原價
export async function POST(request: NextRequest) {
  try {
    const { figureId, figureName, source } = await request.json()

    if (!figureName) {
      return NextResponse.json({ error: '請提供公仔名稱' }, { status: 400 })
    }

    let result: { price: number | null; url: string | null; source: string } = {
      price: null,
      url: null,
      source: '',
    }

    // 根據指定來源或依序搜尋
    const sources = source ? [source] : ['scctoys', 'nightwind', 'mfc']

    for (const src of sources) {
      switch (src) {
        case 'scctoys':
          const sccResult = await searchSCCToys(figureName)
          if (sccResult.price) {
            result = { ...sccResult, source: 'SCC Toys' }
          }
          break
        case 'nightwind':
          const nwResult = await searchNightWind(figureName)
          if (nwResult.price) {
            result = { ...nwResult, source: 'NightWind Shop' }
          }
          break
        case 'mfc':
          const mfcResult = await searchMFC(figureName)
          if (mfcResult.price) {
            result = { ...mfcResult, source: 'MyFigureCollection' }
          }
          break
      }

      if (result.price) break // 找到就停止
    }

    // 如果有 figureId，更新資料庫
    if (result.price && figureId) {
      await supabase
        .from('figures')
        .update({ original_price: result.price })
        .eq('id', figureId)
    }

    return NextResponse.json({
      success: !!result.price,
      price: result.price,
      source: result.source,
      url: result.url,
      message: result.price
        ? `從 ${result.source} 找到原價：NT$ ${result.price.toLocaleString()}`
        : '未找到價格資訊',
    })
  } catch (error) {
    console.error('Scrape price error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}

// 批量抓取（GET 請求）
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get('limit') || '10')

  try {
    // 取得沒有原價的公仔
    const { data: figures, error } = await supabase
      .from('figures')
      .select('id, name, manufacturer')
      .is('original_price', null)
      .limit(limit)

    if (error || !figures) {
      return NextResponse.json({ error: '取得資料失敗' }, { status: 500 })
    }

    const results: { name: string; price: number | null; source: string }[] = []

    for (const figure of figures) {
      const searchName = `${figure.name} ${figure.manufacturer || ''}`.trim()

      // 依序嘗試各來源
      let price: number | null = null
      let source = ''

      // SCC Toys
      const sccResult = await searchSCCToys(searchName)
      if (sccResult.price) {
        price = sccResult.price
        source = 'SCC Toys'
      }

      // NightWind
      if (!price) {
        const nwResult = await searchNightWind(searchName)
        if (nwResult.price) {
          price = nwResult.price
          source = 'NightWind Shop'
        }
      }

      // MFC
      if (!price) {
        const mfcResult = await searchMFC(searchName)
        if (mfcResult.price) {
          price = mfcResult.price
          source = 'MyFigureCollection'
        }
      }

      if (price) {
        await supabase
          .from('figures')
          .update({ original_price: price })
          .eq('id', figure.id)
      }

      results.push({ name: figure.name, price, source })

      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const successCount = results.filter(r => r.price).length

    return NextResponse.json({
      success: true,
      message: `完成！找到 ${successCount}/${figures.length} 個公仔的原價`,
      results,
    })
  } catch (error) {
    console.error('Batch scrape error:', error)
    return NextResponse.json({ error: '批量搜尋失敗' }, { status: 500 })
  }
}
