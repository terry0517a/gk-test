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
                className="w-full bg-gray-800 border border-gray-700 rounded-xl overflow-hidden text-left hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onFigureClick(figure.id)}
              >
                {/* 圖片區 */}
                <div className="relative w-full aspect-[4/3] bg-gray-700">
                  {figure.image_url ? (
                    <Image
                      src={figure.image_url}
                      alt={figure.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 560px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {/* Tag badge */}
                  {figure.tag && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-xs rounded-full bg-amber-900/80 text-amber-300 font-medium backdrop-blur-sm">
                      {figure.tag}
                    </span>
                  )}
                </div>

                {/* 規格表 */}
                <div className="p-4 space-y-2 text-sm">
                  {/* 製作團隊 */}
                  <div className="flex">
                    <span className="text-gray-500 w-20 flex-shrink-0">⫸ 製作團隊</span>
                    <span className="text-white font-medium">{figure.manufacturer || '未知'}</span>
                  </div>
                  {/* 商品名稱 */}
                  <div className="flex">
                    <span className="text-gray-500 w-20 flex-shrink-0">⫸ 商品名稱</span>
                    <span className="text-white font-medium">{figure.name}</span>
                  </div>
                  {/* 建議售價 */}
                  {figure.original_price && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 建議售價</span>
                      <span className="text-green-400 font-medium">
                        NT$ {figure.original_price.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {/* 市場價格 */}
                  {figure.market_price_min !== null && figure.market_price_max !== null && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 市場價格</span>
                      <span className="text-green-400 font-medium">
                        {figure.market_price_min === figure.market_price_max
                          ? `NT$ ${figure.market_price_min.toLocaleString()}`
                          : `NT$ ${figure.market_price_min.toLocaleString()} ~ ${figure.market_price_max.toLocaleString()}`
                        }
                      </span>
                    </div>
                  )}
                  {/* 規格尺寸 */}
                  {(figure.scale || figure.dimensions) && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 規格尺寸</span>
                      <span className="text-gray-300">
                        {figure.dimensions || figure.scale || ''}
                      </span>
                    </div>
                  )}
                  {/* 材質說明 */}
                  {figure.material && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 材質說明</span>
                      <span className="text-gray-300">{figure.material}</span>
                    </div>
                  )}
                  {/* 預計出貨 */}
                  {figure.shipping_date && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 預計出貨</span>
                      <span className="text-gray-300">{figure.shipping_date}</span>
                    </div>
                  )}
                  {/* 版本 */}
                  {figure.version && (
                    <div className="flex">
                      <span className="text-gray-500 w-20 flex-shrink-0">⫸ 版本</span>
                      <span className="text-purple-300">{figure.version}</span>
                    </div>
                  )}
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
