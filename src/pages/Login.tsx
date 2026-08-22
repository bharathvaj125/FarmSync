import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Sprout, Check, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, homeFor } from '../lib/AuthContext'

export default function Login() {
  const { session, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080C07] px-6 py-12">
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-500 opacity-[0.12] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-channel-400 opacity-[0.10] blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#10150F] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_30px_60px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-channel-600 shadow-lg shadow-brand-900/40">
              <Sprout size={30} className="text-white" />
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#10150F] bg-brand-400">
              <Check size={12} className="text-[#0A0E0A]" strokeWidth={3} />
            </div>
          </div>

          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-400">
            Farm → Shop → Logistics
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">FarmSync</h1>
          <p className="mt-1 text-sm text-white/40">Decision Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
              <Mail size={12} className="text-brand-400" />
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400/40"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
              <Lock size={12} className="text-brand-400" />
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-9 text-sm text-white placeholder-white/25 outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400/40"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-0.5 text-[11px] text-white/35">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-brand-400" />
              Secure login
            </span>
            <span>Demo access</span>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-channel-600 py-3 text-sm font-semibold text-white transition hover:from-brand-400 hover:to-channel-500 disabled:opacity-50"
          >
            {submitting ? 'Logging in…' : 'Log in'}
            {!submitting && <ArrowRight size={15} />}
          </button>
        </form>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-center text-[11px] leading-relaxed text-white/30">
            Demo build for hackathon evaluation. Contact your admin for account access.
          </p>
        </div>
      </div>
    </div>
  )
}
