import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Sprout, Store, Truck, LineChart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, homeFor } from '../lib/AuthContext'

const FEATURES = [
  { icon: Sprout, text: 'Farmers see net realization, not just headline price' },
  { icon: Store, text: 'Shops see landed cost, not just the quoted rate' },
  { icon: Truck, text: 'Every route matched against real truck capacity' },
]

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
    <div className="flex min-h-screen bg-sand-100">
      {/* Brand panel */}
      <div className="relative hidden w-[44%] flex-none overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-channel-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-channel-400 opacity-20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-brand-200 opacity-20 blur-3xl"
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Sprout size={20} className="text-white" />
          </div>
          <span className="font-display text-lg font-bold text-white">FarmSync</span>
        </div>

        <div className="relative">
          <p className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-brand-100">
            Farm → Shop → Logistics
          </p>
          <h1 className="font-display max-w-sm text-3xl font-bold leading-tight text-white">
            The decision layer for every harvest trade.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
            One shared optimizer, three roles. Nobody sees a raw price list — everyone sees the number
            that actually matters to them.
          </p>

          <div className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/15">
                  <Icon size={15} className="text-white" />
                </div>
                <span className="text-sm text-white/90">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/50">
          <LineChart size={14} />
          Live optimization, computed on every login
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-channel-600">
              <Sprout size={24} className="text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-sand-900">FarmSync</h1>
            <p className="mt-1 text-sm text-sand-500">Farm → Shop → Logistics decision intelligence</p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h2 className="font-display text-2xl font-bold text-sand-900">Welcome back</h2>
            <p className="mt-1 text-sm text-sand-500">Log in with your account to see your view.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(29,27,21,0.04),0_16px_40px_-16px_rgba(29,27,21,0.15)]"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-sand-600">Email</span>
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-gradient-to-r from-brand-600 to-channel-700 py-2.5 text-sm font-medium text-white transition hover:from-brand-700 hover:to-channel-900 disabled:opacity-50"
            >
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-sand-400">
            Demo build — ask your admin for account access.
          </p>
        </div>
      </div>
    </div>
  )
}
