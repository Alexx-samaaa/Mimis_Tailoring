'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../../utils/supabase/info'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  `https://${projectId}.supabase.co`
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || publicAnonKey

const globalForSupabase = globalThis as typeof globalThis & {
  mimisSupabase?: SupabaseClient
}

export const supabase =
  globalForSupabase.mimisSupabase ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.mimisSupabase = supabase
}
