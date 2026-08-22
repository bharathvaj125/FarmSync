import { Link, Outlet, useLocation } from 'react-router-dom'
import { Sprout, LayoutGrid, Store, Truck } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/farmer', label: 'Farmer', icon: Sprout, end: false },
  { to: '/shop', label: 'Shopkeeper', icon: Store, end: false },
  { to: '/transport', label: 'Transport', icon: Truck, end: false, disabled: true },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-sand-50 text-sand-900">
      <aside className="flex w-60 flex-none flex-col border-r border-sand-200 bg-white px-4 py-6">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Sprout size={18} className="text-white" />
          </div>
          <div>
            <div className="font-display text-base font-bold leading-none text-sand-900">FarmSync</div>
            <div className="text-[11px] leading-none text-sand-500 mt-0.5">Decision intelligence</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
            const Icon = item.icon
            if (item.disabled) {
              return (
                <span
                  key={item.to}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sand-400"
                >
                  <Icon size={16} />
                  {item.label}
                  <span className="ml-auto rounded-full bg-sand-100 px-1.5 py-0.5 text-[10px] font-medium text-sand-500">
                    soon
                  </span>
                </span>
              )
            }
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

        <div className="mt-auto rounded-lg bg-sand-100 px-3 py-3 text-[11px] leading-relaxed text-sand-500">
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
