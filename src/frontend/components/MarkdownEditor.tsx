import type { KeyboardEvent } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export function MarkdownEditor({ value, onChange, onSave }: MarkdownEditorProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
    if (isSaveShortcut) {
      e.preventDefault()
      onSave()
    }
  }

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      style={{ width: '100%', height: '100%', border: 'none', resize: 'none', fontFamily: 'monospace' }}
    />
  )
}
