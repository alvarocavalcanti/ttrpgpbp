// Copy text to the clipboard. Prefers the async Clipboard API in secure
// contexts; if it's unavailable, or the write rejects (a transient focus/
// permission failure the browser occasionally reports), fall back to a
// hidden-textarea execCommand('copy'). Throws only when every path fails so
// callers surface a single failure path.
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to the execCommand fallback
    }
  }
  const textArea = document.createElement('textarea')
  try {
    textArea.value = text
    textArea.style.position = 'absolute'
    textArea.style.left = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    // ponytail: legacy fallback for non-secure contexts, navigator.clipboard covers all modern browsers
    if (!document.execCommand('copy')) {
      throw new Error('execCommand returned false')
    }
  } finally {
    if (textArea.isConnected) {
      document.body.removeChild(textArea)
    }
  }
}
