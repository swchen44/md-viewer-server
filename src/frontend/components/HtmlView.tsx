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
 * could start a fetch.
 *
 * Deliberately NOT implemented as "find <head> or <html> and insert after
 * it" — that used a regex scanning the whole (attacker-authored) document
 * text, and a `<head>`-looking string sitting inside a comment, a <script>
 * string literal, or an attribute value would match before the real tag,
 * landing the policy somewhere the browser never parses it (e.g. inside a
 * comment), silently disabling it while blockRemoteContent is on.
 *
 * Only a leading doctype is recognized and skipped (anchored to the very
 * start, so nothing later in the document can be mistaken for it) so
 * standards mode is preserved; the meta is prepended right after it, or at
 * the very start otherwise. The HTML parser's "before html"/"before head"
 * insertion modes synthesize <html><head> around a leading <meta> and place
 * it first in <head> regardless of whether the rest of the document already
 * declares one, so this doesn't require finding — or being foolable by — any
 * tag search.
 */
function withContentSecurityPolicy(html: string): string {
  const doctypeMatch = /^\s*<!doctype[^>]*>/i.exec(html)
  const at = doctypeMatch ? doctypeMatch[0].length : 0
  return html.slice(0, at) + CSP_META + html.slice(at)
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
