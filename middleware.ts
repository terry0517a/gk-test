import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 維護模式開關：設為 true 啟用維護模式
const MAINTENANCE_MODE = false

const maintenanceHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GK收藏家 - 維護中</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #ffffff 0%, #eef2ff 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .wrapper { text-align: center; }
    .logo { width: 420px; height: auto; margin-bottom: 32px; }
    .subtitle { font-size: 13px; color: #9ca3af; letter-spacing: 3px; margin-bottom: 40px; }
    .card {
      max-width: 380px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      border: 1px solid #f3f4f6;
    }
    .card-header { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; }
    .card-header svg { width: 20px; height: 20px; color: #6366f1; }
    .card-header span { font-weight: 700; font-size: 16px; color: #1f2937; }
    .card p { font-size: 14px; color: #6b7280; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <img src="/logo.png" alt="GK收藏家" class="logo" />
    <div class="subtitle">公仔行情追蹤平台</div>
    <div class="card">
      <div class="card-header">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        <span>系統升級中</span>
      </div>
      <p>我們正在進行資料更新與功能優化，<br>包括價格、圖片及工作室資訊。<br><br><span style="color:#9ca3af;font-size:13px;">預計近期完成，敬請期待！</span></p>
    </div>
  </div>
</body>
</html>`

export function middleware(request: NextRequest) {
  if (!MAINTENANCE_MODE) return NextResponse.next()

  const { pathname } = request.nextUrl

  // 允許 admin 頁面和 API 正常訪問
  if (pathname.startsWith('/admin') || pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/manifest.json' || pathname === '/logo.png') {
    return NextResponse.next()
  }

  return new NextResponse(maintenanceHtml, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
