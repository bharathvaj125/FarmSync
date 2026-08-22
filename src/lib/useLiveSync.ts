import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Subscribes to live Postgres changes (Supabase Realtime, over a
 * websocket) on the given tables and re-runs `onChange` whenever any row
 * in any of them is inserted, updated, or deleted -- so if a buyer
 * confirms a deal on their screen, a farmer already sitting on their
 * dashboard sees the updated numbers within about a second, with no
 * manual refresh. Requires each table to be added to Supabase's
 * `supabase_realtime` publication -- see add_realtime_and_contact.sql.
 */
export function useLiveSync(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const tableKey = tables.join(',')

  useEffect(() => {
    const channel = supabase.channel(`live-sync:${tableKey}`)
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChangeRef.current(),
      )
    }
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey])
}
