'use client'

import Image from 'next/image'

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
  dimensions: string | null
  material: string | null
  order_date: string | null
  shipping_date: string | null
}

interface GoogleResult {
  title: string
  link: string
  snippet: string
}

interface SearchResultsProps {
  figures: Figure[]
  googleResults: GoogleResult[]
  onFigureClick: (id: string) => void
}

export default function SearchResults({ figures, googleResults, onFigureClick }: SearchResultsProps) {
  if (figures.length === 0 && googleResults.length === 0) {
    return (
      <section className="px-4 pb-20">
        <div className="text-center text-gray-400 py-8">
          <p>找不到相關結果</p>
          <p className="text-sm mt-2">試試其他關鍵字</p>
        </div>
      </section>
    )
  }

  return (
    <section className="px-4 pb-24 flex-1">
      {/* Database Results */}
      {figures.length > 0 && (
        <div className="max-w-xl mx-auto mb-8">
          <h2 className="text-sm font-medium text-gray-400 mb-3">資料庫結果</h2>
          <div className="space-y-3">
            {figures.map((figure) => (
              <div
                key={figure.id}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-left hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onFigureClick(figure.id)}
              >
                <div className="flex gap-3">
                  {/* Image */}
                  <div className="w-16 h-16 bg-gray-700 rounded-lg flex-shrink-0 overflow-hidden relative">
                    {figure.image_url ? (
                      <Image
                        src={figure.image_url}
                        alt={figure.name}
                        fill
                        sizes="64px"
                        className="object-cover"
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
                    <div className="flex items-center gap-1.5">
                      {figure.tag && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-amber-900/50 text-amber-300 font-medium flex-shrink-0">
                          {figure.tag}
                        </span>
                      )}
                      <h3 className="font-medium text-white text-sm truncate">{figure.name}</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {figure.manufacturer || '未知工作室'}
                      {figure.series && ` · ${figure.series}`}
                      {figure.scale && ` · ${figure.scale}`}
                    </p>
                    {figure.version && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300">
                        {figure.version}
                      </span>
                    )}

                    {/* Price Info */}
                    <div className="mt-1 space-y-0.5">
                      {figure.original_price && (
                        <div className="text-xs text-gray-400">
                          原價 NT$ {figure.original_price.toLocaleString()}
                        </div>
                      )}
                      {figure.market_price_min !== null && figure.market_price_max !== null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">市場</span>
                          <span className="text-sm font-medium text-green-400">
                            {figure.market_price_min === figure.market_price_max ? (
                              <>NT$ {figure.market_price_min.toLocaleString()}</>
                            ) : (
                              <>NT$ {figure.market_price_min.toLocaleString()} - {figure.market_price_max.toLocaleString()}</>
                            )}
                          </span>
                        </div>
                      )}
                      {figure.last_deal_date && (
                        <div className="text-xs text-gray-400">
                          成交日期：{figure.last_deal_date}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center p-1">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Google Results */}
      {googleResults.length > 0 && (
        <div className="max-w-xl mx-auto">
          <h2 className="text-sm font-medium text-gray-400 mb-3">網路參考</h2>
          <div className="space-y-3">
            {googleResults.map((result, index) => (
              <a
                key={index}
                href={result.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-gray-800 rounded-xl p-4 hover:bg-gray-700 transition-colors"
              >
                <h3 className="font-medium text-white text-sm line-clamp-1">{result.title}</h3>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{result.snippet}</p>
                <p className="text-xs text-blue-400 mt-2 truncate">{result.link}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
