import { createClient } from '@supabase/supabase-js'

/**
 * Only the URL and the ANON key are here. Both are designed to be public —
 * the anon key grants nothing on its own, and every admin route on the API
 * independently verifies the JWT and checks the email allowlist.
 *
 * The service role key and the Stripe secret key must NEVER appear in this
 * folder. Anything imported here ends up in the browser bundle.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export async function getAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
