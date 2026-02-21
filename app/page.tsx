'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import CountUp from 'react-countup'
import SearchResults from '@/components/SearchResults'

interface Figure {
  id: string
  name: string
  manufacturer: string | null
  series: string | null
  version: string | null
  scale: string | null
  tag: string | null
  release_year: number | null
  original_price: number | null
  image_url: string | null
  market_price_min: number | null
  market_price_max: number | null
  last_deal_date: string | null
  ai_sentiment: string
}

interface SearchResponse {
  figures: Figure[]
  google_results: {
    title: string
    link: string
    snippet: string
  }[]
}


// 維護模式開關 - 設為 false 即可恢復正常
const MAINTENANCE_MODE = false

function MaintenancePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 bg-gradient-to-b from-gray-900 to-indigo-950/50">
      <div className="flex flex-col items-center text-center">
        {/* Logo */}
        <img src="/logo.png" alt="GK收藏家" className="w-[420px] h-auto mb-8 logo-glow" />
        <p className="text-sm text-gray-500 mt-1 tracking-wider mb-10">
          公仔行情追蹤平台
        </p>

        {/* 維護提示 */}
        <div className="bg-gray-800 rounded-2xl shadow-sm border border-gray-700 px-8 py-6 max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-bold text-gray-200">系統升級中</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">
            我們正在進行資料更新與功能優化，<br/>
            預計近期完成，敬請期待！
          </p>
        </div>
      </div>
    </main>
  )
}

function HomeContent() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)
  const router = useRouter()

  // 實價數據計數
  const [approvedCount, setApprovedCount] = useState<number | null>(null)

  // 回報價格相關狀態
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportName, setReportName] = useState('')
  const [reportPrice, setReportPrice] = useState('')
  const [reportSource, setReportSource] = useState('')
  const [reportManufacturer, setReportManufacturer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // 標籤篩選狀態
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<{ tag: string; count: number }[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)

  // 問題回報相關狀態
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [issueType, setIssueType] = useState('bug')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issueContact, setIssueContact] = useState('')
  const [issueSubmitting, setIssueSubmitting] = useState(false)
  const [issueSuccess, setIssueSuccess] = useState(false)

  const doSearch = useCallback(async (searchQuery: string, updateUrl = true, tagFilter?: string | null) => {
    const hasQuery = searchQuery.trim().length > 0
    const hasTag = !!tagFilter

    if (!hasQuery && !hasTag) return

    setLoading(true)
    setError(null)

    // 更新 URL（不觸發頁面跳轉）
    if (updateUrl) {
      const url = new URL(window.location.href)
      if (hasQuery) {
        url.searchParams.set('q', searchQuery)
      } else {
        url.searchParams.delete('q')
      }
      if (hasTag) {
        url.searchParams.set('tag', tagFilter)
      } else {
        url.searchParams.delete('tag')
      }
      window.history.replaceState({}, '', url.toString())
    }

    try {
      const params = new URLSearchParams()
      if (hasQuery) params.set('q', searchQuery)
      if (hasTag) params.set('tag', tagFilter)

      const res = await fetch(`/api/search?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '搜尋失敗')
      }

      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜尋失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  // 從 URL 參數恢復搜尋狀態
  useEffect(() => {
    if (!hasInitialized && initialQuery) {
      doSearch(initialQuery, false)
    }
    setHasInitialized(true)
  }, [initialQuery, hasInitialized, doSearch])

  // 載入標籤列表
  useEffect(() => {
    async function fetchTags() {
      setTagsLoading(true)
      try {
        const res = await fetch('/api/tags')
        const data = await res.json()
        if (res.ok && data.tags) {
          setAvailableTags(data.tags)
        }
      } catch {
        // 忽略錯誤
      } finally {
        setTagsLoading(false)
      }
    }
    fetchTags()
  }, [])

  // 載入實價數據計數
  useEffect(() => {
    fetch('/api/public-stats')
      .then(res => res.json())
      .then(data => setApprovedCount(data.count))
      .catch(() => {})
  }, [])

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    doSearch(query, true, selectedTag)
  }, [query, selectedTag, doSearch])

  const handleTagClick = useCallback((tag: string) => {
    const newTag = selectedTag === tag ? null : tag
    setSelectedTag(newTag)
    doSearch(query, true, newTag)
  }, [selectedTag, query, doSearch])

  const handleFigureClick = (id: string) => {
    router.push(`/figure/${id}`)
  }

  const handleHotTagClick = useCallback((tag: string) => {
    setQuery(tag)
    doSearch(tag, true, null)
  }, [doSearch])

  const handleReportPrice = async () => {
    if (!reportName.trim() || !reportPrice) return

    const price = parseFloat(reportPrice)
    if (isNaN(price) || price <= 0) {
      alert('請輸入有效的價格')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/report-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: reportName.trim(),
          price,
          source: reportSource || null,
          category: 'GK',
          manufacturer: reportManufacturer.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '提交失敗')
      }

      setSubmitSuccess(true)
      setTimeout(() => {
        setShowReportModal(false)
        setReportName('')
        setReportPrice('')
        setReportSource('')
        setReportManufacturer('')
        setSubmitSuccess(false)
      }, 1500)
    } catch (err) {
      alert(err instanceof Error ? err.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // 提交問題回報
  const handleIssueReport = async () => {
    if (!issueTitle.trim() || !issueDescription.trim()) return

    setIssueSubmitting(true)

    try {
      const res = await fetch('/api/issue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: issueType,
          title: issueTitle.trim(),
          description: issueDescription.trim(),
          contact: issueContact.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '提交失敗')
      }

      setIssueSuccess(true)
      setTimeout(() => {
        setShowIssueModal(false)
        setIssueType('bug')
        setIssueTitle('')
        setIssueDescription('')
        setIssueContact('')
        setIssueSuccess(false)
      }, 1500)
    } catch (err) {
      alert(err instanceof Error ? err.message : '提交失敗')
    } finally {
      setIssueSubmitting(false)
    }
  }

  return (
    <main className="h-dvh flex flex-col bg-mesh overflow-hidden">
      {/* 有搜尋結果時：上方搜尋 + 下方結果可滾動 */}
      {results || loading ? (
        <>
          <section className="flex flex-col items-center px-4 py-4 shrink-0">
            <button onClick={() => { setResults(null); setQuery(''); router.push('/') }} className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity cursor-pointer">
              <img src="/gk-logo.png" alt="GK收藏家" className="w-7 h-7 object-contain" />
              <h1 className="font-[family-name:var(--font-dm-serif-display)] text-xl text-[var(--text-primary)]">GK 公仔行情追蹤</h1>
            </button>
            <form onSubmit={handleSearch} className="w-full max-w-[720px]">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋公仔名稱、製造商、系列..."
                  className="search-glass w-full px-5 py-3 pr-14 text-base rounded-2xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--accent-primary)] hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
            {error && (
              <p className="text-center text-red-400 mt-3 w-full text-sm">{error}</p>
            )}
          </section>
          <div className="flex-1 overflow-y-auto pb-4">
            {results && (
              <SearchResults
                figures={results.figures}
                googleResults={results.google_results}
                onFigureClick={handleFigureClick}
              />
            )}
          </div>
        </>
      ) : (
        /* 無搜尋結果：單屏佈局 */
        <section className="flex-1 flex flex-col items-center justify-center px-4">
          {/* 標題區 */}
          <div className="animate-fade-in-up text-center mb-6" style={{ animationDelay: '0ms' }}>
            <Link href="/" className="flex items-center justify-center gap-3 mb-1 hover:opacity-80 transition-opacity">
              <img src="/gk-logo.png" alt="GK收藏家" className="w-8 h-8 object-contain" />
              <h1 className="font-[family-name:var(--font-dm-serif-display)] text-2xl md:text-[28px] text-[var(--text-primary)]">GK 公仔行情追蹤</h1>
            </Link>
            <p className="text-[13px] tracking-[0.15em] text-[var(--accent-secondary)]">探索・比較・收藏</p>
          </div>

          {/* 搜尋框 */}
          <div className="animate-fade-in-up w-full max-w-[720px] mb-5" style={{ animationDelay: '100ms' }}>
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋公仔名稱、製造商、系列..."
                  className="search-glass w-full px-5 py-4 pr-14 text-base rounded-2xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--accent-primary)] hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
          </div>

          {/* 熱門搜尋標籤 + 空狀態 */}
          <div className="animate-fade-in-up flex flex-col items-center" style={{ animationDelay: '200ms' }}>
            {/* 熱門標籤 */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              <span className="text-xs text-[var(--text-muted)]">熱門搜尋：</span>
              {['鬼滅之刃', '海賊王', '進擊的巨人', '咒術迴戰', '間諜家家酒', '鏈鋸人'].map(tag => (
                <button
                  key={tag}
                  onClick={() => handleHotTagClick(tag)}
                  className="px-3 py-1 text-[13px] text-[var(--text-secondary)] bg-white/5 border border-white/10 rounded-full hover:bg-[rgba(99,179,237,0.1)] hover:border-[var(--border-glow)] hover:text-[var(--accent-primary)] transition-all duration-200"
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* 空狀態浮動圖示 */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="animate-float mb-3">
                <svg className="w-16 h-16 text-[var(--text-muted)]" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="34" cy="32" r="14" strokeWidth="2" />
                  <path d="M44 42l10 10" strokeWidth="2.5" />
                  <circle cx="34" cy="26" r="4" strokeWidth="1.5" />
                  <path d="M34 30v5" strokeWidth="1.5" />
                  <path d="M31 33h6" strokeWidth="1.5" />
                  <path d="M32.5 35l-1.5 4" strokeWidth="1.5" />
                  <path d="M35.5 35l1.5 4" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="text-base text-[var(--text-secondary)] mb-1">探索 GK 公仔市場行情</p>
              <p className="text-[13px] text-[var(--text-muted)]">輸入公仔名稱、製造商或系列，即時查詢市場價格</p>
            </div>
          </div>

          {/* 數據計數器 */}
          {approvedCount !== null && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-glass)] border border-[var(--border-subtle)] mb-3">
              <svg className="w-4 h-4 text-[var(--accent-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
              </svg>
              <p className="text-sm text-[var(--text-secondary)]">
                目前活動全站已累積 <CountUp end={approvedCount} duration={1.5} className="text-[var(--accent-primary)] font-bold" /> 筆公仔實價成交數據
              </p>
            </div>
          )}

          {/* 免責聲明 */}
          <div className="max-w-sm bg-[var(--bg-secondary)] rounded-xl p-3 text-xs text-[var(--text-muted)] mb-2">
            <p className="font-medium text-[var(--text-secondary)] mb-1">免責聲明</p>
            <p className="leading-relaxed">本平台提供之價格資訊僅供參考，實際成交價格可能因商品狀況、交易時間、市場供需等因素而有所不同。本平台不對任何因參考本站資訊所產生之交易損失負責。</p>
          </div>

          {/* 聯絡資訊 */}
          <p className="text-xs text-[var(--text-muted)]">商業合作請聯繫：gkcollector@gmail.com｜Facebook：GK Colloctors</p>
        </section>
      )}

      {/* Bottom Navigation */}
      <nav className="shrink-0 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)]">
        <div className="flex justify-around py-3">
          <Link href="/" className="flex flex-col items-center text-[var(--accent-primary)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs mt-1">搜尋</span>
          </Link>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex flex-col items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">回報價格</span>
          </button>
          <Link href="/collection" prefetch={true} className="flex flex-col items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">追蹤</span>
          </Link>
          <button
            onClick={() => setShowIssueModal(true)}
            className="flex flex-col items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">問題</span>
          </button>
        </div>
      </nav>

      {/* 回報價格 Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-gray-900 w-full rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto">
            {submitSuccess ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-lg font-medium text-white">感謝回報！</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-4 text-white">回報成交價格</h3>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">公仔名稱 *</label>
                  <input
                    type="text"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="例：初音未來 1/7 Scale"
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">工作室/廠商</label>
                  <input
                    type="text"
                    value={reportManufacturer}
                    onChange={(e) => setReportManufacturer(e.target.value)}
                    placeholder="例：GSC、壽屋、BANDAI..."
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">成交價格 *</label>
                  <input
                    type="number"
                    value={reportPrice}
                    onChange={(e) => setReportPrice(e.target.value)}
                    placeholder="NT$"
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">來源說明（選填）</label>
                  <input
                    type="text"
                    value={reportSource}
                    onChange={(e) => setReportSource(e.target.value)}
                    placeholder="例：蝦皮、FB 社團、露天..."
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 py-3 border-2 border-gray-700 rounded-xl text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleReportPrice}
                    disabled={!reportName.trim() || !reportPrice || submitting}
                    className="flex-1 py-3 bg-white text-gray-900 rounded-xl disabled:bg-gray-600"
                  >
                    {submitting ? '提交中...' : '提交'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 問題回報 Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-gray-900 w-full rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto">
            {issueSuccess ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-lg font-medium text-white">感謝回報！</p>
                <p className="text-sm text-gray-400 mt-2">我們會儘快處理您的問題</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-4 text-white">回報問題</h3>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">問題類型 *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'bug', label: '功能異常' },
                      { value: 'data_error', label: '資料錯誤' },
                      { value: 'suggestion', label: '功能建議' },
                      { value: 'other', label: '其他問題' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setIssueType(option.value)}
                        className={`px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                          issueType === option.value
                            ? 'border-white bg-white text-gray-900'
                            : 'border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">問題標題 *</label>
                  <input
                    type="text"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="簡述您遇到的問題"
                    maxLength={100}
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">詳細描述 *</label>
                  <textarea
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="請詳細描述問題的情況、重現步驟等..."
                    maxLength={2000}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none resize-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1 text-right">{issueDescription.length}/2000</p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">聯絡方式（選填）</label>
                  <input
                    type="text"
                    value={issueContact}
                    onChange={(e) => setIssueContact(e.target.value)}
                    placeholder="Email 或其他聯絡方式，方便我們回覆您"
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowIssueModal(false)}
                    className="flex-1 py-3 border-2 border-gray-700 rounded-xl text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleIssueReport}
                    disabled={!issueTitle.trim() || !issueDescription.trim() || issueSubmitting}
                    className="flex-1 py-3 bg-white text-gray-900 rounded-xl disabled:bg-gray-600"
                  >
                    {issueSubmitting ? '提交中...' : '提交'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default function Home() {
  if (MAINTENANCE_MODE) {
    return <MaintenancePage />
  }

  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
