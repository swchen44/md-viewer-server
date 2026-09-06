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

export interface HeadingFilter {
  query: string
  regex: boolean
}

interface OutlinePanelProps {
  activeTab: ActiveTabRef | null
  onJumpToHeading: (line: number) => void
  headingFilter?: HeadingFilter | null
}

function sameTab(a: ActiveTabRef | null, b: ActiveTabRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.rootId === b.rootId && a.relPath === b.relPath
}

// Outline search never calls an API: the headings for the active tab are already
// loaded in memory (fetched once per tab above), so filtering is purely client-side.
function applyHeadingFilter(headings: Heading[], filter: HeadingFilter | null | undefined): Heading[] {
  if (!filter || !filter.query) return headings

  if (filter.regex) {
    let pattern: RegExp
    try {
      pattern = new RegExp(filter.query, 'i')
    } catch {
      // An invalid pattern from a still-mid-typing query shouldn't crash the
      // panel — show no matches instead, mirroring how the backend's regex
      // search treats invalid patterns as "no valid search" rather than an error.
      return []
    }
    return headings.filter((h) => pattern.test(h.text))
  }

  const needle = filter.query.toLowerCase()
  return headings.filter((h) => h.text.toLowerCase().includes(needle))
}

export function OutlinePanel({ activeTab, onJumpToHeading, headingFilter }: OutlinePanelProps) {
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

  const visibleHeadings = applyHeadingFilter(headings, headingFilter)

  return (
    <div data-testid="outline-panel">
      {visibleHeadings.map((h) => (
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
