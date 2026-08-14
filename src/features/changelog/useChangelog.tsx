import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { ChangelogModal } from './ChangelogModal'
import { getChangelogHash, getRecentItems } from './changelog'

const SEEN_KEY = 'changelog:seen'
const FOREVER_KEY = 'changelog:forever'

// localStorage can throw (Safari private mode); never let it break app load.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

interface ChangelogContextType {
  openChangelog: () => void
}

const ChangelogContext = createContext<ChangelogContextType | undefined>(undefined)

export function ChangelogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const hasChecked = useRef(false)

  const items = useMemo(() => getRecentItems(5), [])
  const hash = useMemo(() => getChangelogHash(), [])

  useEffect(() => {
    if (!user || hasChecked.current) return
    hasChecked.current = true
    const dismissedForever = readStorage(FOREVER_KEY) === 'true'
    const seen = readStorage(SEEN_KEY)
    if (!dismissedForever && seen !== hash) {
      setIsOpen(true)
    }
  }, [user, hash])

  const dismiss = useCallback(() => {
    writeStorage(SEEN_KEY, hash)
    setIsOpen(false)
  }, [hash])

  const dismissForever = useCallback(() => {
    writeStorage(FOREVER_KEY, 'true')
    writeStorage(SEEN_KEY, hash)
    setIsOpen(false)
  }, [hash])

  const openChangelog = useCallback(() => {
    setIsOpen(true)
  }, [])

  return (
    <ChangelogContext.Provider value={{ openChangelog }}>
      {children}
      {isOpen && (
        <ChangelogModal
          items={items}
          onDismiss={dismiss}
          onDismissForever={dismissForever}
          onClose={dismiss}
        />
      )}
    </ChangelogContext.Provider>
  )
}

export function useChangelog() {
  const context = useContext(ChangelogContext)
  if (context === undefined) {
    throw new Error('useChangelog must be used within a ChangelogProvider')
  }
  return context
}
