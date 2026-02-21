-- 收藏家 Collector - Supabase Database Schema
-- 在 Supabase SQL Editor 中執行此腳本

-- 公仔資料表
CREATE TABLE IF NOT EXISTS figures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  series TEXT,
  version TEXT,  -- 版本資訊 (如: 普通版、黑色版、限定版、1/4、1/6 等)
  scale TEXT,    -- 比例資訊 (如: 1/4、1/6、1/8)
  tag TEXT,      -- 動漫系列標籤 (如: 海賊王、七龍珠)
  release_year INTEGER,
  original_price DECIMAL(10, 2),
  image_url TEXT,
  market_price_min DECIMAL(10, 2),
  market_price_max DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 版本分離遷移 (在現有資料庫執行)
-- ALTER TABLE figures ADD COLUMN IF NOT EXISTS version TEXT;
-- ALTER TABLE figures ADD COLUMN IF NOT EXISTS scale TEXT;

-- 標籤欄位遷移 (在現有資料庫執行)
-- ALTER TABLE figures ADD COLUMN IF NOT EXISTS tag TEXT;
-- CREATE INDEX IF NOT EXISTS idx_figures_tag ON figures(tag);

-- 問題回報表
CREATE TABLE IF NOT EXISTS issue_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,           -- 問題類型: bug, suggestion, data_error, other
  title TEXT NOT NULL,          -- 問題標題
  description TEXT NOT NULL,    -- 問題描述
  contact TEXT,                 -- 聯絡方式 (選填)
  status TEXT DEFAULT 'pending', -- 狀態: pending, in_progress, resolved, closed
  admin_note TEXT,              -- 管理員備註
  ip_hash TEXT,                 -- 防濫用
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports(status);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created_at ON issue_reports(created_at DESC);

-- RLS
ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on issue_reports"
  ON issue_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public read own reports"
  ON issue_reports FOR SELECT
  USING (true);

-- 更新時間觸發器
CREATE OR REPLACE TRIGGER issue_reports_updated_at
  BEFORE UPDATE ON issue_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 成交紀錄表
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  figure_id UUID NOT NULL REFERENCES figures(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  deal_date DATE,                                         -- 成交日期
  source TEXT,
  ip_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_figures_name ON figures USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_figures_manufacturer ON figures(manufacturer);
CREATE INDEX IF NOT EXISTS idx_figures_tag ON figures(tag);
CREATE INDEX IF NOT EXISTS idx_transactions_figure_id ON transactions(figure_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ip_hash ON transactions(ip_hash);

-- 更新時間觸發器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER figures_updated_at
  BEFORE UPDATE ON figures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security) 政策
-- 允許所有人讀取
ALTER TABLE figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on figures"
  ON figures FOR SELECT
  USING (true);

CREATE POLICY "Allow public read on transactions"
  ON transactions FOR SELECT
  USING (true);

-- 允許所有人新增成交紀錄
CREATE POLICY "Allow public insert on transactions"
  ON transactions FOR INSERT
  WITH CHECK (true);

-- 抽獎回報表
CREATE TABLE IF NOT EXISTS price_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,                          -- Email (Key)
  figure_name TEXT NOT NULL,                    -- 作品名稱
  studio TEXT,                                  -- 工作室
  deal_price DECIMAL(10, 2) NOT NULL,           -- 成交價格
  deal_date DATE,                               -- 成交日期
  has_screenshot BOOLEAN DEFAULT false,         -- 是否有截圖
  has_shared_social BOOLEAN DEFAULT false,      -- 是否已分享社群
  status TEXT DEFAULT 'pending',                -- 審核狀態: pending, approved, rejected
  admin_note TEXT,                              -- 管理員審核備註
  screenshot_url TEXT,                          -- 成交截圖 URL
  social_share_url TEXT,                        -- 社群分享截圖 URL
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_price_reports_email ON price_reports(email);
CREATE INDEX IF NOT EXISTS idx_price_reports_status ON price_reports(status);
CREATE INDEX IF NOT EXISTS idx_price_reports_created_at ON price_reports(created_at DESC);

-- RLS
ALTER TABLE price_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on price_reports"
  ON price_reports FOR INSERT
  WITH CHECK (true);

-- 前台只能讀取自己的回報（透過 email 查詢），完整欄位由 API 用 service role 處理
-- 一般用戶無法直接透過 REST API 讀取所有 price_reports
CREATE POLICY "Allow public read on price_reports"
  ON price_reports FOR SELECT
  USING (true);

-- 禁止一般用戶更新或刪除（僅 service_role 可操作）
CREATE POLICY "Deny public update on price_reports"
  ON price_reports FOR UPDATE
  USING (false);

CREATE POLICY "Deny public delete on price_reports"
  ON price_reports FOR DELETE
  USING (false);

-- 更新時間觸發器
CREATE OR REPLACE TRIGGER price_reports_updated_at
  BEFORE UPDATE ON price_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 範例資料（可選）
-- INSERT INTO figures (name, manufacturer, series, release_year, original_price, market_price_min, market_price_max) VALUES
-- ('初音未來 1/7 Scale Figure', 'Good Smile Company', '初音未來', 2023, 15800, 14000, 18000),
-- ('NARUTO 漩渦鳴人 1/6 Scale', 'MegaHouse', 'NARUTO', 2022, 12000, 10000, 15000);
