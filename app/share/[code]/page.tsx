'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface SharedItem {
  figure_id: string
  name: string
  image_url: string | null
  price_min: number | null
  price_max: number | null
  latest_price_min: number | null
  latest_price_max: number | null
  manufacturer: string | null
  price_changed: boolean
}

interface SharedCollection {
  share_code: string
  nickname: string | null
  items: SharedItem[]
  view_count: number
  created_at: string
}

export default function SharedCollectionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [collection, setCollection] = useState<SharedCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const res = await fetch(`/api/share-collection/${code}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || '載入失敗')
        }

        setCollection(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchCollection()
  }, [code])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      alert('已複製連結！')
    } catch {
      alert('複製失敗，請手動複製網址')
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !collection) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400 mb-4">{error || '找不到此分享'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-white text-gray-900 rounded-lg"
          >
            返回首頁
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-gray-900 border-b border-gray-700 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => router.push('/')} className="p-2 -ml-2 text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-center font-medium text-white">
            {collection.nickname ? `${collection.nickname} 的追蹤` : '分享的追蹤清單'}
          </h1>
          <button onClick={handleCopyLink} className="p-2 -mr-2 text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="px-4 py-4 bg-gradient-to-r from-purple-950/30 to-indigo-950/30 border-b border-gray-700">
        <div className="flex justify-around text-center">
          <div>
            <p className="text-2xl font-bold text-purple-400">{collection.items.length}</p>
            <p className="text-xs text-gray-400">追蹤數量</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-400">{collection.view_count}</p>
            <p className="text-xs text-gray-400">瀏覽次數</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-300">{formatDate(collection.created_at)}</p>
            <p className="text-xs text-gray-400">分享時間</p>
          </div>
        </div>
      </section>

      {/* Items List */}
      <section className="px-4 py-4">
        <div className="space-y-3">
          {collection.items.map((item, index) => (
            <div
              key={`${item.figure_id}-${index}`}
              onClick={() => router.push(`/figure/${item.figure_id}`)}
              className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition-colors"
            >
              <div className="flex gap-4">
                {/* Image */}
                <div className="w-16 h-16 bg-gray-700 rounded-lg flex-shrink-0 overflow-hidden">
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
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-xs rounded bg-amber-900/50 text-amber-300 font-medium">GK</span>
                    <h3 className="font-medium text-white truncate">{item.name}</h3>
                  </div>
                  {item.manufacturer && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.manufacturer}</p>
                  )}

                  {/* Price Info */}
                  <div className="mt-2">
                    {item.latest_price_min && item.latest_price_max ? (
                      <div>
                        <span className="text-sm font-medium text-white">
                          NT$ {item.latest_price_min.toLocaleString()}
                          {item.latest_price_min !== item.latest_price_max && ` - ${item.latest_price_max.toLocaleString()}`}
                        </span>
                        {item.price_changed && (
                          <span className="ml-2 text-xs text-orange-400">價格已更新</span>
                        )}
                      </div>
                    ) : item.price_min && item.price_max ? (
                      <span className="text-sm text-gray-400">
                        NT$ {item.price_min.toLocaleString()}
                        {item.price_min !== item.price_max && ` - ${item.price_max.toLocaleString()}`}
                        <span className="text-xs text-gray-500 ml-1">(分享時)</span>
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">價格未知</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-6">
        <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-4 text-white text-center">
          <p className="font-medium mb-2">想建立自己的追蹤清單？</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            開始搜尋公仔
          </button>
        </div>
      </section>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700">
        <div className="flex justify-around py-3">
          <button
            onClick={() => router.push('/')}
            className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs mt-1">搜尋</span>
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">回報價格</span>
          </button>
          <button
            onClick={() => router.push('/collection')}
            className="flex flex-col items-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs mt-1">追蹤</span>
          </button>
        </div>
      </nav>
    </main>
  )
}
