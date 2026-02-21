import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

interface CrawledFigure {
  name: string
  manufacturer: string | null
  original_price: number | null
  source_url: string
  source_site: string
}

// 抓取網頁
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) return null
    return await res.text()
  } catch (err) {
    console.error('Fetch error:', url, err)
    return null
  }
}

// 從價格字串提取數字
function extractPrice(priceStr: string): number | null {
  if (!priceStr) return null
  const cleaned = priceStr.replace(/[^\d]/g, '')
  const price = parseInt(cleaned)
  if (!isNaN(price) && price > 100 && price < 10000000) {
    return price
  }
  return null
}

// ========== SCC Toys 爬蟲 ==========
async function crawlSCCToys(page: number = 1): Promise<CrawledFigure[]> {
  const figures: CrawledFigure[] = []

  try {
    // SCC Toys 商品列表頁
    const url = `https://www.scctoys.com.tw/categories/gk-figure?page=${page}`
    const html = await fetchPage(url)
    if (!html) return figures

    // 解析商品卡片 - 根據常見電商網站結構
    // 尋找商品連結和標題
    const productMatches = html.matchAll(/<a[^>]*href="([^"]*\/products\/[^"]*)"[^>]*>[\s\S]*?<\/a>/gi)
    const productUrls = new Set<string>()

    for (const match of productMatches) {
      const href = match[1]
      if (href && !productUrls.has(href)) {
        productUrls.add(href.startsWith('http') ? href : `https://www.scctoys.com.tw${href}`)
      }
    }

    // 抓取每個商品頁面
    for (const productUrl of Array.from(productUrls).slice(0, 20)) {
      const productHtml = await fetchPage(productUrl)
      if (!productHtml) continue

      // 提取商品名稱
      const titleMatch = productHtml.match(/<h1[^>]*class="[^"]*product[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                         productHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                         productHtml.match(/<title>([^<|]+)/i)

      // 提取價格
      const priceMatch = productHtml.match(/NT\$?\s*([\d,]+)/i) ||
                         productHtml.match(/售價[：:\s]*([\d,]+)/i) ||
                         productHtml.match(/定價[：:\s]*([\d,]+)/i)

      if (titleMatch) {
        const name = titleMatch[1].trim()
          .replace(/\s*[-–|]\s*.*$/, '') // 移除網站名稱
          .replace(/\s+/g, ' ')

        // 嘗試從名稱提取工作室
        const studioMatch = name.match(/^([A-Za-z0-9]+\s*(?:Studio|Studios|工作室)?)\s+/i)
        const manufacturer = studioMatch ? studioMatch[1].trim() : null

        figures.push({
          name: manufacturer && studioMatch ? name.replace(studioMatch[0], '').trim() : name,
          manufacturer,
          original_price: priceMatch ? extractPrice(priceMatch[1]) : null,
          source_url: productUrl,
          source_site: 'SCC Toys',
        })
      }

      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (err) {
    console.error('SCC Toys crawl error:', err)
  }

  return figures
}

// ========== NightWind Shop 爬蟲 ==========
async function crawlNightWind(page: number = 1): Promise<CrawledFigure[]> {
  const figures: CrawledFigure[] = []

  try {
    const url = `https://www.nightwindshop.com/categories/gk?page=${page}`
    const html = await fetchPage(url)
    if (!html) return figures

    // 找商品連結
    const productMatches = html.matchAll(/<a[^>]*href="([^"]*\/products\/[^"]*)"[^>]*>/gi)
    const productUrls = new Set<string>()

    for (const match of productMatches) {
      const href = match[1]
      if (href && !productUrls.has(href)) {
        productUrls.add(href.startsWith('http') ? href : `https://www.nightwindshop.com${href}`)
      }
    }

    for (const productUrl of Array.from(productUrls).slice(0, 20)) {
      const productHtml = await fetchPage(productUrl)
      if (!productHtml) continue

      const titleMatch = productHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                         productHtml.match(/<title>([^<|]+)/i)

      const priceMatch = productHtml.match(/NT\$?\s*([\d,]+)/i) ||
                         productHtml.match(/售價[：:\s]*([\d,]+)/i)

      if (titleMatch) {
        const name = titleMatch[1].trim()
          .replace(/\s*[-–|]\s*.*$/, '')
          .replace(/\s+/g, ' ')

        const studioMatch = name.match(/^([A-Za-z0-9]+\s*(?:Studio|Studios|工作室)?)\s+/i)
        const manufacturer = studioMatch ? studioMatch[1].trim() : null

        figures.push({
          name: manufacturer && studioMatch ? name.replace(studioMatch[0], '').trim() : name,
          manufacturer,
          original_price: priceMatch ? extractPrice(priceMatch[1]) : null,
          source_url: productUrl,
          source_site: 'NightWind',
        })
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (err) {
    console.error('NightWind crawl error:', err)
  }

  return figures
}

// ========== HPOI 爬蟲（需要處理動態內容）==========
async function crawlHPOI(page: number = 1): Promise<CrawledFigure[]> {
  const figures: CrawledFigure[] = []

  try {
    // HPOI API endpoint (如果有的話)
    const url = `https://www.hpoi.net/hobby/all?order=add&page=${page}&category=gk`
    const html = await fetchPage(url)
    if (!html) return figures

    // HPOI 的商品資訊通常在特定格式
    // 嘗試找 JSON 資料或商品卡片
    const itemMatches = html.matchAll(/<div[^>]*class="[^"]*item-card[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi)

    for (const match of itemMatches) {
      const itemHtml = match[0]

      const nameMatch = itemHtml.match(/title="([^"]+)"/) ||
                        itemHtml.match(/<h\d[^>]*>([^<]+)<\/h\d>/i)

      const priceMatch = itemHtml.match(/¥\s*([\d,]+)/i) ||
                         itemHtml.match(/￥\s*([\d,]+)/i)

      const studioMatch = itemHtml.match(/data-maker="([^"]+)"/) ||
                          itemHtml.match(/maker[：:]\s*([^<]+)/i)

      if (nameMatch) {
        const name = nameMatch[1].trim()
        let price = priceMatch ? extractPrice(priceMatch[1]) : null

        // 人民幣轉新台幣
        if (price) {
          price = Math.round(price * 4.5)
        }

        figures.push({
          name,
          manufacturer: studioMatch ? studioMatch[1].trim() : null,
          original_price: price,
          source_url: url,
          source_site: 'HPOI',
        })
      }
    }
  } catch (err) {
    console.error('HPOI crawl error:', err)
  }

  return figures
}

// ========== 主要 API ==========

// POST: 開始爬取指定網站
export async function POST(request: NextRequest) {
  try {
    const { site, pages = 1 } = await request.json()

    let allFigures: CrawledFigure[] = []

    for (let page = 1; page <= pages; page++) {
      let pageFigures: CrawledFigure[] = []

      switch (site) {
        case 'scctoys':
          pageFigures = await crawlSCCToys(page)
          break
        case 'nightwind':
          pageFigures = await crawlNightWind(page)
          break
        case 'hpoi':
          pageFigures = await crawlHPOI(page)
          break
        case 'all':
          const scc = await crawlSCCToys(page)
          const nw = await crawlNightWind(page)
          pageFigures = [...scc, ...nw]
          break
        default:
          return NextResponse.json({ error: '無效的網站' }, { status: 400 })
      }

      allFigures = [...allFigures, ...pageFigures]

      // 頁面之間暫停
      if (page < pages) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // 存入資料庫
    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const figure of allFigures) {
      if (!figure.name) continue

      // 檢查是否已存在
      const { data: existing } = await supabase
        .from('figures')
        .select('id, original_price, manufacturer')
        .ilike('name', `%${figure.name.slice(0, 20)}%`)
        .limit(1)

      if (existing && existing.length > 0) {
        // 更新缺少的資料
        const updates: Record<string, unknown> = {}

        if (!existing[0].original_price && figure.original_price) {
          updates.original_price = figure.original_price
        }
        if (!existing[0].manufacturer && figure.manufacturer) {
          updates.manufacturer = figure.manufacturer
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('figures')
            .update(updates)
            .eq('id', existing[0].id)
          updated++
        } else {
          skipped++
        }
      } else {
        // 新增
        const { error } = await supabase
          .from('figures')
          .insert({
            name: figure.name,
            manufacturer: figure.manufacturer,
            original_price: figure.original_price,
          })

        if (!error) {
          inserted++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `爬取完成！新增 ${inserted} 筆，更新 ${updated} 筆，跳過 ${skipped} 筆`,
      total_crawled: allFigures.length,
      inserted,
      updated,
      skipped,
      sample: allFigures.slice(0, 5),
    })
  } catch (error) {
    console.error('Crawl error:', error)
    return NextResponse.json({ error: '爬取失敗' }, { status: 500 })
  }
}

// GET: 取得爬取狀態或測試
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const site = searchParams.get('site') || 'scctoys'
  const test = searchParams.get('test') === 'true'

  if (test) {
    // 測試模式：只抓一頁
    let figures: CrawledFigure[] = []

    switch (site) {
      case 'scctoys':
        figures = await crawlSCCToys(1)
        break
      case 'nightwind':
        figures = await crawlNightWind(1)
        break
      case 'hpoi':
        figures = await crawlHPOI(1)
        break
    }

    return NextResponse.json({
      success: true,
      site,
      count: figures.length,
      figures: figures.slice(0, 10),
    })
  }

  return NextResponse.json({
    available_sites: ['scctoys', 'nightwind', 'hpoi', 'all'],
    usage: 'POST with { site: "scctoys", pages: 5 } to crawl',
  })
}
