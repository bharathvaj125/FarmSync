import { useEffect, useState } from 'react'
import { LifeBuoy, CheckCircle2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveSync } from '../lib/useLiveSync'
import { ROLE_LABEL } from '../lib/AuthContext'
import type { SupportMessage } from '../lib/types'

/** The admin's inbox for every support message sent by a farmer, buyer, or truck owner -- see Layout for the live "new message" popup. */
export default function AdminSupport() {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('support_messages').select('*').order('created_at', { ascending: false })
    setMessages((data as SupportMessage[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useLiveSync(['support_messages'], load)

  async function handleResolve(id: string) {
    await supabase
      .from('support_messages')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
  }

  if (loading) return <Centered>Loading…</Centered>

  const open = messages.filter((m) => m.status === 'open')
  const resolved = messages.filter((m) => m.status === 'resolved')

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
          <LifeBuoy size={18} className="text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">Support</h1>
          <p className="text-sm text-sand-500">
            {open.length} open, {resolved.length} resolved — from farmers, buyers, and truck owners.
          </p>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-sand-500">No support messages yet.</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sand-500">Open ({open.length})</h2>
            {open.length === 0 ? (
              <p className="text-sm text-sand-400">Nothing open right now.</p>
            ) : (
              <div className="space-y-3">
                {open.map((m) => (
                  <MessageRow key={m.id} message={m} onResolve={handleResolve} />
                ))}
              </div>
            )}
          </section>

          {resolved.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sand-500">
                Resolved ({resolved.length})
              </h2>
              <div className="space-y-3">
                {resolved.map((m) => (
                  <MessageRow key={m.id} message={m} onResolve={handleResolve} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function MessageRow({ message, onResolve }: { message: SupportMessage; onResolve: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-sand-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sand-900">{message.subject}</p>
          <p className="text-xs text-sand-500">
            {message.sender_name} · {ROLE_LABEL[message.sender_role]} ·{' '}
            {new Date(message.created_at).toLocaleString('en-IN')}
          </p>
        </div>
        {message.status === 'open' ? (
          <button
            onClick={() => onResolve(message.id)}
            className="flex flex-none items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            <Check size={12} /> Mark resolved
          </button>
        ) : (
          <span className="flex flex-none items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
            <CheckCircle2 size={10} /> Resolved
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-sand-700">{message.message}</p>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
