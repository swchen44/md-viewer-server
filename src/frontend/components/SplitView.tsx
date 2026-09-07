import { MarkdownEditor } from './MarkdownEditor.js'
import { MarkdownView } from './MarkdownView.js'

interface SplitViewProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  blockRemoteContent: boolean
}

export function SplitView({ value, onChange, onSave, blockRemoteContent }: SplitViewProps) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, borderRight: '1px solid #ccc' }}>
        <MarkdownEditor value={value} onChange={onChange} onSave={onSave} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MarkdownView content={value} blockRemoteContent={blockRemoteContent} />
      </div>
    </div>
  )
}
