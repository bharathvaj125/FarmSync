import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Sprout } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, homeFor } from '../lib/AuthContext'

export default function Login() {
  const { session, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session && profile) {
    return <Navigate to={homeFor(profile.role)} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setSubmitting(false)
    if (signInError) {
      setError('Incorrect email or password.')
    }
    // On success, AuthProvider's onAuthStateChange picks up the new
    // session and this component re-renders into the redirect above.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <Sprout size={24} className="text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-sand-900">FarmSync</h1>
          <p className="mt-1 text-sm text-sand-500">Farm → Shop → Logistics decision intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-sand-600">Email</span>
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-sand-600">Password</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
