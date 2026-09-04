import { usePwaInstall } from '../hooks/usePwaInstall'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

interface BannerActions {
  install: () => Promise<void>
  dismiss: () => void
}

// Top-center install prompt shown on Chromium once the browser reports the app
// is installable (captured via beforeinstallprompt). Non-blocking banner, not
// a modal — Install must stay a direct click so prompt() runs in a user gesture.
export function PwaInstallBanner() {
  const { canShow, install, dismiss } = usePwaInstall()
  if (!canShow) return null
  return <PwaInstallBannerInner install={install} dismiss={dismiss} />
}

// Inner component mounts only while the banner is visible, so its Escape
// handler (and any other effects) exist solely during the banner's lifetime —
// an Escape keypress with the banner hidden must never dismiss/persist it.
function PwaInstallBannerInner({ install, dismiss }: BannerActions) {
  useEscapeToClose(dismiss)

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 max-w-[calc(100vw-2rem)]"
      role="region"
      aria-label="Install Role by Post"
      data-testid="pwa-install-banner"
    >
      <img src="/RoleByPost.png" alt="" className="w-9 h-9 rounded shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Install Role by Post</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">One-tap access and offline play.</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <button
          type="button"
          onClick={dismiss}
          className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => { void install() }}
          className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded focus:outline-none focus:ring-offset-1 focus:ring-2 focus:ring-indigo-500"
        >
          Install
        </button>
      </div>
    </div>
  )
}