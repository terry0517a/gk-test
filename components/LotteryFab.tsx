'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function LotteryFab() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // 在抽獎頁面與 admin 頁面不顯示
  if (pathname?.startsWith('/lottery') || pathname?.startsWith('/admin')) {
    return null
  }

  return (
    <>
      {/* FAB 按鈕 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
        GK 報價王
      </button>

      {/* 側邊欄 Sheet */}
      {open && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-gray-900 shadow-2xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <h2 className="text-white font-bold">GK 報價王</h2>
                <p className="text-gray-400 text-xs">回報成交 & 查詢抽獎券</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/lottery"
                  onClick={() => setOpen(false)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  完整頁面 &rarr;
                </Link>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors text-lg"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* 內容 iframe */}
            <iframe
              src="/lottery"
              className="flex-1 w-full border-0"
              title="GK 報價王"
            />
          </div>
        </>
      )}
    </>
  )
}
