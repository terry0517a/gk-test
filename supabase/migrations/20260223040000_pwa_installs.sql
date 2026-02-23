CREATE TABLE IF NOT EXISTS pwa_installs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  install_method TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 同一 IP 只記錄一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_pwa_installs_ip ON pwa_installs(ip_hash);

-- RLS
ALTER TABLE pwa_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pwa_installs"
  ON pwa_installs FOR ALL
  USING (true) WITH CHECK (true);
