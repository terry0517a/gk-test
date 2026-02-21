import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// 執行爬蟲腳本（背景執行，不等待完成）
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    // 檢查是否在本地開發環境
    const isLocal = process.env.NODE_ENV === 'development'
    if (!isLocal) {
      return NextResponse.json({
        error: '爬蟲功能僅支援本地開發環境。請在終端機執行: node scripts/crawler.js',
      }, { status: 400 })
    }

    if (action === 'crawl') {
      // 背景執行爬蟲（不阻塞）
      const scriptPath = path.join(process.cwd(), 'scripts', 'crawler.js')
      const child = spawn('node', [scriptPath], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      return NextResponse.json({
        success: true,
        message: '爬蟲已在背景啟動！請稍後查看 crawler-output.csv',
        hint: '完成後執行「只匯入」將資料存入資料庫',
      })
    }

    if (action === 'crawl-resume' || action === 'crawl-stage2') {
      // 續傳模式：跳過第一階段，直接處理已收集的連結
      const linksPath = path.join(process.cwd(), 'crawler-links.json')
      if (!fs.existsSync(linksPath)) {
        return NextResponse.json({
          error: '找不到之前收集的連結檔案 (crawler-links.json)，請先執行完整爬取',
        }, { status: 400 })
      }

      const scriptPath = path.join(process.cwd(), 'scripts', 'crawler.js')
      const child = spawn('node', [scriptPath, '--stage2'], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      return NextResponse.json({
        success: true,
        message: '爬蟲已在續傳模式啟動！將跳過第一階段，直接處理已收集的連結',
        hint: '完成後執行「只匯入」將資料存入資料庫',
      })
    }

    if (action === 'import') {
      // 檢查 CSV 是否存在
      const csvPath = path.join(process.cwd(), 'crawler-output.csv')
      if (!fs.existsSync(csvPath)) {
        return NextResponse.json({
          error: '找不到 crawler-output.csv，請先執行爬蟲',
        }, { status: 400 })
      }

      // 執行匯入（這個比較快，可以同步等待）
      return new Promise<Response>((resolve) => {
        const scriptPath = path.join(process.cwd(), 'scripts', 'import-crawled.js')
        const child = spawn('node', [scriptPath], {
          timeout: 600000, // 10 分鐘
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (data) => { stdout += data.toString() })
        child.stderr?.on('data', (data) => { stderr += data.toString() })

        child.on('close', (code) => {
          if (code !== 0) {
            resolve(NextResponse.json({
              success: false,
              error: `匯入失敗 (code: ${code})`,
              output: stderr || stdout,
            }, { status: 500 }))
            return
          }

          const insertMatch = stdout.match(/新增: (\d+) 筆/)
          const updateMatch = stdout.match(/更新: (\d+) 筆/)
          const skipMatch = stdout.match(/跳過: (\d+) 筆/)
          const inserted = insertMatch ? parseInt(insertMatch[1]) : 0
          const updated = updateMatch ? parseInt(updateMatch[1]) : 0
          const skipped = skipMatch ? parseInt(skipMatch[1]) : 0

          resolve(NextResponse.json({
            success: true,
            message: `匯入完成！新增 ${inserted} 筆，更新 ${updated} 筆，跳過 ${skipped} 筆`,
            inserted,
            updated,
            skipped,
          }))
        })

        child.on('error', (error) => {
          resolve(NextResponse.json({
            success: false,
            error: error.message,
          }, { status: 500 }))
        })
      })
    }

    if (action === 'check-status') {
      // 檢查爬蟲狀態
      const csvPath = path.join(process.cwd(), 'crawler-output.csv')

      if (!fs.existsSync(csvPath)) {
        return NextResponse.json({
          status: 'no_data',
          message: '尚未爬取任何資料',
        })
      }

      const stats = fs.statSync(csvPath)
      const content = fs.readFileSync(csvPath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim()).length - 1 // 減去標題行

      return NextResponse.json({
        status: 'has_data',
        message: `已有 ${lines} 筆爬取資料`,
        count: lines,
        lastModified: stats.mtime.toISOString(),
      })
    }

    if (action === 'check-progress') {
      // 檢查爬蟲即時進度
      const progressPath = path.join(process.cwd(), 'crawler-progress.json')

      if (!fs.existsSync(progressPath)) {
        return NextResponse.json({
          status: 'idle',
          message: '爬蟲尚未啟動',
        })
      }

      try {
        const progressContent = fs.readFileSync(progressPath, 'utf-8')
        const progress = JSON.parse(progressContent)
        return NextResponse.json(progress)
      } catch {
        return NextResponse.json({
          status: 'idle',
          message: '無法讀取進度',
        })
      }
    }

    return NextResponse.json({ error: '無效的操作' }, { status: 400 })
  } catch (error) {
    console.error('Run crawler error:', error)
    return NextResponse.json({ error: '執行失敗' }, { status: 500 })
  }
}
