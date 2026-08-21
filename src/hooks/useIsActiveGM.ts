import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/useAuth'

export function useIsActiveGM() {
  const { user } = useAuth()
  const [isActiveGM, setIsActiveGM] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function check() {
      if (!user?.id) {
        if (mounted) {
          setIsActiveGM(false)
          setLoading(false)
        }
        return
      }
      
      const { data, error } = await supabase.rpc('is_active_gm', { p_user_id: user.id })
      if (!error && mounted) {
        setIsActiveGM(data || false)
      }
      if (mounted) setLoading(false)
    }
    check()
  }, [user?.id])

  return { isActiveGM, loading }
}
