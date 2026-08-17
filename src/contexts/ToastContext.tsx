import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

const MAX_TOASTS = 5
const TOAST_AUTO_DISMISS_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [timers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
  }, [timers])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = crypto.randomUUID()
    setToasts(prev => {
      const newToasts = [...prev, { id, message, type }]
      const kept = newToasts.slice(-MAX_TOASTS) // keep only the latest MAX_TOASTS
      if (kept.length < newToasts.length) {
        newToasts.slice(0, newToasts.length - MAX_TOASTS).forEach(evicted => {
          const timer = timers.get(evicted.id)
          if (timer) {
            clearTimeout(timer)
            timers.delete(evicted.id)
          }
        })
      }
      return kept
    })

    // Auto remove after 3 seconds
    const timer = setTimeout(() => {
      removeToast(id)
    }, TOAST_AUTO_DISMISS_MS)
    timers.set(id, timer)
  }, [removeToast, timers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
    }
  }, [timers])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between min-w-[250px] px-4 py-3 rounded shadow-lg text-sm text-white transition-all duration-300 transform translate-y-0 opacity-100 ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' :
              'bg-blue-600'
            }`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="ml-4 text-white hover:text-gray-200 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
