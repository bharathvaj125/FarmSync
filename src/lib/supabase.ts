import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(url, anonKey)

/**
 * A second client that never persists a session. Signing a user up
 * normally logs you in *as* that new user, which would kick the admin
 * out of their own session mid-task. Creating the account through this
 * throwaway client leaves the admin's session on `supabase` untouched.
 */
export const signupClient = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    // Distinct storage key so this client can never read or overwrite the
    // admin's stored session, even transiently during signUp.
    storageKey: 'farmsync-signup-only',
  },
})
