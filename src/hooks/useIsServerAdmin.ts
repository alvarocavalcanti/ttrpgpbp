import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { RpcBooleanSchema, parseRow } from '../features/validation/rowSchemas'

// server_admin is no longer readable from the profiles API (H1/P0-3); admin
// status comes from the SECURITY DEFINER is_server_admin() RPC instead.
export function useIsServerAdmin() {
  const [isServerAdmin, setIsServerAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase.rpc('is_server_admin')
        if (mounted) setIsServerAdmin(parseRow(RpcBooleanSchema, data) ?? false)
      } catch (err) {
        console.error('Failed to check server admin status:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return { isServerAdmin, loading }
}
