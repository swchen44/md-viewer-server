import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText } from '../clipboard.js'

interface PathModalProps {
  open: boolean
  path: string | null
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export function PathModal({ open, path, onClose }: PathModalProps) {
  const { t } = useTranslation()
  const [copyState, setCopyState] = useState<CopyState>('idle')

  if (!open || path === null) return null

  async function handleCopy() {
    try {
      await copyText(path!)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const copyLabel =
    copyState === 'copied'
      ? t('pathModal.copied', 'Copied')
      : copyState === 'failed'
        ? t('pathModal.copyFailed', 'Copy failed')
        : t('pathModal.copy', 'Copy')

  return (
    <div role="dialog" aria-label={t('pathModal.ariaLabel', 'File path')}>
      <p>{path}</p>
      <button onClick={handleCopy}>{copyLabel}</button>
      <button onClick={onClose} aria-label="close">
        ×
      </button>
    </div>
  )
}
