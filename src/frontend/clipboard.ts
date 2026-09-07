// This app is designed to be reached over plain http://<lan-ip>:<port>/ (see
// the design spec's LAN-only deployment model), not https — most browsers
// only expose navigator.clipboard on a "secure context" (https, or
// localhost), so the modern Clipboard API can be entirely absent for a
// real user on a real LAN link. Fall back to the older execCommand-based
// copy trick (deprecated, but still the only thing that works there).
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to the legacy fallback below
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
  if (!ok) throw new Error('Copy failed: no working clipboard mechanism available')
}
