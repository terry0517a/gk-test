const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID!

interface GoogleSearchResult {
  title: string
  link: string
  snippet: string
  pagemap?: {
    cse_image?: { src: string }[]
    metatags?: { [key: string]: string }[]
  }
}

interface GoogleSearchResponse {
  items?: GoogleSearchResult[]
}

export async function searchGoogle(query: string): Promise<GoogleSearchResult[]> {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', GOOGLE_API_KEY)
  url.searchParams.set('cx', GOOGLE_CX_ID)
  url.searchParams.set('q', query)
  url.searchParams.set('num', '5')

  const response = await fetch(url.toString())

  if (!response.ok) {
    console.error('Google CX API error:', response.statusText)
    return []
  }

  const data: GoogleSearchResponse = await response.json()
  return data.items || []
}

// 從 Google 搜尋結果中提取價格資訊
export async function extractPriceFromSearch(query: string): Promise<{
  priceRange?: { min: number; max: number }
  sources: string[]
}> {
  const results = await searchGoogle(`${query} 價格 成交`)

  const sources: string[] = []
  const prices: number[] = []

  for (const result of results) {
    sources.push(result.link)

    // 嘗試從 snippet 中提取價格
    const priceMatches = result.snippet.match(/(?:NT\$?|TWD|台幣)\s*([\d,]+)/gi)
    if (priceMatches) {
      for (const match of priceMatches) {
        const price = parseInt(match.replace(/[^\d]/g, ''), 10)
        if (price > 0 && price < 10000000) {
          prices.push(price)
        }
      }
    }
  }

  if (prices.length === 0) {
    return { sources }
  }

  return {
    priceRange: {
      min: Math.min(...prices),
      max: Math.max(...prices),
    },
    sources,
  }
}
