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

function sameTab(a: ActiveTabRef | null, b: ActiveTabRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.rootId === b.rootId && a.relPath === b.relPath
}

export function OutlinePanel({ activeTab, onJumpToHeading }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<Heading[]>([])
  const [loadError, setLoadError] = useState(false)
  // Adjust state during render (React's documented pattern for resetting state when
  // a prop changes) rather than in the effect below, so stale headings from the
  // previous tab are gone before this render commits — not merely once the new
  // fetch resolves. Doing this synchronous setState inside useEffect instead is
  // flagged by this repo's react-hooks/set-state-in-effect lint rule.
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab)
  if (!sameTab(prevActiveTab, activeTab)) {
    setPrevActiveTab(activeTab)
    setHeadings([])
    setLoadError(false)
  }

  useEffect(() => {
    if (!activeTab) return
    let cancelled = false
    apiFetch(`/api/outline?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setHeadings([])
          setLoadError(true)
          return
        }
        setHeadings(data.headings)
        setLoadError(false)
      })
      .catch(() => {
        if (!cancelled) {
          setHeadings([])
          setLoadError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  if (!activeTab) {
    return <div data-testid="outline-panel">{t('outline.noFileOpen', 'No file open')}</div>
  }

  if (loadError) {
    return (
      <div data-testid="outline-panel">{t('outline.loadError', 'Failed to load outline')}</div>
    )
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
