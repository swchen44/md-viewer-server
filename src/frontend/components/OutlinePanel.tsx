import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api-client.js'

interface Heading {
  level: number
  text: string
  line: number
}

interface ActiveTabRef {
  rootId: number
  relPath: string
}

interface OutlinePanelProps {
  activeTab: ActiveTabRef | null
  onJumpToHeading: (line: number) => void
}

export function OutlinePanel({ activeTab, onJumpToHeading }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<Heading[]>([])

  useEffect(() => {
    if (!activeTab) return
    let cancelled = false
    apiFetch(`/api/outline?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHeadings(data.headings)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  if (!activeTab) {
    return <div data-testid="outline-panel">{t('outline.noFileOpen', 'No file open')}</div>
  }

  return (
    <div data-testid="outline-panel">
      {headings.map((h) => (
        <div
          key={h.line}
          onClick={() => onJumpToHeading(h.line)}
          style={{ paddingLeft: (h.level - 1) * 12, cursor: 'pointer' }}
        >
          {h.text}
        </div>
      ))}
    </div>
  )
}
