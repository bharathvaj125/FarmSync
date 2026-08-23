import { useEffect, useState } from 'react'
import { LifeBuoy, Send, CheckCircle2, Clock3, Phone, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useLiveSync } from '../lib/useLiveSync'
import type { SupportMessage } from '../lib/types'

interface AdminContact {
  id: string
  display_name: string
  email: string
  phone_number: string | null
}

/**
 * A direct line to the admin for anything outside the normal deal/
 * payment/truck flows -- a dispute, a bug, a question. Leads with the
 * admin's own phone/email for anything urgent enough not to wait on a
 * message being read, then the form, then the sender's own message
 * history below so they can see it was received and whether the admin
 * has resolved it, live.
 */
export default function Support() {
  const { profile } = useAuth()
  const [admins, setAdmins] = useState<AdminContact[]>([])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [history, setHistory] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!profile) return
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('sender_id', profile.id)
      .order('created_at', { ascending: false })
    setHistory((data as SupportMessage[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id,display_name,email,phone_number')
      .eq('role', 'admin')
      .order('display_name')
      .then(({ data }) => setAdmins((data as AdminContact[]) ?? []))
  }, [])

  useLiveSync(['support_messages'], load)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || profile.role === 'admin') return
    setSubmitting(true)
    setError(null)
    setSent(false)

    const { error: insertError } = await supabase.from('support_messages').insert({
      sender_id: profile.id,
      sender_name: profile.display_name,
      sender_role: profile.role,
      subject,
      message,
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setSubject('')
    setMessage('')
    setSent(true)
    load()
  }

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
          <LifeBuoy size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">Support</h1>
          <p className="text-sm text-sand-500">Send anything to the admin — a dispute, a bug, a question.</p>
        </div>
      </div>

      {admins.length > 0 && (
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sand-500">
            <ShieldCheck size={13} className="text-brand-600" /> Contact the admin directly
          </div>
          <div className="space-y-2.5">
            {admins.map((admin) => (
              <div key={admin.id}>
                <p className="text-sm font-medium text-sand-900">{admin.display_name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-sand-600">
                  {admin.phone_number && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={12} className="text-sand-400" /> {admin.phone_number}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Mail size={12} className="text-sand-400" /> {admin.email}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <Field label="Subject">
          <input
            required
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Payment not received for my last order"
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Message">
          <textarea
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what happened — as much detail as helps."
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {sent && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <CheckCircle2 size={14} /> Sent to the admin.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Send size={14} /> {submitting ? 'Sending…' : 'Send to admin'}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-sand-900">Your messages</h2>
        {loading ? (
          <p className="text-sm text-sand-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-sand-400">You haven't sent anything yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((m) => (
              <div key={m.id} className="rounded-lg border border-sand-200 bg-sand-50 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-sand-900">{m.subject}</p>
                  {m.status === 'resolved' ? (
                    <span className="flex flex-none items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                      <CheckCircle2 size={10} /> Resolved
                    </span>
                  ) : (
                    <span className="flex flex-none items-center gap-1 rounded-full bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      <Clock3 size={10} /> Open
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-sand-500">{m.message}</p>
                <p className="mt-1.5 text-[11px] text-sand-400">{new Date(m.created_at).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
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
