import { readFileSync } from 'fs'

// 從 .env.local 讀取環境變數
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=').map((v, i, a) => i === 0 ? v : a.slice(1).join('=')))
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

const SQL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS price_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone TEXT NOT NULL,
    figure_name TEXT NOT NULL,
    deal_price DECIMAL(10, 2) NOT NULL,
    has_screenshot BOOLEAN DEFAULT false,
    has_shared_social BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_reports_phone ON price_reports(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_price_reports_status ON price_reports(status)`,
  `CREATE INDEX IF NOT EXISTS idx_price_reports_created_at ON price_reports(created_at DESC)`,
  `ALTER TABLE price_reports ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_reports' AND policyname = 'Allow public insert on price_reports') THEN
      CREATE POLICY "Allow public insert on price_reports" ON price_reports FOR INSERT WITH CHECK (true);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_reports' AND policyname = 'Allow public read on price_reports') THEN
      CREATE POLICY "Allow public read on price_reports" ON price_reports FOR SELECT USING (true);
    END IF;
  END $$`,
  `CREATE OR REPLACE TRIGGER price_reports_updated_at BEFORE UPDATE ON price_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
]

async function tryManagementAPI() {
  // Supabase Management API (需要 personal access token，但先用 service role key 試試)
  const endpoints = [
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    `${supabaseUrl}/pg-meta/default/query`,
  ]

  for (const endpoint of endpoints) {
    for (const sql of SQL_STATEMENTS) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
        body: JSON.stringify({ query: sql }),
      }).catch(() => null)

      if (res && res.ok) {
        return true
      }
    }
  }
  return false
}

async function tryWithPg() {
  // 嘗試用 pg 套件直接連線
  try {
    const { default: pg } = await import('pg')
    const { Client } = pg

    // 嘗試用 transaction pooler (port 6543) + JWT auth
    const regions = ['ap-southeast-1', 'ap-northeast-1', 'us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1']

    for (const region of regions) {
      try {
        const client = new Client({
          host: `aws-0-${region}.pooler.supabase.com`,
          port: 5432,
          database: 'postgres',
          user: `postgres.${ref}`,
          password: serviceRoleKey,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        })

        await client.connect()
        console.log(`✓ 已連線到 Supabase (${region})`)

        for (const sql of SQL_STATEMENTS) {
          await client.query(sql)
        }

        await client.end()
        return true
      } catch {
        // 嘗試下一個 region
      }
    }
  } catch {
    // pg 套件未安裝
  }
  return false
}

async function main() {
  console.log('正在建立 price_reports 資料表...\n')

  // 方法 1: Management API
  console.log('嘗試透過 API 建立...')
  if (await tryManagementAPI()) {
    console.log('✓ 透過 API 建立成功！')
    return
  }

  // 方法 2: 直接 PG 連線
  console.log('嘗試直接連線資料庫...')
  if (await tryWithPg()) {
    console.log('\n✓ price_reports 資料表建立完成！')
    return
  }

  console.log('\n✗ 自動建立失敗，請手動執行。')
  process.exit(1)
}

main()
