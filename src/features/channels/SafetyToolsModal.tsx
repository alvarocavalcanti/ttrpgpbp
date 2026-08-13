import { useSafetyTools } from './useSafetyTools'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

interface SafetyToolsModalProps {
  channelId: string
  safetyToolsUrl?: string | null
  isGM: boolean
  onClose: () => void
}

export function SafetyToolsModal({ channelId, safetyToolsUrl, isGM, onClose }: SafetyToolsModalProps) {
  useEscapeToClose(onClose)
  const { safetyTools, loading } = useSafetyTools(channelId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Safety tools"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Safety Tools</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close safety tools"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {safetyToolsUrl && (
          <a
            href={safetyToolsUrl}
            target="_blank"
            rel="noreferrer"
            className="block mb-4 px-4 py-2.5 rounded-md bg-indigo-50 border border-indigo-200 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Open Safety Tools Doc
          </a>
        )}

        {loading ? (
          <div className="animate-pulse space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Lines</h4>
              <p className="text-sm text-gray-500 whitespace-pre-wrap">
                {safetyTools?.lines
                  ? safetyTools.lines
                  : 'No Lines set. These are the hard limits everyone agrees never to cross.'}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Veils</h4>
              <p className="text-sm text-gray-500 whitespace-pre-wrap">
                {safetyTools?.veils
                  ? safetyTools.veils
                  : 'No Veils set. These are the topics that happen "off-screen" when they come up.'}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">X-Card</h4>
              <p className="text-sm text-gray-500">
                Anyone can press the X-Card button at any time. It privately flags the current scene to the GM
                without revealing who pressed it.
              </p>
            </div>
            {isGM && (
              <p className="text-xs text-gray-400 italic">
                Edit Lines &amp; Veils in Channel Settings (GM).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
