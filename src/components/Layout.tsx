import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Sprout, LogOut, Sparkles, LayoutGrid, Users, Truck, LifeBuoy, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, homeFor, ROLE_LABEL, type Role } from '../lib/AuthContext'

const ADMIN_NAV = [
  { to: '/', label: 'Analytics', icon: LayoutGrid, exact: true },
  { to: '/admin/users', label: 'People', icon: Users, exact: false },
  { to: '/admin/trucks', label: 'Fleet', icon: Truck, exact: false },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy, exact: false },
]

// Farmers, shops, and truck owners don't get a management sidebar (they
// work from their own dashboard), but they do get a way to reach the
// admin directly for anything outside the normal deal/payment/truck
// flows.
const WORKER_NAV = [{ to: '/support', label: 'Support', icon: LifeBuoy, exact: false }]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [openSupportCount, setOpenSupportCount] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  // Admin-only: a live count for the sidebar badge (so an open message
  // is never missed even if nobody was looking at the right moment) plus
  // a transient popup the instant a new one arrives, wherever the admin
  // currently is in the app -- Layout wraps every admin page.
  useEffect(() => {
    if (profile?.role !== 'admin') return
    let active = true

    async function refreshCount() {
      const { count } = await supabase
        .from('support_messages')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
      if (active) setOpenSupportCount(count ?? 0)
    }
    refreshCount()

    const channel = supabase
      .channel('admin-support-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        (payload) => {
          const row = payload.new as { sender_name: string; sender_role: Role; subject: string }
          setToast(`New support message from ${row.sender_name} (${ROLE_LABEL[row.sender_role]}): "${row.subject}"`)
          refreshCount()
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages' }, refreshCount)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [profile?.role])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 10000)
    return () => clearTimeout(timer)
  }, [toast])

  const nav = profile?.role === 'admin' ? ADMIN_NAV : profile?.role ? WORKER_NAV : []

  return (
    <div className="flex min-h-screen bg-sand-50 text-sand-900">
      <aside className="flex w-60 flex-none flex-col border-r border-sand-200 bg-sand-100 px-4 py-6">
        <Link to={profile ? homeFor(profile.role) : '/'} className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Sprout size={18} className="text-white" />
          </div>
          <div>
            <div className="font-display text-base font-bold leading-none text-sand-900">FarmSync</div>
            <div className="text-[11px] leading-none text-sand-500 mt-0.5">Decision intelligence</div>
          </div>
        </Link>

        {profile && (
          <div className="mb-6 rounded-lg bg-sand-100 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sand-700">
              <Sparkles size={12} className="text-brand-500" />
              {profile.display_name || ROLE_LABEL[profile.role]}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-sand-500">
              {ROLE_LABEL[profile.role]} · {profile.email}
            </div>
          </div>
        )}

        {nav.length > 0 && (
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to)
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-sand-600 hover:bg-sand-100 hover:text-sand-900'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                  {item.to === '/admin/support' && openSupportCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {openSupportCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        )}

        <button
          onClick={() => signOut()}
          className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sand-600 hover:bg-sand-100 hover:text-sand-900"
        >
          <LogOut size={16} />
          Log out
        </button>

        <div className="mt-4 rounded-lg bg-sand-100 px-3 py-3 text-[11px] leading-relaxed text-sand-500">
          Demo data, hackathon build. All figures are illustrative — see the seed dataset in{' '}
          <code className="text-sand-600">supabase/schema.sql</code>.
        </div>
      </aside>

      <div className="flex-1">
        <Outlet />
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2.5 rounded-xl border border-brand-200 bg-sand-100 p-4 shadow-lg">
          <LifeBuoy size={16} className="mt-0.5 flex-none text-brand-600" />
          <p className="flex-1 text-sm text-sand-800">{toast}</p>
          <button onClick={() => setToast(null)} className="flex-none text-sand-400 hover:text-sand-700">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
