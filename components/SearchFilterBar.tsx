'use client'

import { useState, useMemo } from 'react'

interface FigureBase {
  id: string
  name: string
  manufacturer: string | null
  series: string | null
  market_price_min: number | null
  market_price_max: number | null
}

export interface SearchFilters {
  manufacturers: string[]
  series: string[]
  priceRange: string | null
}

interface SearchFilterBarProps {
  figures: FigureBase[]
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
}

const PRICE_RANGES = [
  { label: '5,000 以下', value: '0-5000', min: 0, max: 5000 },
  { label: '5,000 - 10,000', value: '5000-10000', min: 5000, max: 10000 },
  { label: '10,000 - 20,000', value: '10000-20000', min: 10000, max: 20000 },
  { label: '20,000 以上', value: '20000+', min: 20000, max: Infinity },
]

export function applyFilters<T extends FigureBase>(figures: T[], filters: SearchFilters): T[] {
  return figures.filter((fig) => {
    // Manufacturer filter
    if (filters.manufacturers.length > 0) {
      if (!fig.manufacturer || !filters.manufacturers.includes(fig.manufacturer)) {
        return false
      }
    }
    // Series filter
    if (filters.series.length > 0) {
      if (!fig.series || !filters.series.includes(fig.series)) {
        return false
      }
    }
    // Price range filter
    if (filters.priceRange) {
      const range = PRICE_RANGES.find((r) => r.value === filters.priceRange)
      if (range) {
        const price = fig.market_price_min ?? fig.market_price_max
        if (price === null) return false
        if (price < range.min || price >= (range.max === Infinity ? Infinity : range.max)) {
          // For the last range (20000+), we only check >= min
          if (range.max === Infinity) {
            if (price < range.min) return false
          } else {
            return false
          }
        }
      }
    }
    return true
  })
}

export const emptyFilters: SearchFilters = {
  manufacturers: [],
  series: [],
  priceRange: null,
}

export default function SearchFilterBar({ figures, filters, onFiltersChange }: SearchFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const uniqueManufacturers = useMemo(() => {
    const map = new Map<string, number>()
    for (const fig of figures) {
      if (fig.manufacturer) {
        map.set(fig.manufacturer, (map.get(fig.manufacturer) || 0) + 1)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [figures])

  const uniqueSeries = useMemo(() => {
    const map = new Map<string, number>()
    for (const fig of figures) {
      if (fig.series) {
        map.set(fig.series, (map.get(fig.series) || 0) + 1)
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [figures])

  const activeCount =
    filters.manufacturers.length +
    filters.series.length +
    (filters.priceRange ? 1 : 0)

  const toggleManufacturer = (m: string) => {
    const next = filters.manufacturers.includes(m)
      ? filters.manufacturers.filter((x) => x !== m)
      : [...filters.manufacturers, m]
    onFiltersChange({ ...filters, manufacturers: next })
  }

  const toggleSeries = (s: string) => {
    const next = filters.series.includes(s)
      ? filters.series.filter((x) => x !== s)
      : [...filters.series, s]
    onFiltersChange({ ...filters, series: next })
  }

  const togglePriceRange = (val: string) => {
    onFiltersChange({
      ...filters,
      priceRange: filters.priceRange === val ? null : val,
    })
  }

  const clearAll = () => {
    onFiltersChange(emptyFilters)
  }

  // Don't render if there are no filterable values
  if (uniqueManufacturers.length === 0 && uniqueSeries.length === 0) {
    return null
  }

  return (
    <div className="max-w-xl mx-auto px-4 mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        篩選
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-indigo-600 text-white rounded-full">
            {activeCount}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
          {/* 工作室篩選 */}
          {uniqueManufacturers.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">工作室</p>
              <div className="flex flex-wrap gap-1.5">
                {uniqueManufacturers.map(([m, count]) => (
                  <button
                    key={m}
                    onClick={() => toggleManufacturer(m)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all duration-200 ${
                      filters.manufacturers.includes(m)
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                        : 'border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {m} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 系列篩選 */}
          {uniqueSeries.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">系列</p>
              <div className="flex flex-wrap gap-1.5">
                {uniqueSeries.map(([s, count]) => (
                  <button
                    key={s}
                    onClick={() => toggleSeries(s)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all duration-200 ${
                      filters.series.includes(s)
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                        : 'border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {s} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 價格區間 */}
          <div>
            <p className="text-xs text-gray-400 mb-2">價格區間</p>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => togglePriceRange(range.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-all duration-200 ${
                    filters.priceRange === range.value
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* 清除全部 */}
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-400 hover:text-white transition-colors underline"
            >
              清除全部篩選
            </button>
          )}
        </div>
      )}
    </div>
  )
}
