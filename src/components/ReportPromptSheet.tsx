import { useId, useState } from 'react'
import { TextPromptSheet } from './TextPromptSheet'

interface ReportPromptSheetProps {
  title: string
  label: string
  maxLength: number
  placeholder?: string
  /**
   * What this report can lead to, in this flow's own words. Required with no
   * default on purpose: a shared default would make a listing report promise
   * that an account gets suspended (#789).
   */
  consequence: React.ReactNode
  /** Consent wording. Must name this flow's outcome, not the other flow's. */
  consentLabel: React.ReactNode
  /** Revealed inline by Learn more, so the sheet (and the typed reason) survives. */
  learnMore: React.ReactNode
  confirmLabel: string
  onConfirm: (reason: string) => void
  onClose: () => void
  pending?: boolean
}

// Report variant of the text prompt (#789): the reporter is told who reads the
// report and what it can lead to, and Submit stays disabled until they tick the
// consent box and type a reason. Both report flows (message, listing) use it, so
// the outcome copy is a required prop rather than a default.
export function ReportPromptSheet({ title, label, maxLength, placeholder, consequence, consentLabel, learnMore, confirmLabel, onConfirm, onClose, pending }: ReportPromptSheetProps) {
  const [consented, setConsented] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const consentId = useId()
  const guidanceId = useId()

  return (
    <TextPromptSheet
      title={title}
      label={label}
      maxLength={maxLength}
      placeholder={placeholder}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onClose={onClose}
      pending={pending}
      requireValue
      confirmDisabled={!consented}
    >
      <p className="text-sm text-surface-600 dark:text-surface-400">{consequence}</p>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <input
          id={consentId}
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
        />
        {/* Learn more is a sibling of the label, never inside it: a link nested
            in a label also toggles the checkbox, recording consent never given. */}
        <label htmlFor={consentId} className="min-h-11 flex-1 min-w-0 text-sm text-surface-700 dark:text-surface-300">
          {consentLabel}
        </label>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-controls={guidanceId}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
        >
          Learn more
        </button>
      </div>
      {expanded && (
        <div id={guidanceId} className="space-y-2 text-sm text-surface-600 dark:text-surface-400">
          {learnMore}
        </div>
      )}
    </TextPromptSheet>
  )
}
