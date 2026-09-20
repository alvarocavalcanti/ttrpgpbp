// Copy text to the clipboard. navigator.clipboard in secure contexts; a
// hidden-textarea execCommand('copy') fallback on legacy/insecure origins
// where the async Clipboard API is unavailable. Throws when the copy could
// not be performed so callers surface a single failure path.
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
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
