export interface Figure {
  id: string
  name: string
  manufacturer: string | null
  series: string | null
  version: string | null   // 版本資訊 (如: 黑色版、限定版等)
  scale: string | null     // 比例資訊 (如: 1/4、1/6、1/8)
  tag: string | null       // 動漫系列標籤 (如: 海賊王、七龍珠)
  release_year: number | null
  original_price: number | null
  image_url: string | null
  market_price_min: number | null
  market_price_max: number | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  figure_id: string
  price: number
  deal_date: string | null  // 成交日期
  source: string | null  // 用戶提供的來源說明
  created_at: string
  ip_hash: string | null  // 用於防濫用的 IP hash
}

export interface Database {
  public: {
    Tables: {
      figures: {
        Row: Figure
        Insert: Omit<Figure, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Figure, 'id' | 'created_at' | 'updated_at'>>
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, 'id' | 'created_at'>
        Update: Partial<Omit<Transaction, 'id' | 'created_at'>>
      }
    }
  }
}
