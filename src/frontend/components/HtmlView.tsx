interface HtmlViewProps {
  content: string
  allowScripts: boolean
  blockRemoteContent: boolean
}

// Blocks the iframe document from pulling any subresource off the network:
// images/media may only come from this origin (or be inlined as data:), and
// nested frames and script-initiated requests (fetch/XHR/WebSocket) are denied
// outright. A CSP meta tag is the only lever available here — srcDoc content
// arrives with no response headers of its own — and the browser enforces it,
// so it holds regardless of what the document's own markup or scripts try.
//
// Note the deliberate over-strictness: this iframe is sandboxed without
// allow-same-origin, so its document has an opaque origin and 'self' matches
// nothing — while the setting is on, an .html preview loses same-origin
// subresources too, not just remote ones. That is the safe direction to err in
// for a privacy control, and it only applies while the user has asked for
// remote content to be blocked.
const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="img-src \'self\' data:; media-src \'self\'; frame-src \'none\'; connect-src \'self\'">'

/**
 * Puts the CSP meta as early in the document as possible: a meta-tag policy
 * only governs what comes after it, so it has to precede any element that
 * could start a fetch. Right after <head> when there is one, otherwise right
 * after <html>, otherwise in front of the whole fragment (a bare fragment is
 * what most local .html files hand us anyway).
 */
function withContentSecurityPolicy(html: string): string {
  const headMatch = /<head\b[^>]*>/i.exec(html)
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length
    return html.slice(0, at) + CSP_META + html.slice(at)
  }
  const htmlMatch = /<html\b[^>]*>/i.exec(html)
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length
    return `${html.slice(0, at)}<head>${CSP_META}</head>${html.slice(at)}`
  }
  return CSP_META + html
}

export function HtmlView({ content, allowScripts, blockRemoteContent }: HtmlViewProps) {
  const srcDoc = blockRemoteContent ? withContentSecurityPolicy(content) : content
  return (
    <iframe
      title="html-preview"
      srcDoc={srcDoc}
      sandbox={allowScripts ? 'allow-scripts' : ''}
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  )
}
