import { NextRequest } from 'next/server'
import { createWorker, OEM } from 'tesseract.js'
import path from 'path'
import fs from 'fs'
import os from 'os'

// AI 分析功能已停用（節省 API 費用）
// const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_API_KEY = null // 停用 AI 分析
const AI_MODEL = 'google/gemini-2.0-flash-001'

// AI 輔助校正 OCR 文字並提取公仔資訊
async function aiExtractFigures(rawOcrText: string): Promise<{
  figures: Array<{
    name: string
    manufacturer: string
    price: number | null
    version: string | null
    scale: string | null
    condition: string | null
  }>
  correctedText: string
} | null> {
  if (!OPENROUTER_API_KEY) {
    console.log('[AI] OpenRouter API key not configured, skipping AI enhancement')
    return null
  }

  try {
    const prompt = `你是一個專門處理 GK 公仔/手辦商品資訊的 AI 助手。以下是從圖片 OCR 提取的原始文字，可能有錯字或辨識錯誤。

請：
1. 校正 OCR 錯誤（非常重要！）：
   - 移除中文字之間不必要的空格（如「五 條 悟」→「五條悟」）
   - 校正相似字錯誤（如「苛」→「啟」、「魴」→「航」、「巳」→「已」、「囗」→「口」）
   - 識別並修正動漫角色名稱（如五條悟、魯夫、索隆、鬼舞辻無慘等）
   - 識別並修正工作室名稱（如啟晨、拾光、沐秋等常被 OCR 誤認）
2. 從文字中提取公仔商品資訊
3. 特別注意提取「工作室/製造商」名稱

工作室名稱辨識規則（非常重要）：
- 工作室通常出現在商品名稱的開頭，例如「MRC 魯夫」中 MRC 是工作室
- 常見格式：【工作室名】商品名、[工作室名] 商品名、工作室名 商品名
- 工作室名稱常見特徵：
  * 英文縮寫：MRC、G5、DP9、BBT、TPA、LC、YZ、MH、PT、LX、JZ、CW 等
  * 英文名稱：Iron Studio、Prime 1、Bandai、MegaHouse、Kotobukiya 等
  * 中文名稱：夢工廠、星河動漫、黑馬動漫、拾光、沐秋、啟晨 等
  * 帶「Studio」「Studios」「工作室」「社」「堂」「閣」後綴的名稱
- 如果商品名稱開頭有明顯的工作室標識，務必提取出來

注意事項：
- 只提取「公仔/手辦/雕像/模型」相關商品
- 忽略：裝飾畫、冰箱貼、海報、掛畫、貼紙、徽章、鑰匙圈、吊飾、地毯、抱枕、卡磚、桌墊等非公仔商品
- 忽略：表頭文字如「商品名稱」「價格」「工作室」等
- 價格範圍應在 500-1000000 之間才是合理的

原始 OCR 文字：
"""
${rawOcrText.slice(0, 8000)}
"""

請以 JSON 格式回覆，格式如下：
{
  "figures": [
    {
      "name": "公仔名稱（不含工作室名，只保留角色/作品名）",
      "manufacturer": "工作室名稱（從名稱開頭提取，非常重要！沒有則空字串）",
      "price": 數字或null,
      "version": "版本（如限定版、DX版等，沒有則null）",
      "scale": "比例（如1/6、1/4等，沒有則null）",
      "condition": "狀態（如全新、二手等，沒有則null）"
    }
  ],
  "correctedText": "校正後的完整文字（可選，如果原文已經很清楚可省略）"
}

只回覆 JSON，不要有其他文字。`

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
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      console.error('[AI] OpenRouter API error:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 解析 JSON 回應
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        figures: parsed.figures || [],
        correctedText: parsed.correctedText || ''
      }
    }

    return null
  } catch (error) {
    console.error('[AI] Error calling OpenRouter:', error)
    return null
  }
}

// 取得正確的 tesseract.js worker 路徑
const getWorkerPath = () => {
  const workerPath = path.join(
    process.cwd(),
    'node_modules',
    'tesseract.js',
    'src',
    'worker-script',
    'node',
    'index.js'
  )
  return workerPath
}

// 驗證是否為有效的公仔商品名稱
function isValidProductName(name: string): boolean {
  // 太短的名稱
  if (name.length < 4) return false

  // 純數字或純符號
  if (/^[\d\s\.\,\-\+\$\%]+$/.test(name)) return false

  // 看起來像標題/表頭（包含「價格」「名稱」等但沒有具體商品資訊）
  if (/^[\[\]【】\s]*[虹信上販官商品]*價格[\]\】\:\s]*$/i.test(name)) return false
  if (/^[\[\]【】\s]*名稱[\]\】\:\s]*$/i.test(name)) return false
  if (/^[\[\]【】\s]*工作室[\]\】\:\s]*$/i.test(name)) return false

  // 純描述性文字
  const pureDescriptive = [
    /^[一二三四五六七八九十\d]+隻?一起[收賣售]?$/,
    /^合[售賣]$/,
    /^分[售賣]$/,
    /^可[議小]$/,
    /^含運$/,
    /^不含運$/,
  ]
  for (const pattern of pureDescriptive) {
    if (pattern.test(name)) return false
  }

  // 應該包含一些特徵（中文字、英文單詞、或特定關鍵字）
  const hasChineseChars = /[\u4e00-\u9fff]{2,}/.test(name)
  const hasEnglishWords = /[A-Za-z]{2,}/.test(name)
  const hasFigureKeywords = /(GK|公仔|手辦|模型|雕像|figure|statue)/i.test(name)
  const hasCharacterName = /(海賊|火影|鬼滅|七龍珠|龍珠|航海王|進擊|咒術|獵人|死神|JOJO|鏈鋸|間諜|我英)/i.test(name)

  return hasChineseChars || hasEnglishWords || hasFigureKeywords || hasCharacterName
}

// 清理商品名稱（移除常見的前綴詞）
function cleanProductName(name: string): string {
  // 移除開頭的「售」「賣」「出」等字
  let cleaned = name.replace(/^[售賣出徵收換]+\s*/, '')
  // 移除方括號包裹的標籤
  cleaned = cleaned.replace(/^\[.*?價格.*?\]\s*:?\s*/i, '')
  cleaned = cleaned.replace(/^【.*?價格.*?】\s*:?\s*/i, '')
  // 移除開頭的編號
  cleaned = cleaned.replace(/^\d+[.．、)\]】]\s*/, '')
  // 移除多餘空白
  cleaned = cleaned.trim()
  return cleaned
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

  const lines = text.split(/[\n\r]+/).filter(line => line.trim().length > 0)

  const scalePattern = /\b(1[\/:](?:1|2|3|4|5|6|7|8|10|12))\b/i

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
  ]

  const excludeKeywords = [
    // 非公仔商品
    '裝飾畫', '冰箱貼', '海報', '掛畫', '畫框', '貼紙', '徽章', '鑰匙圈', '吊飾',
    '地毯', '毛毯', '卡磚', '桌墊', '滑鼠墊', '抱枕', 'poster', 'keychain',
    '春聯', '對聯', '紅包', '明信片', '立牌', '遮陽', '畫社', '框畫',
    // 標題/表頭文字
    '商品名稱', '商品價錢', '商品價格', '販售文', '售出', '已售', '保留',
    '價格]', '[價格', '虹信價格', '上販官價格', '官方價格', '定價', '售價',
    '名稱', '工作室', '狀態', '備註', '說明',
    // 描述性文字
    '一起收', '一起賣', '合售', '分售', '可議', '議價', '小議', '含運', '不含運',
    '面交', '郵寄', '宅配', '超取', '店到店', '7-11', '全家',
    '私訊', '詢問', '留言', '聊聊', 'DM', 'PM',
    // 狀態描述
    '全新未拆封', '未拆封', '拆檢', '完整', '無盒', '有盒', '盒損', '本體完好'
  ]

  const conditionKeywords = ['全新未拆', '拆擺無損', '僅拆運輸', '拆檢無損', '拆擺有損', '全新', '二手']

  const numberedNames: Map<number, string> = new Map()
  const numberedPrices: Map<number, { price: number; condition: string | null }> = new Map()

  for (const line of lines) {
    let trimmedLine = line.trim()
    if (trimmedLine.length < 3) continue

    const lowerLine = trimmedLine.toLowerCase()
    if (excludeKeywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
      continue
    }

    // 格式1: 使用 ♦ 分隔
    const diamondMatch = trimmedLine.match(/^(\d+)[、.．]\s*(.+?)♦(\d+)/)
    if (diamondMatch) {
      const name = cleanProductName(diamondMatch[2])
      const price = parseInt(diamondMatch[3])
      if (price >= 500 && price <= 1000000 && name.length >= 2 && isValidProductName(name)) {
        results.push({
          name,
          manufacturer: extractManufacturer(name),
          price,
          version: extractVersion(name, versionKeywords),
          scale: extractScale(name, scalePattern),
          condition: null,
        })
      }
      continue
    }

    // 格式2: 編號+名稱（可能有「售」字開頭）
    const nameMatch = trimmedLine.match(/^(\d+)[.．、]\s*[售賣出]?\s*([^\$]+)$/)
    if (nameMatch && !trimmedLine.includes('$') && !trimmedLine.includes('元')) {
      const num = parseInt(nameMatch[1])
      const name = cleanProductName(nameMatch[2])
      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name)) {
        numberedNames.set(num, name)
      }
      continue
    }

    // 格式3: 編號+價格
    const priceMatch = trimmedLine.match(/^(\d+)[.．、]\s*\$?\s*(\d+)\s*元?\s*[（(]?([^）)]*)[）)]?/)
    if (priceMatch) {
      const num = parseInt(priceMatch[1])
      const price = parseInt(priceMatch[2])
      const conditionText = priceMatch[3] || ''
      let condition: string | null = null
      for (const kw of conditionKeywords) {
        if (conditionText.includes(kw)) {
          condition = kw
          break
        }
      }
      if (price >= 500 && price <= 1000000) {
        numberedPrices.set(num, { price, condition })
      }
      continue
    }

    // 格式4: 單行包含名稱和價格
    const inlineMatch = trimmedLine.match(/^[售賣出]?\s*(.+?)(?:NT\$?|＄|TWD|\$)\s*([\d,]+)/)
    if (inlineMatch) {
      const name = cleanProductName(inlineMatch[1])
      const price = parseInt(inlineMatch[2].replace(/,/g, ''))
      if (price >= 500 && price <= 1000000 && name.length >= 2 && isValidProductName(name)) {
        results.push({
          name,
          manufacturer: extractManufacturer(name),
          price,
          version: extractVersion(name, versionKeywords),
          scale: extractScale(name, scalePattern),
          condition: null,
        })
      }
      continue
    }

    // 格式5: OCR 可能識別的各種價格格式
    const ocrPricePatterns = [
      /^[售賣出]?\s*(.+?)\s+(\d{3,6})\s*元/,
      /^[售賣出]?\s*(.+?)\s+(\d{3,6})$/,
      /^[售賣出]?\s*(.+?)[：:]\s*(\d{3,6})/,
    ]
    for (const pattern of ocrPricePatterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        const name = cleanProductName(match[1])
        const price = parseInt(match[2])
        if (price >= 500 && price <= 1000000 && name.length >= 2 && isValidProductName(name)) {
          results.push({
            name,
            manufacturer: extractManufacturer(name),
            price,
            version: extractVersion(name, versionKeywords),
            scale: extractScale(name, scalePattern),
            condition: null,
          })
          break
        }
      }
    }
  }

  // 配對編號名稱和價格
  for (const [num, name] of numberedNames) {
    const priceInfo = numberedPrices.get(num)
    if (priceInfo && isValidProductName(name)) {
      results.push({
        name,
        manufacturer: extractManufacturer(name),
        price: priceInfo.price,
        version: extractVersion(name, versionKeywords),
        scale: extractScale(name, scalePattern),
        condition: priceInfo.condition,
      })
    }
  }

  return results
}

// 智能提取工作室名稱（使用模式匹配而非固定列表）
function extractManufacturer(name: string): string {
  // 模式優先順序：從最明確到最模糊

  // 1. 明確包含 "Studio" "Studios" "工作室" 的文字
  const studioPatterns = [
    // XX Studio / XX Studios 格式
    /([A-Za-z][A-Za-z0-9\s]{0,15}(?:Studio|Studios))/i,
    // XX工作室 格式
    /([\u4e00-\u9fff]{2,8}工作室)/,
    // 【XX】或 [XX] 內的工作室
    /【([^】]{2,15}(?:工作室|Studio|Studios)?)】/,
    /\[([^\]]{2,15}(?:工作室|Studio|Studios)?)\]/,
  ]

  for (const pattern of studioPatterns) {
    const match = name.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  // 2. 【XX】或 [XX] 格式（通常是工作室名稱）
  const bracketMatch = name.match(/【([^】]{2,12})】/) || name.match(/\[([^\]]{2,12})\]/)
  if (bracketMatch && bracketMatch[1]) {
    // 排除不是工作室的內容
    const content = bracketMatch[1]
    if (!/^(全新|二手|現貨|預購|代購|限定|特典)/.test(content)) {
      return content.trim()
    }
  }

  // 3. 開頭的英文單詞（通常是工作室縮寫或名稱）
  // 格式：大寫字母開頭，可能有數字，後面跟空格或中文
  const englishPatterns = [
    // 2-4個大寫字母+數字組合（如 G5, DP9, MRC, BBT）
    /^([A-Z]{1,4}[0-9]?)\s+/,
    // 英文單詞（首字母大寫）
    /^([A-Z][a-z]+(?:[A-Z][a-z]+)?)\s+/,
    // 全大寫英文單詞
    /^([A-Z]{2,10})\s+/,
  ]

  for (const pattern of englishPatterns) {
    const match = name.match(pattern)
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 12) {
      // 排除常見非工作室詞彙
      const word = match[1]
      if (!/^(GK|PVC|ABS|LED|USB|DIY|VIP|NEW|HOT|SALE)$/i.test(word)) {
        return word
      }
    }
  }

  // 4. 中文開頭的工作室格式
  const chineseMatch = name.match(/^([\u4e00-\u9fff]{2,6}(?:社|堂|閣|軒|坊))\s*/)
  if (chineseMatch && chineseMatch[1]) {
    return chineseMatch[1]
  }

  return ''
}

function extractVersion(name: string, versionKeywords: Array<{ pattern: RegExp; name: string }>): string | null {
  const versions: string[] = []
  for (const { pattern, name: verName } of versionKeywords) {
    if (pattern.test(name)) {
      versions.push(verName)
    }
  }
  return versions.length > 0 ? versions.join(' ') : null
}

function extractScale(name: string, scalePattern: RegExp): string | null {
  const match = name.match(scalePattern)
  if (match) {
    return match[1].replace(':', '/')
  }
  return null
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = []

  // 檢查是否需要串流回應
  const url = new URL(request.url)
  const streaming = url.searchParams.get('stream') === 'true'

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return Response.json({ error: '請上傳檔案' }, { status: 400 })
    }

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']

    // 收集圖片檔案
    const imageFiles: { buffer: Buffer; name: string }[] = []

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase()
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      if (imageExtensions.includes(ext)) {
        imageFiles.push({ buffer, name: file.name })
      }
    }

    if (imageFiles.length === 0) {
      return Response.json({ error: '沒有可處理的圖片檔案' }, { status: 400 })
    }

    // 串流模式
    if (streaming) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let allText = ''
          const allFigures: Array<{
            name: string
            manufacturer: string
            price: number | null
            version: string | null
            scale: string | null
            condition: string | null
          }> = []

          try {
            // 發送初始化訊息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'init', total: imageFiles.length })}\n\n`))

            // 建立 Tesseract worker (使用 CDN 避免本地路徑問題)
            const worker = await createWorker('chi_tra+eng', OEM.LSTM_ONLY, {
              workerPath: getWorkerPath(),
              logger: (m: { status: string }) => console.log('[OCR]', m.status)
            })

            // 處理每張圖片
            for (let i = 0; i < imageFiles.length; i++) {
              const { buffer, name } = imageFiles[i]
              const ext = path.extname(name).toLowerCase()
              const tempFilePath = path.join(os.tmpdir(), `ocr_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}${ext}`)
              tempFiles.push(tempFilePath)

              // 發送進度
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                current: i + 1,
                total: imageFiles.length,
                currentFile: name,
                stage: 'ocr'
              })}\n\n`))

              fs.writeFileSync(tempFilePath, buffer)

              try {
                const { data: { text } } = await worker.recognize(tempFilePath)
                allText += `--- ${name} ---\n${text}\n\n`
                const figures = extractFigureInfo(text)
                allFigures.push(...figures)
              } catch (ocrError) {
                console.error(`OCR 錯誤 (${name}):`, ocrError)
              }

              // 清理暫存檔
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
              }
            }

            await worker.terminate()

            // 使用 AI 增強辨識結果
            let finalFigures = allFigures
            let aiCorrectedText = ''

            if (OPENROUTER_API_KEY && allText.trim().length > 10) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                current: imageFiles.length,
                total: imageFiles.length,
                currentFile: 'AI 智能校正中...',
                stage: 'ai'
              })}\n\n`))

              const aiResult = await aiExtractFigures(allText)
              if (aiResult && aiResult.figures.length > 0) {
                // AI 結果優先，但也保留傳統方法的結果作為補充
                finalFigures = aiResult.figures
                aiCorrectedText = aiResult.correctedText
                console.log(`[AI] 成功提取 ${aiResult.figures.length} 個公仔資訊`)
              }
            }

            // 發送完成訊息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'complete',
              success: true,
              totalImages: imageFiles.length,
              rawTextLength: allText.length,
              figures: finalFigures,
              rawTextPreview: aiCorrectedText || allText.slice(0, 5000),
              aiEnhanced: finalFigures !== allFigures
            })}\n\n`))

          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : String(error)
            })}\n\n`))
          } finally {
            // 清理所有暫存檔
            for (const tempFile of tempFiles) {
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile)
              }
            }
            controller.close()
          }
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // 非串流模式（原有邏輯）
    let allText = ''
    const allFigures: Array<{
      name: string
      manufacturer: string
      price: number | null
      version: string | null
      scale: string | null
      condition: string | null
    }> = []

    const worker = await createWorker('chi_tra+eng', OEM.LSTM_ONLY, {
              workerPath: getWorkerPath(),
              logger: (m: { status: string }) => console.log('[OCR]', m.status)
            })

    for (let i = 0; i < imageFiles.length; i++) {
      const { buffer, name } = imageFiles[i]
      const ext = path.extname(name).toLowerCase()
      const tempFilePath = path.join(os.tmpdir(), `ocr_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}${ext}`)
      tempFiles.push(tempFilePath)

      fs.writeFileSync(tempFilePath, buffer)

      try {
        const { data: { text } } = await worker.recognize(tempFilePath)
        allText += `--- ${name} ---\n${text}\n\n`
        const figures = extractFigureInfo(text)
        allFigures.push(...figures)
      } catch (ocrError) {
        console.error(`OCR 錯誤 (${name}):`, ocrError)
      }
    }

    await worker.terminate()

    // 清理暫存檔
    for (const tempFile of tempFiles) {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    }

    // 使用 AI 增強辨識結果
    let finalFigures = allFigures
    let aiCorrectedText = ''
    let aiEnhanced = false

    if (OPENROUTER_API_KEY && allText.trim().length > 10) {
      console.log('[AI] Starting AI enhancement...')
      const aiResult = await aiExtractFigures(allText)
      if (aiResult && aiResult.figures.length > 0) {
        finalFigures = aiResult.figures
        aiCorrectedText = aiResult.correctedText
        aiEnhanced = true
        console.log(`[AI] 成功提取 ${aiResult.figures.length} 個公仔資訊`)
      }
    }

    return Response.json({
      success: true,
      totalImages: imageFiles.length,
      rawTextLength: allText.length,
      figures: finalFigures,
      rawTextPreview: aiCorrectedText || allText.slice(0, 5000),
      aiEnhanced
    })
  } catch (error) {
    console.error('OCR 錯誤:', error)
    for (const tempFile of tempFiles) {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    }
    return Response.json(
      { error: 'OCR 處理時發生錯誤: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
