'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface Prize {
  name: string
  image: string
  condition: string
  threshold: number
}

const PRIZES: Prize[] = [
  {
    name: '大獎 — UNiQUE ART＞火影忍者＞1/6 旗木·卡卡西 & 宇智波帶土',
    image: '/prizes/grand.jpg',
    condition: '全新未拆',
    threshold: 10,
  },
  {
    name: '二獎 — 夢之船「五條悟」低配版 A 款',
    image: '/prizes/second.jpg',
    condition: '拆擺極新',
    threshold: 5,
  },
  {
    name: '三獎 — 神隱工作室 千尋 小千 無臉男',
    image: '/prizes/third.jpg',
    condition: '拆擺極新',
    threshold: 1,
  },
]

export default function PrizesPage() {
  const [email, setEmail] = useState('')
  const [tickets, setTickets] = useState<number | null>(null)
  const [querying, setQuerying] = useState(false)

  const [queryError, setQueryError] = useState('')

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault()
    setQueryError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setQueryError('請輸入有效的 Email 地址')
      return
    }
    setQuerying(true)
    try {
      const res = await fetch(`/api/lottery/tickets?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (res.ok) {
        setTickets(data.tickets)
      }
    } catch {
      // ignore
    } finally {
      setQuerying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/lottery" className="text-gray-400 hover:text-white transition-colors text-sm">
            &larr; 返回活動
          </Link>
          <h1 className="text-lg font-bold text-white">獎品情報</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* 快速查詢資格 */}
        <div className="bg-gray-800 rounded-xl p-5 mb-6">
          <p className="text-gray-300 text-sm mb-3">輸入 Email，查看你可以抽哪些獎品</p>
          <form onSubmit={handleQuery} className="flex gap-3">
            <input
              type="email"
              placeholder="輸入 Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={querying}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {querying ? '查詢中...' : '查詢資格'}
            </button>
          </form>
          {queryError && (
            <p className="mt-2 text-sm text-red-400">{queryError}</p>
          )}
          {tickets !== null && (
            <p className="mt-3 text-sm text-gray-300">
              你目前有 <span className="text-indigo-400 font-bold text-lg">{tickets}</span> 張抽獎券
            </p>
          )}
        </div>

        {/* 獎品卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PRIZES.map(prize => {
            const qualified = tickets !== null && tickets >= prize.threshold
            return (
              <div
                key={prize.name}
                className={`relative bg-gray-800 rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                  qualified
                    ? 'border-green-500/60 shadow-lg shadow-green-500/15'
                    : 'border-gray-700/50'
                }`}
              >
                {/* 達標徽章 */}
                {qualified && (
                  <div className="absolute top-3 right-3 z-10 w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                )}

                {/* 獎品圖片 */}
                <div className="relative w-full h-52 bg-gray-700">
                  <Image
                    src={prize.image}
                    alt={prize.name}
                    fill
                    className="object-cover"
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                  </div>
                </div>

                {/* 獎品資訊 */}
                <div className="p-4">
                  <h3 className="text-white font-bold mb-3">{prize.name}</h3>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-700 text-gray-300">
                      {prize.condition}
                    </span>
                    <span className="text-sm text-indigo-400 font-bold">
                      需 {prize.threshold} 張券
                    </span>
                  </div>
                  {qualified && (
                    <p className="mt-3 text-sm text-green-400 font-medium text-center bg-green-500/10 rounded-lg py-1.5">
                      已具備抽獎資格
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 注意事項 */}
        <div className="mt-6 bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
          <h3 className="text-sm font-bold text-gray-300 mb-3">注意事項</h3>
          <ul className="space-y-1.5 text-xs text-gray-400">
            <li className="flex gap-2">
              <span className="text-yellow-400 shrink-0">*</span>
              獎品運費需由得獎者自行負擔
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-400 shrink-0">*</span>
              大獎為全新未拆品，二獎及三獎為拆擺極新品
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-400 shrink-0">*</span>
              主辦方保留最終解釋權與修改獎品內容之權利
            </li>
          </ul>
        </div>
      </main>
    </div>
  )
}
