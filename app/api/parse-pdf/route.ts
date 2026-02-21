import { NextRequest, NextResponse } from 'next/server'

// AI 設定
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || null
const AI_MODEL = 'google/gemini-2.0-flash-001'

// 自訂 PDF 解析選項
const pdfOptions = {
  // 最大頁數限制
  max: 50,
}

// AI 輔助解析 PDF 文字並提取公仔資訊
async function aiParseFigures(rawText: string): Promise<Array<{
  name: string
  manufacturer: string
  price: number | null
  version: string | null
  scale: string | null
  condition: string | null
}> | null> {
  if (!OPENROUTER_API_KEY) {
    return null
  }

  try {
    const prompt = `你是一個專門處理 GK 公仔/手辦/雕像商品資訊的 AI 助手。以下是從 PDF 銷售清單中提取的文字內容。

請從中提取所有公仔/手辦/雕像商品的資訊。

提取規則：
1. **名稱 (name)**：公仔角色名稱，不包含工作室名。移除編號前綴（如 "1." "2、"）
2. **工作室 (manufacturer)**：製造商/工作室名稱。常見來源：
   - 名稱開頭的英文縮寫（如 MRC、G5、TNT、SXG）
   - 【】或[]內的文字
   - 帶有 Studio/工作室/社/堂 後綴的名稱
3. **價格 (price)**：這是賣家的市場售價（不是官方原價），數字，範圍 500-1000000
4. **版本 (version)**：版本資訊（如 DX版、限定版、普通版、黑色版等），沒有則 null
5. **比例 (scale)**：如 1/4、1/6、1/7 等，沒有則 null
6. **狀態 (condition)**：如 全新未拆、拆擺無損、二手 等，沒有則 null

忽略規則（不要提取這些）：
- 非公仔商品：裝飾畫、冰箱貼、海報、掛畫、貼紙、徽章、鑰匙圈、吊飾、地毯、抱枕、桌墊、框畫
- 表頭/標題：商品名稱、價格、工作室等欄位標題
- 已售出商品（標記為「已售」「已售出」「暫售」的）

PDF 原始文字：
"""
${rawText.slice(0, 12000)}
"""

請以 JSON 陣列格式回覆，每個元素格式如下：
[
  {
    "name": "角色名稱",
    "manufacturer": "工作室名稱或空字串",
    "price": 數字或null,
    "version": "版本或null",
    "scale": "比例或null",
    "condition": "狀態或null"
  }
]

只回覆 JSON 陣列，不要有其他文字。`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gk-figure-price.vercel.app',
        'X-Title': 'GK Figure Price Tracker'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 8000
      })
    })

    if (!response.ok) {
      console.error('[AI] OpenRouter API error:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 解析 JSON 回應（支援陣列或物件包裹）
    const arrayMatch = content.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) {
        // 過濾和驗證
        return parsed
          .filter((item: { name?: string; price?: number | null }) =>
            item.name && item.name.length >= 2 &&
            (!item.price || (item.price >= 500 && item.price <= 1000000))
          )
          .map((item: { name: string; manufacturer?: string; price?: number | null; version?: string | null; scale?: string | null; condition?: string | null }) => ({
            name: String(item.name).trim(),
            manufacturer: String(item.manufacturer || '').trim(),
            price: item.price ? Number(item.price) : null,
            version: item.version ? String(item.version).trim() : null,
            scale: item.scale ? String(item.scale).trim() : null,
            condition: item.condition ? String(item.condition).trim() : null,
          }))
      }
    }

    return null
  } catch (error) {
    console.error('[AI] Error calling OpenRouter:', error)
    return null
  }
}

// 從文字中提取公仔資訊
function extractFigureInfo(text: string): Array<{
  name: string
  manufacturer: string
  price: number | null
  version: string | null
  scale: string | null
  condition: string | null
}> {
  const results: Array<{
    name: string
    manufacturer: string
    price: number | null
    version: string | null
    scale: string | null
    condition: string | null
  }> = []

  // 用於去重
  const seen = new Set<string>()

  // 分割文字成行或段落
  const lines = text.split(/[\n\r]+/).filter(line => line.trim().length > 0)

  // 比例模式
  const scalePattern = /\b(1[\/:](?:1|2|3|4|5|6|7|8|10|12))\b/i

  // 版本關鍵字
  const versionKeywords = [
    { pattern: /黑色版|黑版|Black\s*Ver/gi, name: '黑色版' },
    { pattern: /白色版|白版|White\s*Ver/gi, name: '白色版' },
    { pattern: /透明版|透明色|Clear\s*Ver/gi, name: '透明版' },
    { pattern: /限量版|限量/gi, name: '限量版' },
    { pattern: /限定版|限定/gi, name: '限定版' },
    { pattern: /特典版|特典/gi, name: '特典版' },
    { pattern: /DX版|DX/gi, name: 'DX版' },
    { pattern: /EX版|EX/gi, name: 'EX版' },
    { pattern: /SP版|SP/gi, name: 'SP版' },
    { pattern: /Premium/gi, name: 'Premium版' },
    { pattern: /異色/gi, name: '異色版' },
    { pattern: /金屬色/gi, name: '金屬色版' },
    { pattern: /原色/gi, name: '原色版' },
    { pattern: /高配/gi, name: '高配版' },
    { pattern: /低配/gi, name: '低配版' },
    { pattern: /中配/gi, name: '中配版' },
  ]

  // 過濾關鍵字（非公仔商品）
  const excludeKeywords = [
    '裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙', '徽章', '鑰匙圈', '吊飾',
    '地毯', '毛毯', '卡磚', '桌墊', '滑鼠墊', '抱枕', 'poster', 'keychain',
    '春聯', '對聯', '紅包', '明信片', '立牌', '遮陽', '畫社', '框畫',
    '販售文', '已售出', '（已售出）', '暫售'
  ]

  // 狀況關鍵字
  const conditionKeywords = ['全新未拆', '拆擺無損', '僅拆運輸箱', '僅拆運輸', '拆檢無損', '拆擺有損', '拆擺微損', '拆檢有損', '全新', '二手', '有損', '無損']

  // 添加結果的輔助函數（帶去重）
  function addResult(name: string, price: number, condition: string | null = null) {
    // 清理名稱 - 移除開頭的各種編號格式
    name = name.trim()
      .replace(/^[\d]+[.．、·:：\-\s]+/, '') // 移除開頭編號（1. 2、3· 等）
      .replace(/^[#＃]\d+\s*/, '') // 移除 #1 #2 等格式
      .replace(/^No\.?\s*\d+\s*/i, '') // 移除 No.1 No1 等格式
      .replace(/^第\s*\d+\s*[件個項]\s*/, '') // 移除「第1件」等格式
      .replace(/【[^】]*】/g, '') // 移除【】標籤（工作室會另外提取）
      .replace(/\[[^\]]*\]/g, '') // 移除[]標籤
      .replace(/「[^」]*」/g, (match) => match.includes('損') ? '' : match) // 移除狀態標籤但保留其他
      .replace(/[（(][^）)]*[損][^）)]*[）)]/g, '') // 移除狀態括號
      .replace(/^\s*商品[：:]\s*/i, '') // 移除「商品：」前綴
      .replace(/\s*[，,]\s*$/, '') // 移除尾部逗號
      .replace(/\s+/g, ' ') // 合併多個空格
      .trim()

    // 移除尾部的純數字（可能是誤擷取的價格或編號）
    name = name.replace(/\s+\d{1,4}$/, '').trim()

    if (name.length < 2) return
    if (price < 500 || price > 1000000) return

    // 檢查是否應該排除
    const lowerName = name.toLowerCase()
    if (excludeKeywords.some(kw => lowerName.includes(kw.toLowerCase()))) {
      return
    }

    // 提取狀況並從名稱中移除
    let finalCondition = condition
    if (!finalCondition) {
      for (const kw of conditionKeywords) {
        if (name.includes(kw)) {
          finalCondition = kw
          name = name.replace(kw, '').trim()
          break
        }
      }
    }

    // 提取工作室並清理名稱
    const { manufacturer, cleanName } = extractAndCleanManufacturer(name)
    name = cleanName

    // 再次清理（移除可能殘留的分隔符）
    name = name.replace(/^[-_\s]+/, '').replace(/[-_\s]+$/, '').trim()

    if (name.length < 2) return

    // 去重 key（使用清理後的名稱）
    const key = `${name.toLowerCase().replace(/\s+/g, '')}|${price}`
    if (seen.has(key)) return
    seen.add(key)

    results.push({
      name,
      manufacturer,
      price,
      version: extractVersion(name, versionKeywords),
      scale: extractScale(name, scalePattern),
      condition: finalCondition,
    })
  }

  // 收集編號對應的名稱和價格（用於分離格式）
  const numberedItems: Map<number, { name: string; condition: string | null }> = new Map()

  // 暫存上一行的名稱（用於跨行配對）
  let pendingName: string | null = null
  let pendingCondition: string | null = null

  // 遍歷所有行
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    if (trimmedLine.length < 2) continue

    // 跳過純標籤行
    if (/^(商品名稱|商品狀況|商品價格|價格|售價|直購金額)[】\]：:]?\s*$/i.test(trimmedLine)) {
      continue
    }

    // 檢查是否應該排除
    const lowerLine = trimmedLine.toLowerCase()
    if (excludeKeywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
      pendingName = null
      continue
    }

    // ========== 格式1: 使用 ♦ 分隔的內聯格式 ==========
    // 如: "1、十年百忍 卡卡西（低）♦2800"
    const diamondMatch = trimmedLine.match(/^(\d+)[、.．·]\s*(.+?)♦\s*(\d+)/)
    if (diamondMatch) {
      const name = diamondMatch[2].trim()
      const price = parseInt(diamondMatch[3])
      addResult(name, price)
      pendingName = null
      continue
    }

    // ========== 格式2: 編號 + 名稱 + ]$. + 價格 ==========
    // 如: "1·新月 皮皮惡夢 白色「拆擺無損」]$.2300"
    const bracketPriceMatch = trimmedLine.match(/^(\d+)[、.．·]\s*(.+?)[」\]]\s*\$[.．]?\s*(\d+)/)
    if (bracketPriceMatch) {
      const name = bracketPriceMatch[2].trim()
      const price = parseInt(bracketPriceMatch[3])
      addResult(name, price)
      pendingName = null
      continue
    }

    // ========== 格式3: 名稱 + 價格 在同一行（各種分隔符）==========
    // 如: "神隱 卡西法$2500" 或 "TNT炎柱大哥 炎虎 7000" 或 "起源白一護4200拆擺小損有雙盒"
    const inlinePricePatterns = [
      // 名稱 $價格 或 NT$價格
      /^(.+?)(?:NT\$?|＄|\$)\s*([\d,]+)/,
      // 名稱 價格元
      /^(.+?)\s+(\d{3,6})元/,
      // 名稱 數字（末尾是價格）- 但名稱要有中文
      /^([^\d]*[\u4e00-\u9fff][^\d]*?)\s+(\d{3,6})$/,
    ]

    let matched = false
    for (const pattern of inlinePricePatterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        const name = match[1].trim()
        const price = parseInt(match[2].replace(/,/g, ''))
        if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
          addResult(name, price)
          pendingName = null
          matched = true
          break
        }
      }
    }
    if (matched) continue

    // ========== 格式4: 售價/價格行（配對上一行的名稱）==========
    // 如: "售價：15800" 或 "價格：3000" 或 "直購金額：2700"
    const priceLineMatch = trimmedLine.match(/^(?:售價|價格|商品價格|直購金額)[：:]\s*(?:NT\$?|＄|\$)?\s*([\d,]+)/)
    if (priceLineMatch) {
      const price = parseInt(priceLineMatch[1].replace(/,/g, ''))
      if (pendingName && price >= 500 && price <= 1000000) {
        addResult(pendingName, price, pendingCondition)
      }
      pendingName = null
      pendingCondition = null
      continue
    }

    // ========== 格式5: 【商品價格】數字 ==========
    const labelPriceMatch = trimmedLine.match(/【(?:商品)?價格】\s*(?:NT\$?|＄|\$)?\s*([\d,]+)/)
    if (labelPriceMatch) {
      const price = parseInt(labelPriceMatch[1].replace(/,/g, ''))
      if (pendingName && price >= 500 && price <= 1000000) {
        addResult(pendingName, price, pendingCondition)
      }
      pendingName = null
      pendingCondition = null
      continue
    }

    // ========== 格式6: 編號.名稱，狀態（下一行是價格）==========
    // 如: "1.Opm崖上的波妞，全新未拆"
    const numberedNameMatch = trimmedLine.match(/^(\d+)[.．、·]\s*(.+?)(?:[，,](.+))?$/)
    if (numberedNameMatch && !/售價|價格|直購/.test(trimmedLine)) {
      const num = parseInt(numberedNameMatch[1])
      let name = numberedNameMatch[2].trim()
      const extra = numberedNameMatch[3]?.trim() || ''

      // 檢查是否包含價格數字（如果有就直接處理）
      const embeddedPrice = name.match(/(\d{3,6})$/)
      if (embeddedPrice && /[\u4e00-\u9fff]/.test(name)) {
        const price = parseInt(embeddedPrice[1])
        name = name.replace(/\d{3,6}$/, '').trim()
        addResult(name, price)
        pendingName = null
        continue
      }

      // 檢查狀況
      let condition: string | null = null
      for (const kw of conditionKeywords) {
        if (extra.includes(kw) || name.includes(kw)) {
          condition = kw
          break
        }
      }

      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
        numberedItems.set(num, { name, condition })
        pendingName = name
        pendingCondition = condition
      }
      continue
    }

    // ========== 格式7: 【商品名稱】名稱 ==========
    const labelNameMatch = trimmedLine.match(/【商品名稱】[：:]?\s*(.+)/)
    if (labelNameMatch) {
      const name = labelNameMatch[1].trim()
      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
        pendingName = name
        pendingCondition = null
      }
      continue
    }

    // ========== 格式8: 商品名稱：名稱 ==========
    const colonNameMatch = trimmedLine.match(/^商品名稱[：:]\s*(.+)/i)
    if (colonNameMatch) {
      const name = colonNameMatch[1].trim()
      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
        pendingName = name
        pendingCondition = null
      }
      continue
    }

    // ========== 格式9: 商品：名稱 ==========
    const simpleNameMatch = trimmedLine.match(/^商品[：:]\s*(.+)/i)
    if (simpleNameMatch) {
      const name = simpleNameMatch[1].trim()
      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
        pendingName = name
        pendingCondition = null
      }
      continue
    }

    // ========== 格式10: 純名稱行（可能是接續上一個編號）==========
    // 如果這行看起來像是商品名稱（有中文，沒有價格關鍵字）
    if (/[\u4e00-\u9fff]/.test(trimmedLine) &&
        !/^(售價|價格|直購|商品價格)/.test(trimmedLine) &&
        !/^\d+[.．、]/.test(trimmedLine) &&
        trimmedLine.length >= 3 && trimmedLine.length <= 50) {
      // 檢查下一行是否是價格
      const nextLine = lines[i + 1]?.trim() || ''
      const nextPriceMatch = nextLine.match(/^(?:售價|價格|商品價格|直購金額)[：:]\s*(?:NT\$?|＄|\$)?\s*([\d,]+)/)
      if (nextPriceMatch) {
        pendingName = trimmedLine
        pendingCondition = null
        // 檢查狀況
        for (const kw of conditionKeywords) {
          if (trimmedLine.includes(kw)) {
            pendingCondition = kw
            break
          }
        }
      }
      continue
    }
  }

  return results
}

// 常見 GK 工作室名稱列表
const KNOWN_STUDIOS = [
  // 英文工作室
  'TNT', 'MRC', 'SXG', 'MKE', 'LC', 'LX', 'YW', 'PT', 'DP', 'DT', 'LB', 'CW', 'GK',
  'FOC', 'PPV', 'BBS', 'YZ', 'TPA', 'TT', 'BP', 'PD', 'RYU', 'OPM', 'Opm', 'JIMEI',
  'ZUOBAN', 'NIREN', 'G5', 'F3', 'PC', 'TX', 'DIM', 'TSUME', 'MH', 'DD', 'VKH',
  'CHIKARA', 'GMK', 'UCS', 'SURGE', 'LEO', 'YOYO', 'COLD', 'HOT', 'ZZXY', 'LK', 'ZZ',
  'BANDAI', 'MEGAHOUSE', 'KOTOBUKIYA', 'ALTER', 'GSC', 'GOOD SMILE', 'MAX FACTORY',
  // 中文工作室
  '神隱', '新月', '血翼', '暴風', '魔域', '幻影', '虛空', '龍魂', '鬼滅', '影流',
  '冰魄', '玄武', '青龍', '白虎', '朱雀', '幻夢', '靈魂', '夢境', '星辰', '月光',
  '黑暗', '光明', '烈焰', '寒冰', '雷霆', '狂風', '大地', '天空', '海洋', '森林',
  '火影', '鳳凰', '麒麟', '貔貅', '銀魂', '妖精', '惡魔', '天使', '死神', '海賊',
  '起源', '原點', '初始', '終焉', '永恆', '無限', '極限', '巔峰', '傳說', '神話',
]

// 提取工作室/製造商並返回清理後的名稱
function extractAndCleanManufacturer(name: string): { manufacturer: string; cleanName: string } {
  let manufacturer = ''
  let cleanName = name

  // 1. 先檢查【】或[]內的工作室名稱
  const bracketMatch = name.match(/【([^】]+)】/) || name.match(/\[([^\]]+)\]/)
  if (bracketMatch) {
    manufacturer = bracketMatch[1].trim()
    cleanName = name.replace(bracketMatch[0], '').trim()
    return { manufacturer, cleanName }
  }

  // 2. 檢查開頭是否有已知工作室名稱（不區分大小寫）
  for (const studio of KNOWN_STUDIOS) {
    const studioPattern = new RegExp(`^${studio}\\s+`, 'i')
    if (studioPattern.test(name)) {
      manufacturer = studio.toUpperCase()
      cleanName = name.replace(studioPattern, '').trim()
      return { manufacturer, cleanName }
    }
    // 也檢查工作室名稱後跟著的格式（如 "TNT-" 或 "TNT_"）
    const studioWithSepPattern = new RegExp(`^${studio}[-_\\s]+`, 'i')
    if (studioWithSepPattern.test(name)) {
      manufacturer = studio.toUpperCase()
      cleanName = name.replace(studioWithSepPattern, '').trim()
      return { manufacturer, cleanName }
    }
  }

  // 3. 檢查英文開頭的工作室模式（2-6個大寫字母開頭）
  const englishStudioMatch = name.match(/^([A-Z]{2,6})\s+(.+)/)
  if (englishStudioMatch) {
    manufacturer = englishStudioMatch[1]
    cleanName = englishStudioMatch[2].trim()
    return { manufacturer, cleanName }
  }

  // 4. 檢查 "XXX Studio" 或 "XXX工作室" 模式
  const studioSuffixMatch = name.match(/^([A-Za-z0-9\u4e00-\u9fff]+(?:\s*(?:Studio|Studios|工作室)))\s+(.+)/i)
  if (studioSuffixMatch) {
    manufacturer = studioSuffixMatch[1].trim()
    cleanName = studioSuffixMatch[2].trim()
    return { manufacturer, cleanName }
  }

  // 5. 檢查中文工作室開頭（2-4個中文字）
  const chineseStudioMatch = name.match(/^([\u4e00-\u9fff]{2,4})\s+(.+)/)
  if (chineseStudioMatch) {
    const potentialStudio = chineseStudioMatch[1]
    // 確認是工作室而不是角色名
    if (KNOWN_STUDIOS.includes(potentialStudio)) {
      manufacturer = potentialStudio
      cleanName = chineseStudioMatch[2].trim()
      return { manufacturer, cleanName }
    }
  }

  return { manufacturer, cleanName }
}

// 提取版本
function extractVersion(name: string, versionKeywords: Array<{ pattern: RegExp; name: string }>): string | null {
  const versions: string[] = []
  for (const { pattern, name: verName } of versionKeywords) {
    if (pattern.test(name)) {
      versions.push(verName)
    }
  }
  return versions.length > 0 ? versions.join(' ') : null
}

// 提取比例
function extractScale(name: string, scalePattern: RegExp): string | null {
  const match = name.match(scalePattern)
  if (match) {
    return match[1].replace(':', '/')
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: '只支援 PDF 檔案' }, { status: 400 })
    }

    // 讀取檔案內容
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 解析 PDF
    let pdfData
    try {
      // 使用 pdf-parse/lib/pdf-parse 直接導入避免測試檔案問題
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse')
      // 嘗試解析，如果失敗會拋出錯誤
      pdfData = await pdfParse(buffer, pdfOptions)

      // 檢查是否成功提取文字
      if (!pdfData || !pdfData.text) {
        console.error('PDF parse returned empty result')
        return NextResponse.json(
          { error: 'PDF 解析失敗，無法提取文字內容。請確認 PDF 不是掃描檔或圖片 PDF。' },
          { status: 400 }
        )
      }
    } catch (pdfError: unknown) {
      const errorMessage = pdfError instanceof Error ? pdfError.message : String(pdfError)
      console.error('PDF parse error:', errorMessage)

      // 根據錯誤類型提供更具體的訊息
      if (errorMessage.includes('encrypt') || errorMessage.includes('password')) {
        return NextResponse.json(
          { error: 'PDF 檔案已加密，請使用未加密的 PDF。' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: `PDF 解析失敗: ${errorMessage.slice(0, 100)}` },
        { status: 400 }
      )
    }

    const text = pdfData.text

    // 先用 regex 提取作為備用
    const regexFigures = extractFigureInfo(text)

    // 嘗試 AI 分析
    let figures = regexFigures
    let aiEnhanced = false

    if (OPENROUTER_API_KEY && text.trim().length > 20) {
      console.log('[AI] Starting AI-enhanced PDF parsing...')
      const aiResult = await aiParseFigures(text)
      if (aiResult && aiResult.length > 0) {
        figures = aiResult
        aiEnhanced = true
        console.log(`[AI] 成功提取 ${aiResult.length} 個公仔（regex: ${regexFigures.length} 個）`)
      } else {
        console.log('[AI] AI 分析無結果，使用 regex 結果')
      }
    }

    return NextResponse.json({
      success: true,
      totalPages: pdfData.numpages,
      rawTextLength: text.length,
      figures,
      aiEnhanced,
      regexCount: regexFigures.length,
      rawTextPreview: text.slice(0, 2000),
    })
  } catch (error) {
    console.error('PDF 解析錯誤:', error)
    return NextResponse.json(
      { error: '解析 PDF 時發生錯誤' },
      { status: 500 }
    )
  }
}
