interface ConflictDialogProps {
  currentContent: string
  onKeepMine: () => void
  onDiscardMine: () => void
}

export function ConflictDialog({ currentContent, onKeepMine, onDiscardMine }: ConflictDialogProps) {
  return (
    <div role="dialog" aria-label="File conflict">
      <p>This file was modified externally while you were editing it.</p>
      <pre style={{ maxHeight: 200, overflow: 'auto' }}>{currentContent}</pre>
      <button onClick={onKeepMine}>Keep mine and overwrite</button>
      <button onClick={onDiscardMine}>Discard mine, reload latest</button>
    </div>
  )
}
