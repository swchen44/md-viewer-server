import { useTranslation } from 'react-i18next'

interface ConflictDialogProps {
  currentContent: string
  onKeepMine: () => void
  onDiscardMine: () => void
}

export function ConflictDialog({ currentContent, onKeepMine, onDiscardMine }: ConflictDialogProps) {
  const { t } = useTranslation()

  return (
    <div role="dialog" aria-label={t('conflictDialog.ariaLabel', 'File conflict')}>
      <p>{t('conflictDialog.message', 'This file was modified externally while you were editing it.')}</p>
      <pre style={{ maxHeight: 200, overflow: 'auto' }}>{currentContent}</pre>
      <button onClick={onKeepMine}>{t('conflictDialog.keepMine', 'Keep mine and overwrite')}</button>
      <button onClick={onDiscardMine}>{t('conflictDialog.discardMine', 'Discard mine, reload latest')}</button>
    </div>
  )
}
