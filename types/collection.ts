// LocalStorage 追蹤項目
export interface TrackedItem {
  id: string
  figure_id: string
  name: string
  image_url: string | null
  // 上次查看時的價格範圍
  last_seen_price_min: number | null
  last_seen_price_max: number | null
  // 目前的價格範圍
  current_price_min: number | null
  current_price_max: number | null
  // 價格變化（與上次查看比較）
  price_change: number  // 正數=漲價，負數=跌價
  added_at: string
  last_viewed: string  // 上次查看時間
}

// LocalStorage key
export const TRACKED_STORAGE_KEY = 'collector_tracked_items'

// 從 LocalStorage 讀取追蹤清單
export function getTrackedItems(): TrackedItem[] {
  if (typeof window === 'undefined') return []

  const stored = localStorage.getItem(TRACKED_STORAGE_KEY)
  if (!stored) return []

  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

// 儲存追蹤清單到 LocalStorage
export function saveTrackedItems(items: TrackedItem[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(items))
}

// 計算價格變化
function calculatePriceChange(
  lastMin: number | null,
  lastMax: number | null,
  currentMin: number | null,
  currentMax: number | null
): number {
  if (!lastMin || !lastMax || !currentMin || !currentMax) {
    return 0
  }

  const lastAvg = (lastMin + lastMax) / 2
  const currentAvg = (currentMin + currentMax) / 2
  return Math.round(currentAvg - lastAvg)
}

// 新增追蹤
export function addTrackedItem(item: {
  id: string
  figure_id: string
  name: string
  image_url: string | null
  market_price_min: number | null
  market_price_max: number | null
}): TrackedItem[] {
  const items = getTrackedItems()

  // 檢查是否已追蹤
  if (items.some(i => i.figure_id === item.figure_id)) {
    return items
  }

  const now = new Date().toISOString()
  const newItem: TrackedItem = {
    id: item.id,
    figure_id: item.figure_id,
    name: item.name,
    image_url: item.image_url,
    last_seen_price_min: item.market_price_min,
    last_seen_price_max: item.market_price_max,
    current_price_min: item.market_price_min,
    current_price_max: item.market_price_max,
    price_change: 0,
    added_at: now,
    last_viewed: now,
  }

  items.push(newItem)
  saveTrackedItems(items)
  return items
}

// 移除追蹤
export function removeTrackedItem(id: string): TrackedItem[] {
  const items = getTrackedItems().filter(item => item.id !== id)
  saveTrackedItems(items)
  return items
}

// 更新追蹤項目的價格（當用戶查看時調用）
export function updateTrackedItemPrice(
  figureId: string,
  newPriceMin: number | null,
  newPriceMax: number | null
): TrackedItem[] {
  const items = getTrackedItems().map(item => {
    if (item.figure_id !== figureId) return item

    // 計算與上次查看的價格差異
    const priceChange = calculatePriceChange(
      item.last_seen_price_min,
      item.last_seen_price_max,
      newPriceMin,
      newPriceMax
    )

    return {
      ...item,
      // 更新「上次查看價格」為之前的「目前價格」
      last_seen_price_min: item.current_price_min,
      last_seen_price_max: item.current_price_max,
      // 更新目前價格
      current_price_min: newPriceMin,
      current_price_max: newPriceMax,
      price_change: priceChange,
      last_viewed: new Date().toISOString(),
    }
  })

  saveTrackedItems(items)
  return items
}

// 檢查是否已追蹤
export function isTracked(figureId: string): boolean {
  return getTrackedItems().some(item => item.figure_id === figureId)
}

// 取得追蹤項目
export function getTrackedItem(figureId: string): TrackedItem | undefined {
  return getTrackedItems().find(item => item.figure_id === figureId)
}

// ========== 舊版收藏相容（保留以防需要遷移）==========
export interface CollectionItem {
  id: string
  figure_id: string
  name: string
  image_url: string | null
  purchase_price: number
  purchase_date: string
  market_price_min: number | null
  market_price_max: number | null
  label: '買得漂亮' | '差不多' | '略高'
  added_at: string
}

export const COLLECTION_STORAGE_KEY = 'collector_items'

export function getCollectionItems(): CollectionItem[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(COLLECTION_STORAGE_KEY)
  if (!stored) return []
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

export function addCollectionItem(item: Omit<CollectionItem, 'added_at'>): CollectionItem[] {
  const items = getCollectionItems()
  const newItem: CollectionItem = {
    ...item,
    added_at: new Date().toISOString(),
  }
  items.push(newItem)
  if (typeof window !== 'undefined') {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(items))
  }
  return items
}

export function removeCollectionItem(id: string): CollectionItem[] {
  const items = getCollectionItems().filter(item => item.id !== id)
  if (typeof window !== 'undefined') {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(items))
  }
  return items
}
