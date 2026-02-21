import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null
let supabaseAdminInstance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // 如果沒有 anon key，降級使用 admin client
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceRoleKey) {
      console.warn('NEXT_PUBLIC_SUPABASE_ANON_KEY not set, falling back to admin client')
      supabaseInstance = createClient(supabaseUrl, serviceRoleKey)
      return supabaseInstance
    }
    throw new Error('Missing Supabase environment variables')
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  return supabaseInstance
}

// Admin client（使用 service role key，繞過 RLS）
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) return supabaseAdminInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    // 如果沒有 service role key，fallback 到 anon key
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set, admin operations may fail due to RLS')
    return getSupabase()
  }

  supabaseAdminInstance = createClient(supabaseUrl, serviceRoleKey)
  return supabaseAdminInstance
}

// 為了向後兼容，也導出一個 getter
export const supabase = {
  from: (table: string) => getSupabase().from(table),
  get storage() {
    return getSupabase().storage
  },
}

// Admin 版本（用於需要 UPDATE/DELETE 的管理員操作）
export const supabaseAdmin = {
  from: (table: string) => getSupabaseAdmin().from(table),
  get storage() {
    return getSupabaseAdmin().storage
  },
}
