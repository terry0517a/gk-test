'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getTrackedItems, removeTrackedItem, updateTrackedItemPrice, type TrackedItem } from '@/types/collection'

export default function TrackingPage() {
  const router = useRouter()
  const [items, setItems] = useState<TrackedItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<{ url: string; code: string } | null>(null)
  const [nickname, setNickname] = useState('')

  // 問題回報狀態
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [issueType, setIssueType] = useState('bug')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issueContact, setIssueContact] = useState('')
  const [issueSubmitting, setIssueSubmitting] = useState(false)
  const [issueSuccess, setIssueSuccess] = useState(false)

  useEffect(() => {
    setItems(getTrackedItems())
  }, [])

  const handleRemove = (id: string) => {
    if (confirm('確定要取消追蹤嗎？')) {
      const newItems = removeTrackedItem(id)
      setItems(newItems)
    }
  }

  // 分享追蹤清單
  const handleShare = async () => {
    if (items.length === 0) return

    setSharing(true)
    setShareResult(null)

    try {
      const res = await fetch('/api/share-collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          nickname: nickname.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '分享失敗')
      }

      setShareResult({
        url: `${window.location.origin}${data.share_url}`,
        code: data.share_code,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '分享失敗')
    } finally {
      setSharing(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!shareResult) return
    try {
      await navigator.clipboard.writeText(shareResult.url)
      alert('已複製連結！')
    } catch {
      alert('複製失敗，請手動複製')
    }
  }

  const handleRefreshPrices = async () => {
    setRefreshing(true)
    try {
      // 逐一更新每個追蹤項目的價格
      for (const item of items) {
        try {
          const res = await fetch(`/api/figures/${item.figure_id}`)
          if (res.ok) {
            const data = await res.json()
            if (data.figure) {
              updateTrackedItemPrice(
                item.figure_id,
                data.figure.market_price_min,
                data.figure.market_price_max
              )
            }
          }
        } catch {
          // 忽略單一項目的錯誤
        }
      }
      // 重新讀取更新後的資料
      setItems(getTrackedItems())
    } finally {
      setRefreshing(false)
    }
  }

  // 處理問題回報
  const handleIssueReport = async () => {
    if (!issueTitle.trim() || !issueDescription.trim()) return

    setIssueSubmitting(true)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: issueType,
          title: issueTitle.trim(),
          description: issueDescription.trim(),
          contact: issueContact.trim() || null,
        }),
      })

      if (!res.ok) {
        throw new Error('回報失敗')
      }

      setIssueSuccess(true)
      setTimeout(() => {
        setShowIssueModal(false)
        setIssueSuccess(false)
        setIssueType('bug')
        setIssueTitle('')
        setIssueDescription('')
        setIssueContact('')
      }, 2000)
    } catch {
      alert('回報失敗，請稍後再試')
    } finally {
      setIssueSubmitting(false)
    }
  }

  const formatPriceChange = (change: number) => {
    if (change === 0) return '持平'
    const sign = change > 0 ? '+' : ''
    return `${sign}NT$ ${change.toLocaleString()}`
  }

  const getPriceChangeColor = (change: number) => {
    if (change > 0) return 'text-red-400'  // 漲價用紅色
    if (change < 0) return 'text-green-400'  // 跌價用綠色（對買家有利）
    return 'text-gray-400'
  }

  const getPriceChangeIcon = (change: number) => {
    if (change > 0) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )
    }
    if (change < 0) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )
    }
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    return date.toLocaleDateString('zh-TW')
  }

  // 統計資料
  const priceUpCount = items.filter(i => i.price_change > 0).length
  const priceDownCount = items.filter(i => i.price_change < 0).length

  return (
    <main className="min-h-dvh pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-gray-900 border-b border-gray-700 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-center font-medium text-white">價格追蹤</h1>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-white"
                  title="分享追蹤清單"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
                <button
                  onClick={handleRefreshPrices}
                  disabled={refreshing}
                  className="p-2 -mr-2 text-white"
                >
                  <svg
                    className={`w-6 h-6 ${refreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      {items.length > 0 && (
        <section className="px-4 py-4 bg-gray-800 border-b border-gray-700">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-white">{items.length}</p>
              <p className="text-xs text-gray-400">追蹤數量</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{priceUpCount}</p>
              <p className="text-xs text-gray-400">漲價</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{priceDownCount}</p>
              <p className="text-xs text-gray-400">跌價</p>
            </div>
          </div>
        </section>
      )}

      {/* Tracking List */}
      {items.length > 0 ? (
        <section className="px-4 py-4">
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4"
              >
                <div className="flex gap-4">
                  {/* Image */}
                  <button
                    onClick={() => router.push(`/figure/${item.figure_id}`)}
                    className="w-16 h-16 bg-gray-700 rounded-lg flex-shrink-0 overflow-hidden"
                  >
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 text-xs rounded bg-amber-900/50 text-amber-300 font-medium">GK</span>
                      <h3 className="font-medium text-white truncate">{item.name}</h3>
                    </div>

                    {/* 目前價格 */}
                    <div className="mt-1">
                      {item.current_price_min && item.current_price_max ? (
                        <span className="text-sm font-medium text-white">
                          NT$ {item.current_price_min.toLocaleString()} - {item.current_price_max.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">價格未知</span>
                      )}
                    </div>

                    {/* 價格變化 */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`flex items-center gap-1 ${getPriceChangeColor(item.price_change)}`}>
                        {getPriceChangeIcon(item.price_change)}
                        <span className="text-sm font-medium">
                          {formatPriceChange(item.price_change)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        上次查看：{formatDate(item.last_viewed)}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-gray-600 hover:text-red-500 transition-colors self-start"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>還沒有追蹤任何公仔</p>
            <p className="text-sm mt-2">搜尋並追蹤你感興趣的公仔價格</p>
          </div>
        </section>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700">
        <div className="flex justify-around py-3">
          <Link href="/" prefetch={true} className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs mt-1">搜尋</span>
          </Link>
          <Link href="/" prefetch={true} className="flex flex-col items-center text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">回報價格</span>
          </Link>
          <Link href="/collection" className="flex flex-col items-center text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">追蹤</span>
          </Link>
          <button
            onClick={() => setShowIssueModal(true)}
            className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">問題</span>
          </button>
        </div>
      </nav>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-gray-900 w-full rounded-t-2xl p-6">
            {shareResult ? (
              // 分享成功
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <h3 className="text-lg font-bold mb-2 text-white">分享連結已建立！</h3>
                <p className="text-sm text-gray-400 mb-4">其他玩家可以透過此連結查看你的追蹤清單</p>

                <div className="bg-gray-700 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-300 break-all">{shareResult.url}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowShareModal(false)
                      setShareResult(null)
                      setNickname('')
                    }}
                    className="flex-1 py-3 border border-gray-700 rounded-xl text-gray-300"
                  >
                    關閉
                  </button>
                  <button
                    onClick={handleCopyShareLink}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl"
                  >
                    複製連結
                  </button>
                </div>
              </div>
            ) : (
              // 分享設定
              <>
                <h3 className="text-lg font-bold mb-2 text-white">分享追蹤清單</h3>
                <p className="text-sm text-gray-400 mb-4">
                  建立分享連結，讓其他玩家也能看到你追蹤的 {items.length} 個公仔
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">暱稱（選填）</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="例：小明的收藏"
                    maxLength={20}
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowShareModal(false)
                      setNickname('')
                    }}
                    className="flex-1 py-3 border border-gray-700 rounded-xl text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl disabled:opacity-50"
                  >
                    {sharing ? '建立中...' : '建立分享連結'}
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
