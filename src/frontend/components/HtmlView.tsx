interface HtmlViewProps {
  content: string
  allowScripts: boolean
}

export function HtmlView({ content, allowScripts }: HtmlViewProps) {
  return (
    <iframe
      title="html-preview"
      srcDoc={content}
      sandbox={allowScripts ? 'allow-scripts' : ''}
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  )
}
