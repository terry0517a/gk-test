import { NextRequest } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

interface FigureRow {
  name: string
  manufacturer?: string
  series?: string
  version?: string
  scale?: string
  original_price?: number
  market_price_min?: number
  market_price_max?: number
  image_url?: string
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const streaming = url.searchParams.get('stream') === 'true'

  try {
    const { data } = await request.json()

    if (!data || !Array.isArray(data) || data.length === 0) {
      return Response.json({ error: '沒有資料可匯入' }, { status: 400 })
    }

    // 驗證並處理資料
    const validFigures: FigureRow[] = []
    const errors: string[] = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const rowNum = i + 1

      // 檢查必要欄位
      if (!row.name || !row.name.trim()) {
        errors.push(`第 ${rowNum} 行：缺少公仔名稱`)
        continue
      }

      const figure: FigureRow = {
        name: row.name.trim(),
        manufacturer: row.manufacturer?.trim() || undefined,
        series: row.series?.trim() || undefined,
      }

      // 處理價格欄位
      if (row.original_price) {
        const price = parseFloat(String(row.original_price).replace(/[,，]/g, ''))
        if (!isNaN(price) && price > 0) {
          figure.original_price = price
        }
      }

      if (row.market_price_min) {
        const price = parseFloat(String(row.market_price_min).replace(/[,，]/g, ''))
        if (!isNaN(price) && price > 0) {
          figure.market_price_min = price
        }
      }

      if (row.market_price_max) {
        const price = parseFloat(String(row.market_price_max).replace(/[,，]/g, ''))
        if (!isNaN(price) && price > 0) {
          figure.market_price_max = price
        }
      }

      // 版本和比例
      if (row.version?.trim()) {
        figure.version = row.version.trim()
      }
      if (row.scale?.trim()) {
        figure.scale = row.scale.trim()
      }

      // 圖片 URL
      if (row.image_url?.trim()) {
        figure.image_url = row.image_url.trim()
      }

      validFigures.push(figure)
    }

    if (validFigures.length === 0) {
      return Response.json({
        error: '沒有有效的資料',
        errors
      }, { status: 400 })
    }

    // 串流模式
    if (streaming) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let inserted = 0
          let updated = 0
          const importErrors: string[] = []

          try {
            // 發送初始化訊息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'init',
              total: validFigures.length
            })}\n\n`))

            for (let i = 0; i < validFigures.length; i++) {
              const figure = validFigures[i]

              // 每處理 10 筆發送一次進度
              if (i % 10 === 0 || i === validFigures.length - 1) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'progress',
                  current: i + 1,
                  total: validFigures.length,
                  currentItem: figure.name,
                  inserted,
                  updated
                })}\n\n`))
              }

              // 處理單筆資料
              const result = await processOneFigure(figure)
              if (result.error) {
                importErrors.push(`${figure.name}: ${result.error}`)
              } else if (result.inserted) {
                inserted++
              } else if (result.updated) {
                updated++
              }
            }

            // 發送完成訊息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'complete',
              success: true,
              message: `新增 ${inserted} 筆，更新 ${updated} 筆`,
              inserted,
              updated,
              errors: importErrors.slice(0, 10)
            })}\n\n`))

          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : String(error)
            })}\n\n`))
          } finally {
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
    let inserted = 0
    let updated = 0

    for (const figure of validFigures) {
      const result = await processOneFigure(figure)
      if (result.error) {
        errors.push(`${figure.name}: ${result.error}`)
      } else if (result.inserted) {
        inserted++
      } else if (result.updated) {
        updated++
      }
    }

    return Response.json({
      success: true,
      message: `新增 ${inserted} 筆，更新 ${updated} 筆`,
      inserted,
      updated,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error('Bulk import error:', error)
    return Response.json({ error: '匯入失敗' }, { status: 500 })
  }
}

// 處理單筆資料
async function processOneFigure(figure: FigureRow): Promise<{ inserted?: boolean; updated?: boolean; error?: string }> {
  try {
    // 檢查是否已存在 - 使用名稱+版本+比例判斷唯一性
    let query = supabase
      .from('figures')
      .select('*')
      .ilike('name', figure.name)

    // 版本匹配
    if (figure.version) {
      query = query.eq('version', figure.version)
    } else {
      query = query.is('version', null)
    }

    // 比例匹配
    if (figure.scale) {
      query = query.eq('scale', figure.scale)
    } else {
      query = query.is('scale', null)
    }

    const { data: existing } = await query.limit(1)

    if (existing && existing.length > 0) {
      // 已存在：合併/更新價格
      const existingFigure = existing[0]
      const updates: Record<string, unknown> = {}

      // 更新空白欄位，或擴展價格範圍
      if (!existingFigure.manufacturer && figure.manufacturer) {
        updates.manufacturer = figure.manufacturer
      }
      if (!existingFigure.series && figure.series) {
        updates.series = figure.series
      }
      if (!existingFigure.original_price && figure.original_price) {
        updates.original_price = figure.original_price
      }
      // 更新圖片（如果原本沒有圖片且新資料有圖片）
      if (!existingFigure.image_url && figure.image_url) {
        updates.image_url = figure.image_url
      }

      // 擴展市場價格範圍（取更低的最低價、更高的最高價）
      if (figure.market_price_min) {
        const newMin = figure.market_price_min
        const currentMin = existingFigure.market_price_min
        if (!currentMin || newMin < currentMin) {
          updates.market_price_min = newMin
        }
      }
      if (figure.market_price_max) {
        const newMax = figure.market_price_max
        const currentMax = existingFigure.market_price_max
        if (!currentMax || newMax > currentMax) {
          updates.market_price_max = newMax
        }
      }

      // 如果有需要更新的欄位
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('figures')
          .update(updates)
          .eq('id', existingFigure.id)

        if (updateError) {
          return { error: updateError.message }
        }
        return { updated: true }
      }
      return {} // 無需更新
    } else {
      // 不存在：新增公仔
      const { error: insertError } = await supabase
        .from('figures')
        .insert({
          name: figure.name,
          manufacturer: figure.manufacturer || null,
          series: figure.series || null,
          version: figure.version || null,
          scale: figure.scale || null,
          original_price: figure.original_price || null,
          market_price_min: figure.market_price_min || null,
          market_price_max: figure.market_price_max || null,
          image_url: figure.image_url || null,
        })

      if (insertError) {
        return { error: insertError.message }
      }
      return { inserted: true }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
