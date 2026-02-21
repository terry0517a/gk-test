-- 建立 shared_collections 表來儲存分享的追蹤清單
CREATE TABLE IF NOT EXISTS shared_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_code TEXT UNIQUE NOT NULL,
  nickname TEXT,
  items JSONB NOT NULL,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_shared_collections_share_code ON shared_collections(share_code);
CREATE INDEX IF NOT EXISTS idx_shared_collections_created_at ON shared_collections(created_at DESC);
