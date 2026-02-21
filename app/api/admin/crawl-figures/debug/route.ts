import { NextRequest, NextResponse } from 'next/server'

// Debug: 檢查網站實際回傳的 HTML
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const site = searchParams.get('site') || 'scctoys'

  const urls: Record<string, string> = {
    scctoys: 'https://www.scctoys.com.tw/categories/gk-figure',
    scctoys2: 'https://www.scctoys.com.tw/categories/gk',
    scctoys3: 'https://www.scctoys.com.tw/',
    nightwind: 'https://www.nightwindshop.com/categories/gk',
    nightwind2: 'https://www.nightwindshop.com/',
    hpoi: 'https://www.hpoi.net/hobby/all?order=add&category=gk',
  }

  const url = urls[site] || urls.scctoys

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    })

    const status = res.status
    const html = await res.text()

    // 提取一些關鍵資訊
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || 'N/A'

    // 找所有連結
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]).slice(0, 30)

    // 找價格相關
    const prices = [...html.matchAll(/NT\$?\s*[\d,]+|TWD\s*[\d,]+|定價[：:]\s*[\d,]+|售價[：:]\s*[\d,]+|¥[\d,]+/gi)].map(m => m[0]).slice(0, 20)

    // 找產品相關 class
    const productClasses = [...html.matchAll(/class="([^"]*product[^"]*)"/gi)].map(m => m[1]).slice(0, 20)
    const itemClasses = [...html.matchAll(/class="([^"]*item[^"]*)"/gi)].map(m => m[1]).slice(0, 20)
    const cardClasses = [...html.matchAll(/class="([^"]*card[^"]*)"/gi)].map(m => m[1]).slice(0, 20)

    return NextResponse.json({
      url,
      status,
      title,
      html_length: html.length,
      html_preview: html.slice(0, 3000),
      links: links.filter(l => l.includes('product') || l.includes('item') || l.includes('gk')),
      prices,
      classes: {
        product: productClasses,
        item: itemClasses,
        card: cardClasses,
      },
    })
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      url,
    }, { status: 500 })
  }
}
