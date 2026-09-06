import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from './MermaidBlock.js'

interface MarkdownViewProps {
  content: string
}

export function MarkdownView({ content }: MarkdownViewProps) {
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
