import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from './MermaidBlock.js'

interface MarkdownViewProps {
  content: string
  blockRemoteContent: boolean
}

/**
 * True for a URL the browser would fetch from somewhere other than this
 * daemon: an absolute URL with a scheme (https://tracker.example/pixel.png) or
 * a protocol-relative one (//tracker.example/pixel.png).
 *
 * Everything relative — `./img.png`, `img.png`, `/api/asset?...` — resolves
 * against this app's own origin and is therefore local content the user
 * already trusted by opening the document, so it stays untouched even while
 * remote content is blocked. `data:` URIs carry their bytes inline and cause
 * no request at all; react-markdown's default urlTransform strips them before
 * this ever sees them, so they are not this function's concern either.
 */
export function isRemoteContentUrl(src: string | undefined | null): boolean {
  if (!src) return false
  if (src.startsWith('//')) return true
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(src)?.[0]?.toLowerCase()
  if (!scheme) return false
  return scheme !== 'data:'
}

export function MarkdownView({ content, blockRemoteContent }: MarkdownViewProps) {
  return (
    <div data-testid="markdown-view" className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props
            const isMermaid = /language-mermaid/.test(className ?? '')
            if (isMermaid) {
              return <MermaidBlock definition={String(children).trim()} />
            }
            return <code className={className}>{children}</code>
          },
          // Privacy mode's blockRemoteContent (settings.effective.*, enforced
          // server-side) means a document must not be able to phone home just
          // by being viewed: a remote <img> is a tracking pixel that leaks the
          // reader's IP, user-agent and viewing time to whoever wrote the
          // markdown. Blocking happens by never emitting the element with a
          // remote src — the browser then has nothing to fetch — rather than
          // by trying to intercept the request afterwards.
          //
          // Links are deliberately left alone: an <a href> is a fetch only if
          // the reader chooses to click it.
          img(props) {
            const { src, alt, title } = props
            if (blockRemoteContent && isRemoteContentUrl(src)) {
              // The alt text stands in for the image so the document still
              // reads sensibly. The blocked URL is exposed as a data-
              // attribute, not a src, so it is inspectable but never fetched.
              return (
                <span
                  data-testid="blocked-remote-content"
                  className="blocked-remote-content"
                  data-blocked-src={src}
                >
                  {alt}
                </span>
              )
            }
            return <img src={src} alt={alt} title={title} />
          },
          // Reachable only if raw-HTML rendering is ever enabled (there is no
          // rehype-raw today, so markdown's own syntax cannot produce these).
          // Handled anyway so turning raw HTML on later can't silently reopen
          // the hole this setting exists to close.
          video(props) {
            if (blockRemoteContent && isRemoteContentUrl(props.src)) {
              return <span data-testid="blocked-remote-content" data-blocked-src={props.src} />
            }
            return <video {...props} />
          },
          source(props) {
            if (blockRemoteContent && isRemoteContentUrl(props.src)) return null
            return <source {...props} />
          },
          iframe(props) {
            if (blockRemoteContent && isRemoteContentUrl(props.src)) {
              return <span data-testid="blocked-remote-content" data-blocked-src={props.src} />
            }
            return <iframe {...props} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
