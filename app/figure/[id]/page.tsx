'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { addTrackedItem, isTracked, updateTrackedItemPrice } from '@/types/collection'
import { v4 as uuidv4 } from 'uuid'

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
  ai_sentiment: string
  dimensions: string | null
  material: string | null
  order_date: string | null
  shipping_date: string | null
}

interface Transaction {
  id: string
  price: number
  source: string | null
  created_at: string
}

export default function FigurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [figure, setFigure] = useState<Figure | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 追蹤相關狀態
  const [isTrackedState, setIsTrackedState] = useState(false)

  // 提交成交價相關狀態
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitPrice, setSubmitPrice] = useState('')
  const [submitSource, setSubmitSource] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    const fetchFigure = async () => {
      try {
        const res = await fetch(`/api/figures/${id}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || '載入失敗')
        }

        setFigure(data.figure)
        setTransactions(data.transactions)

        // 檢查是否已追蹤，如果已追蹤則更新價格
        const tracked = isTracked(id)
        setIsTrackedState(tracked)
        if (tracked && data.figure) {
          updateTrackedItemPrice(
            id,
            data.figure.market_price_min,
            data.figure.market_price_max
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchFigure()
  }, [id])

  const handleTrack = () => {
    if (!figure) return

    addTrackedItem({
      id: uuidv4(),
      figure_id: figure.id,
      name: figure.name,
      image_url: figure.image_url,
      market_price_min: figure.market_price_min,
      market_price_max: figure.market_price_max,
    })

    setIsTrackedState(true)
  }

  const handleSubmitTransaction = async () => {
    if (!figure || !submitPrice) return

    const price = parseFloat(submitPrice)
    if (isNaN(price) || price <= 0) {
      setSubmitError('請輸入有效的價格')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figure_id: figure.id,
          price,
          source: submitSource || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '提交失敗')
      }

      // 重新載入資料
      const refreshRes = await fetch(`/api/figures/${id}`)
      const refreshData = await refreshRes.json()
      setFigure(refreshData.figure)
      setTransactions(refreshData.transactions)

      // 顯示成功訊息
      setSubmitSuccess(true)
      setSubmitPrice('')
      setSubmitSource('')

      // 2秒後關閉 Modal
      setTimeout(() => {
        setShowSubmitModal(false)
        setSubmitSuccess(false)
      }, 2000)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !figure) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <p className="text-red-500 mb-4">{error || '找不到此公仔'}</p>
        <button
          onClick={() => router.back()}
          className="text-white underline"
        >
          返回
        </button>
      </div>
    )
  }

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
          <h1 className="flex-1 text-center font-medium truncate px-4 text-white">{figure.name}</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Image */}
      <section className="px-4 py-4">
        <div className="w-full max-w-lg mx-auto aspect-video bg-gray-700 rounded-xl relative overflow-hidden">
          {figure.image_url ? (
            <Image
              src={figure.image_url}
              alt={figure.name}
              fill
              className="object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
      </section>

      {/* Info */}
      <section className="px-4 py-6 space-y-6">
        {/* Basic Info */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {figure.tag && (
              <span className="px-2 py-1 text-xs rounded bg-amber-900/50 text-amber-300 font-medium">{figure.tag}</span>
            )}
            {figure.series && (
              <span className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300">{figure.series}</span>
            )}
            {figure.scale && (
              <span className="px-2 py-1 text-xs rounded bg-blue-900/50 text-blue-300">{figure.scale}</span>
            )}
            {figure.version && (
              <span className="px-2 py-1 text-xs rounded bg-purple-900/50 text-purple-300">{figure.version}</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-white">{figure.name}</h2>
          <p className="text-gray-400 mt-1">
            {figure.manufacturer || '未知工作室'}
            {figure.release_year && ` · ${figure.release_year}`}
          </p>
        </div>

        {/* Price Info */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          {figure.original_price && (
            <div className="flex justify-between">
              <span className="text-gray-400">官方原價</span>
              <span className="text-white">NT$ {figure.original_price.toLocaleString()}</span>
            </div>
          )}
          {figure.market_price_min !== null && figure.market_price_max !== null && (
            <div className="flex justify-between">
              <span className="text-gray-400">市場行情</span>
              <span className="font-medium text-white">
                {figure.market_price_min === figure.market_price_max ? (
                  <>NT$ {figure.market_price_min.toLocaleString()}</>
                ) : (
                  <>NT$ {figure.market_price_min.toLocaleString()} - {figure.market_price_max.toLocaleString()}</>
                )}
              </span>
            </div>
          )}
        </div>

        {/* 詳細規格 */}
        {(figure.dimensions || figure.material || figure.shipping_date || figure.order_date || figure.tag) && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="font-medium text-white mb-2">詳細規格</h3>
            {figure.tag && (
              <div className="flex justify-between">
                <span className="text-gray-400">作品</span>
                <span className="text-white">{figure.tag}</span>
              </div>
            )}
            {figure.dimensions && (
              <div className="flex justify-between">
                <span className="text-gray-400">規格尺寸</span>
                <span className="text-white">{figure.dimensions}</span>
              </div>
            )}
            {figure.material && (
              <div className="flex justify-between">
                <span className="text-gray-400">材質說明</span>
                <span className="text-white">{figure.material}</span>
              </div>
            )}
            {figure.order_date && (
              <div className="flex justify-between">
                <span className="text-gray-400">開訂時間</span>
                <span className="text-white">{figure.order_date}</span>
              </div>
            )}
            {figure.shipping_date && (
              <div className="flex justify-between">
                <span className="text-gray-400">預計出貨</span>
                <span className="text-white">{figure.shipping_date}</span>
              </div>
            )}
          </div>
        )}

        {/* AI Sentiment */}
        {figure.ai_sentiment && (
          <div className="bg-gray-800 text-gray-100 rounded-xl p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">AI 分析</p>
            <p>{figure.ai_sentiment}</p>
          </div>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <div>
            <h3 className="font-medium mb-3 text-white">最近成交紀錄</h3>
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex justify-between text-sm py-2 border-b border-gray-700">
                  <span className="text-gray-400">
                    {new Date(tx.created_at).toLocaleString('zh-TW')}
                  </span>
                  <span className="text-white">NT$ {tx.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Transaction */}
        <button
          onClick={() => setShowSubmitModal(true)}
          className="w-full py-3 border-2 border-gray-700 rounded-xl text-gray-300 hover:border-gray-600 transition-colors"
        >
          提交成交價
        </button>
      </section>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-4">
        {isTrackedState ? (
          <button
            disabled
            className="w-full py-3 bg-gray-700 text-gray-500 rounded-xl flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            已追蹤價格
          </button>
        ) : (
          <button
            onClick={handleTrack}
            className="w-full py-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            追蹤價格
          </button>
        )}
      </div>

      {/* Submit Transaction Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-gray-900 w-full rounded-t-2xl p-6">
            {submitSuccess ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-lg font-medium text-white">成交價提交成功！</p>
                <p className="text-sm text-gray-400 mt-2">等待管理員審核後將更新行情</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-4 text-white">提交成交價</h3>

                {submitError && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-xl">
                    <p className="text-sm text-red-400">{submitError}</p>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">成交價格</label>
                  <input
                    type="number"
                    value={submitPrice}
                    onChange={(e) => setSubmitPrice(e.target.value)}
                    placeholder="NT$"
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                    autoFocus
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">來源說明（選填）</label>
                  <input
                    type="text"
                    value={submitSource}
                    onChange={(e) => setSubmitSource(e.target.value)}
                    placeholder="例：蝦皮、FB 社團..."
                    className="w-full px-4 py-3 border-2 border-gray-700 rounded-xl focus:border-indigo-500 focus:outline-none bg-gray-800 text-white placeholder:text-gray-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowSubmitModal(false)
                      setSubmitError('')
                    }}
                    className="flex-1 py-3 border-2 border-gray-700 rounded-xl text-gray-300"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitTransaction}
                    disabled={!submitPrice || submitting}
                    className="flex-1 py-3 bg-white text-gray-900 rounded-xl disabled:bg-gray-600"
                  >
                    {submitting ? '提交中...' : '確認'}
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
