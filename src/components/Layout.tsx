import { Link, Outlet, useLocation } from 'react-router-dom'
import { Sprout, LogOut, Sparkles, LayoutGrid, Users, Truck } from 'lucide-react'
import { useAuth, homeFor, ROLE_LABEL } from '../lib/AuthContext'

const ADMIN_NAV = [
  { to: '/', label: 'Analytics', icon: LayoutGrid, exact: true },
  { to: '/admin/users', label: 'People', icon: Users, exact: false },
  { to: '/admin/trucks', label: 'Fleet', icon: Truck, exact: false },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const location = useLocation()

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

        {profile?.role === 'admin' && (
          <nav className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => {
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
    </div>
  )
}
