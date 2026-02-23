'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface PriceReport {
  id: string
  email: string
  figure_name: string
  deal_price: number
  has_screenshot: boolean
  has_shared_social: boolean
  screenshot_url: string | null
  social_share_url: string | null
  status: string
  created_at: string
}

interface TicketResult {
  tickets: number
  reports: PriceReport[]
  breakdown: {
    base: number
    screenshot: number
    social: number
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.length <= 2 ? local : local.slice(0, 2)
  return `${visible}***@${domain}`
}

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'approved':
      return { text: '已通過', className: 'bg-green-500/20 text-green-400' }
    case 'rejected':
      return { text: '未通過', className: 'bg-red-500/20 text-red-400' }
    default:
      return { text: '審核中', className: 'bg-yellow-500/20 text-yellow-400' }
  }
}

function ImageUpload({
  label,
  bonus,
  preview,
  uploading,
  onSelect,
  onRemove,
}: {
  label: string
  bonus: string
  preview: string | null
  uploading: boolean
  onSelect: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <p className="text-sm font-medium text-gray-300 mb-1.5">
        {label} <span className="text-indigo-400 text-sm">({bonus})</span>
      </p>
      {preview ? (
        <div className="relative">
          <div className="relative w-full h-40 rounded-lg overflow-hidden bg-gray-700">
            <Image src={preview} alt={label} fill className="object-contain" />
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center text-white text-sm transition-colors"
          >
            &times;
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 border-2 border-dashed border-gray-600 hover:border-indigo-500 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <span className="text-sm">上傳中...</span>
          ) : (
            <>
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="text-sm">點擊上傳圖片</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onSelect(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

const GRAND_PRIZE_THRESHOLD = 10

export default function LotteryPage() {
  // 回報表單狀態
  const [formData, setFormData] = useState({
    email: '',
    figure_name: '',
    studio: '',
    deal_price: '',
    deal_date: '',
  })
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [socialShareUrl, setSocialShareUrl] = useState<string | null>(null)
  const [socialSharePreview, setSocialSharePreview] = useState<string | null>(null)
  const [uploadingSocial, setUploadingSocial] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 查詢狀態
  const [queryEmail, setQueryEmail] = useState('')
  const [ticketResult, setTicketResult] = useState<TicketResult | null>(null)
  const [querying, setQuerying] = useState(false)
  const [queryError, setQueryError] = useState('')

  // 目前顯示的區塊
  const [activeTab, setActiveTab] = useState<'report' | 'query'>('report')

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/lottery/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      setSubmitMessage({ type: 'error', text: data.error || '圖片上傳失敗' })
      return null
    }
    return data.url
  }

  async function handleScreenshotSelect(file: File) {
    setUploadingScreenshot(true)
    setSubmitMessage(null)
    const localPreview = URL.createObjectURL(file)
    setScreenshotPreview(localPreview)
    const url = await uploadImage(file)
    if (url) {
      setScreenshotUrl(url)
      setScreenshotPreview(url)
    } else {
      setScreenshotPreview(null)
    }
    URL.revokeObjectURL(localPreview)
    setUploadingScreenshot(false)
  }

  async function handleSocialShareSelect(file: File) {
    setUploadingSocial(true)
    setSubmitMessage(null)
    const localPreview = URL.createObjectURL(file)
    setSocialSharePreview(localPreview)
    const url = await uploadImage(file)
    if (url) {
      setSocialShareUrl(url)
      setSocialSharePreview(url)
    } else {
      setSocialSharePreview(null)
    }
    URL.revokeObjectURL(localPreview)
    setUploadingSocial(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitMessage(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setSubmitMessage({ type: 'error', text: '請輸入有效的 Email 地址' })
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/lottery/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          figure_name: formData.figure_name,
          studio: formData.studio,
          deal_price: Number(formData.deal_price),
          deal_date: formData.deal_date || null,
          screenshot_url: screenshotUrl,
          social_share_url: socialShareUrl,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitMessage({ type: 'error', text: data.error || '提交失敗' })
        return
      }

      setSubmitMessage({ type: 'success', text: '回報成功！已獲得抽獎券，請至查詢頁面確認。' })
      setFormData({ email: '', figure_name: '', studio: '', deal_price: '', deal_date: '' })
      setScreenshotUrl(null)
      setScreenshotPreview(null)
      setSocialShareUrl(null)
      setSocialSharePreview(null)
    } catch {
      setSubmitMessage({ type: 'error', text: '網路錯誤，請稍後再試' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault()
    setQuerying(true)
    setQueryError('')
    setTicketResult(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(queryEmail)) {
      setQueryError('請輸入有效的 Email 地址')
      setQuerying(false)
      return
    }

    try {
      const res = await fetch(`/api/lottery/tickets?email=${encodeURIComponent(queryEmail)}`)
      const data = await res.json()

      if (!res.ok) {
        setQueryError(data.error || '查詢失敗')
        return
      }

      setTicketResult(data)
    } catch {
      setQueryError('網路錯誤，請稍後再試')
    } finally {
      setQuerying(false)
    }
  }

  const progressPercent = ticketResult
    ? Math.min((ticketResult.tickets / GRAND_PRIZE_THRESHOLD) * 100, 100)
    : 0
  const ticketsRemaining = ticketResult
    ? Math.max(GRAND_PRIZE_THRESHOLD - ticketResult.tickets, 0)
    : GRAND_PRIZE_THRESHOLD

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← 返回首頁
          </Link>
          <div className="text-center">
            <h1 className="text-lg font-bold text-white">GK 報價王</h1>
            <p className="text-xs text-gray-400">加入回報行列，一起透明化 GK 公仔市場。</p>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* 獎品情報入口 */}
        <Link
          href="/lottery/prizes"
          className="mb-4 flex items-center justify-between bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-xl p-5 hover:border-indigo-500/60 transition-all group"
        >
          <div>
            <h3 className="text-white font-bold">獎品情報</h3>
            <p className="text-gray-400 text-sm mt-0.5">查看本次抽獎的全部獎項</p>
          </div>
          <span className="text-indigo-400 group-hover:translate-x-1 transition-transform text-xl">&rarr;</span>
        </Link>

        {/* Tab 切換 */}
        <div className="flex rounded-lg bg-gray-800 p-1 mb-6">
          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'report'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            回報成交
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'query'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            查詢抽獎券
          </button>
        </div>

        {/* 回報表單 */}
        {activeTab === 'report' && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 overflow-hidden">
            <h2 className="text-xl font-bold text-white mb-1">回報成交紀錄</h2>
            <p className="text-gray-400 text-sm mb-6">
              每回報一筆可獲得 1 張抽獎券，附截圖再 +1 張，分享社群額外 +1 張！
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="example@gmail.com"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 作品名稱 */}
              <div>
                <label htmlFor="figure_name" className="block text-sm font-medium text-gray-300 mb-1.5">
                  作品名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  id="figure_name"
                  type="text"
                  placeholder="例如：海賊王 魯夫 四檔 1/4"
                  value={formData.figure_name}
                  onChange={e => setFormData(prev => ({ ...prev, figure_name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 工作室 */}
              <div>
                <label htmlFor="studio" className="block text-sm font-medium text-gray-300 mb-1.5">
                  工作室 <span className="text-red-400">*</span>
                </label>
                <input
                  id="studio"
                  type="text"
                  placeholder="例如：MegaHouse、海賊王工作室"
                  value={formData.studio}
                  onChange={e => setFormData(prev => ({ ...prev, studio: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 成交價格 */}
              <div>
                <label htmlFor="deal_price" className="block text-sm font-medium text-gray-300 mb-1.5">
                  成交價格 (NT$) <span className="text-red-400">*</span>
                </label>
                <input
                  id="deal_price"
                  type="number"
                  placeholder="例如：12000"
                  min="1"
                  value={formData.deal_price}
                  onChange={e => setFormData(prev => ({ ...prev, deal_price: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 成交日期 */}
              <div>
                <label htmlFor="deal_date" className="block text-sm font-medium text-gray-300 mb-1.5">
                  成交日期 <span className="text-red-400">*</span>
                </label>
                <input
                  id="deal_date"
                  type="date"
                  value={formData.deal_date}
                  onChange={e => setFormData(prev => ({ ...prev, deal_date: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 成交截圖上傳 */}
              <p className="text-xs text-yellow-400">※ 請遮住可能洩漏個人資料的資訊，謝謝。</p>
              <ImageUpload
                label="成交截圖"
                bonus="+1 張抽獎券"
                preview={screenshotPreview}
                uploading={uploadingScreenshot}
                onSelect={handleScreenshotSelect}
                onRemove={() => { setScreenshotUrl(null); setScreenshotPreview(null) }}
              />

              {/* 社群分享截圖上傳 */}
              <ImageUpload
                label="社群分享截圖"
                bonus="首次 +1 張抽獎券"
                preview={socialSharePreview}
                uploading={uploadingSocial}
                onSelect={handleSocialShareSelect}
                onRemove={() => { setSocialShareUrl(null); setSocialSharePreview(null) }}
              />

              {/* 提交訊息 */}
              {submitMessage && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    submitMessage.type === 'success'
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {submitMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || uploadingScreenshot || uploadingSocial}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {submitting ? '提交中...' : '提交回報'}
              </button>
            </form>
          </div>
        )}

        {/* 查詢區塊 */}
        {activeTab === 'query' && (
          <div className="space-y-6">
            {/* 查詢表單 */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-1">查詢抽獎券</h2>
              <p className="text-gray-400 text-sm mb-4">輸入 Email 查看目前累積的抽獎券數量</p>

              <form onSubmit={handleQuery} className="flex gap-3">
                <input
                  type="email"
                  placeholder="輸入 Email"
                  value={queryEmail}
                  onChange={e => setQueryEmail(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
                <button
                  type="submit"
                  disabled={querying}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  {querying ? '查詢中...' : '查詢'}
                </button>
              </form>

              {queryError && (
                <div className="mt-3 p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                  {queryError}
                </div>
              )}
            </div>

            {/* 查詢結果 */}
            {ticketResult && (
              <>
                {/* 抽獎券統計 */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <div className="text-center mb-6">
                    <p className="text-gray-400 text-sm mb-1">
                      {maskEmail(queryEmail)} 的抽獎券
                    </p>
                    <p className="text-5xl font-bold text-indigo-400">
                      {ticketResult.tickets}
                      <span className="text-lg text-gray-400 font-normal ml-1">張</span>
                    </p>
                    {ticketResult.reports.some(r => r.status === 'pending') && (
                      <p className="text-yellow-400 text-xs mt-2">
                        有 {ticketResult.reports.filter(r => r.status === 'pending').length} 筆回報審核中，通過後將增加券數
                      </p>
                    )}
                  </div>

                  {/* 積分明細 */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">回報基礎</p>
                      <p className="text-lg font-bold text-white">{ticketResult.breakdown.base}</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">截圖加碼</p>
                      <p className="text-lg font-bold text-white">{ticketResult.breakdown.screenshot}</p>
                    </div>
                    <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">社群分享</p>
                      <p className="text-lg font-bold text-white">{ticketResult.breakdown.social}</p>
                    </div>
                  </div>

                  {/* 進度條 */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-400">特等獎進度</span>
                      <span className="text-gray-300">
                        {ticketResult.tickets >= GRAND_PRIZE_THRESHOLD ? (
                          <span className="text-yellow-400 font-medium">已達標！</span>
                        ) : (
                          <>還差 <span className="text-indigo-400 font-medium">{ticketsRemaining}</span> 張</>
                        )}
                      </span>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          ticketResult.tickets >= GRAND_PRIZE_THRESHOLD
                            ? 'bg-gradient-to-r from-yellow-500 to-amber-400'
                            : 'bg-gradient-to-r from-indigo-600 to-indigo-400'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 text-right">
                      {ticketResult.tickets} / {GRAND_PRIZE_THRESHOLD} 張
                    </p>
                  </div>
                </div>

                {/* 回報紀錄清單 */}
                <div className="bg-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4">
                    回報紀錄
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      共 {ticketResult.reports.length} 筆
                    </span>
                  </h3>

                  {ticketResult.reports.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">尚無回報紀錄</p>
                  ) : (
                    <div className="space-y-3">
                      {ticketResult.reports.map(report => {
                        const st = statusLabel(report.status)
                        return (
                          <div
                            key={report.id}
                            className="bg-gray-700/50 rounded-lg p-4 border border-gray-700"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <h4 className="text-white font-medium text-sm leading-tight">
                                {report.figure_name}
                              </h4>
                              <span
                                className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}
                              >
                                {st.text}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span>NT$ {Number(report.deal_price).toLocaleString()}</span>
                              {report.has_screenshot && (
                                <span className="text-green-400">有截圖</span>
                              )}
                              {report.has_shared_social && (
                                <span className="text-blue-400">已分享</span>
                              )}
                              <span className="ml-auto">
                                {new Date(report.created_at).toLocaleDateString('zh-TW')}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 規則說明 */}
        <div className="mt-6 bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
          <h3 className="text-sm font-bold text-gray-300 mb-3">抽獎券規則</h3>
          <ul className="space-y-1.5 text-xs text-gray-400">
            <li className="flex gap-2">
              <span className="text-indigo-400 shrink-0">1.</span>
              每回報一筆成交紀錄即可獲得 <span className="text-white font-medium">1 張</span> 抽獎券
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-400 shrink-0">2.</span>
              上傳成交截圖額外再得 <span className="text-white font-medium">1 張</span> 抽獎券
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-400 shrink-0">3.</span>
              上傳社群分享截圖（不限次數）可獲得 <span className="text-white font-medium">1 張</span> 獎勵券
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-400 shrink-0">4.</span>
              累積滿 <span className="text-yellow-400 font-medium">10 張</span> 即可角逐特等獎
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-400 shrink-0">5.</span>
              中獎者將透過 <span className="text-white font-medium">Email 通知</span>，請確保 Email 正確
            </li>
          </ul>
        </div>
      </main>
    </div>
  )
}
