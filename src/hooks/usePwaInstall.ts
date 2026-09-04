import { useCallback, useEffect, useState } from 'react'

// The `beforeinstallprompt` event is Chromium-only and absent from the TS DOM
// lib. Capturing it lets us surface a custom install banner instead of
// Chrome's default mini-infobar (#387).
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

const DISMISS_KEY = 'pwa-install:dismissed-at'
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// localStorage can throw (Safari private mode); never let it break app load.
function readDismissedAt(): number {
  try {
    const v = window.localStorage.getItem(DISMISS_KEY)
    const n = v ? Number(v) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeDismissedAt(at: number): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(at))
  } catch {
    // ignore
  }
}

// Captures Chromium's installability signal and drives the install banner.
// `install()` must be called from a user gesture — `prompt()` is rejected
// otherwise — so it is wired to the banner's Install button onClick.
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissedAt, setDismissedAt] = useState<number>(readDismissedAt)

  useEffect(() => {
    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault() // suppress Chrome's default mini-infobar
      setDeferredPrompt(e)
    }
    const onInstalled = () => setDeferredPrompt(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const canShow = !!deferredPrompt && Date.now() - dismissedAt > DISMISS_COOLDOWN_MS

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    // The native dialog has a "cancel" path too; declining it should cool the
    // banner down the same way as our own "No thanks", not re-offer every load.
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'dismissed') {
      const now = Date.now()
      setDismissedAt(now)
      writeDismissedAt(now)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    setDeferredPrompt(null)
    const now = Date.now()
    setDismissedAt(now)
    writeDismissedAt(now)
  }, [])

  return { canShow, install, dismiss }
}