import { Navigate } from 'react-router-dom'
import { useAuth, homeFor, type Role } from '../lib/AuthContext'

export default function RequireRole({
  role,
  children,
}: {
  role: Role | Role[]
  children: React.ReactNode
}) {
  const { session, profile, loading } = useAuth()
  const allowed = Array.isArray(role) ? role : [role]

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-50 text-sand-500">Loading…</div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-50 px-6 text-center text-sand-500">
        Your account has no role assigned yet. Ask an admin to set one in the profiles table.
      </div>
    )
  }
  if (!allowed.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />

  return <>{children}</>
}
