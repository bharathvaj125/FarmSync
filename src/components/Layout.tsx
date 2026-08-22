import { Link, Outlet, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-6 py-4 flex items-center justify-between">
        <Link to="/" className="block">
          <h1 className="text-xl font-semibold">FarmSync</h1>
          <p className="text-sm text-neutral-500">Farm → Shop → Logistics decision intelligence</p>
        </Link>
        {!isLanding && (
          <Link
            to="/"
            className="text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-lg px-3 py-1.5"
          >
            Switch role
          </Link>
        )}
      </header>
      <Outlet />
    </div>
  )
}
