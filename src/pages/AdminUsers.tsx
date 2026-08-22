import { useEffect, useState } from 'react'
import { UserPlus, Trash2, Sprout, Store, Truck, Shield } from 'lucide-react'
import { supabase, signupClient } from '../lib/supabase'
import { useAuth, ROLE_LABEL, type Profile, type Role } from '../lib/AuthContext'

const ROLE_ICON: Record<Role, typeof Sprout> = {
  farmer: Sprout,
  shop: Store,
  transport: Truck,
  admin: Shield,
}

const ROLE_ORDER: Role[] = ['admin', 'farmer', 'shop', 'transport']

export default function AdminUsers() {
  const { profile: me } = useAuth()
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at')
    if (loadError) setError(loadError.message)
    else setPeople(data as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <Centered>Loading accounts…</Centered>

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-sand-900">People on the platform</h1>
        <p className="mt-1 text-sm text-sand-500">
          {people.length} accounts. Removing someone also removes the listings they own.
        </p>
      </div>

      <NewUserForm onCreated={load} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {ROLE_ORDER.map((role) => {
        const group = people.filter((p) => p.role === role)
        if (group.length === 0) return null
        const Icon = ROLE_ICON[role]
        return (
          <section key={role} className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Icon size={16} className="text-sand-400" />
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-sand-500">
                {ROLE_LABEL[role]}
                <span className="ml-2 font-sans normal-case tracking-normal text-sand-400">
                  {group.length}
                </span>
              </h2>
            </div>
            <ul className="divide-y divide-sand-100">
              {group.map((person) => (
                <li key={person.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-sand-900">
                      {person.display_name || '—'}
                      {person.id === me?.id && (
                        <span className="ml-2 rounded-full bg-sand-100 px-1.5 py-0.5 text-[10px] font-semibold text-sand-500">
                          YOU
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-sand-500">{person.email}</p>
                  </div>
                  {person.id !== me?.id && <RemoveButton person={person} onRemoved={load} />}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}

function RemoveButton({ person, onRemoved }: { person: Profile; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    const ok = window.confirm(
      `Remove ${person.display_name || person.email} from the platform?\n\n` +
        `Their account will lose access, and any harvests, demands, or transport routes they own will be deleted.`,
    )
    if (!ok) return

    setBusy(true)
    const { error: deleteError } = await supabase.from('profiles').delete().eq('id', person.id)
    setBusy(false)
    if (deleteError) setError(deleteError.message)
    else onRemoved()
  }

  return (
    <div className="flex flex-none items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleRemove}
        disabled={busy}
        className="flex items-center gap-1 rounded-md border border-sand-300 px-2.5 py-1.5 text-xs font-medium text-sand-600 hover:border-red-800 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
      >
        <Trash2 size={12} />
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </div>
  )
}

function NewUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    password: '',
    role: 'farmer' as Role,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setDone(null)

    const { error: signUpError } = await signupClient.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { role: form.role, display_name: form.display_name } },
    })

    setSubmitting(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setDone(`${form.display_name || form.email} added as ${ROLE_LABEL[form.role]}.`)
    setForm({ display_name: '', email: '', password: '', role: 'farmer' })
    onCreated()
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <UserPlus size={14} /> Add a person
        </button>
        {done && <p className="mt-2 text-sm text-brand-700">{done}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
      <h2 className="font-display text-sm font-semibold text-sand-900">Add a person</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
          >
            <option value="farmer">Farmer</option>
            <option value="shop">Shopkeeper</option>
            <option value="transport">Transport</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Name">
          <input
            required
            type="text"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            placeholder="e.g. Ravi Kumar"
          />
        </Field>
      </div>

      <Field label="Email">
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
          placeholder="name@example.com"
        />
      </Field>

      <Field label="Password">
        <input
          required
          type="password"
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
          placeholder="At least 6 characters"
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-sand-300 px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-sand-600">{label}</span>
      {children}
    </label>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
