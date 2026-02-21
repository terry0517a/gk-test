-- 建立 unique_users 表來追蹤歷史使用者
CREATE TABLE IF NOT EXISTS unique_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT UNIQUE NOT NULL,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_unique_users_ip_hash ON unique_users(ip_hash);

-- 從現有的 transactions 表導入唯一使用者
INSERT INTO unique_users (ip_hash, first_seen, last_seen)
SELECT DISTINCT
  ip_hash,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM transactions
WHERE ip_hash IS NOT NULL
GROUP BY ip_hash
ON CONFLICT (ip_hash) DO UPDATE SET
  last_seen = EXCLUDED.last_seen;
