import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type FilesSearchTarget = 'name' | 'content' | 'both'
export type FilesSearchScope = 'all' | 'open'
// A heading object only carries {level, text, line} — no document body text is
// available client-side to match against — so outline search can only ever
// honestly support a title match. 'content'/'both' are intentionally not
// offered (see the target-button rendering below): showing them would present
// non-functional UI, since outline mode's OutlinePanel has no content to
// filter against without adding a new API call per keystroke.
export type OutlineSearchTarget = 'title'

export interface FilesSearchOptions {
  target: FilesSearchTarget
  scope: FilesSearchScope
  regex: boolean
}

export interface OutlineSearchOptions {
  target: OutlineSearchTarget
  regex: boolean
}

export type SearchOptions = FilesSearchOptions | OutlineSearchOptions

// A discriminated union (rather than one `onSearch: (q, options: SearchOptions) => void`
// prop) so callers get a precisely-typed handler per mode instead of having to accept
// the full FilesSearchOptions | OutlineSearchOptions union and narrow it themselves.
interface FilesSearchBarProps {
  mode: 'files'
  onSearch: (query: string, options: FilesSearchOptions) => void
}

interface OutlineSearchBarProps {
  mode: 'outline'
  onSearch: (query: string, options: OutlineSearchOptions) => void
}

type SearchBarProps = FilesSearchBarProps | OutlineSearchBarProps

const DEBOUNCE_MS = 300

export function SearchBar(props: SearchBarProps) {
  const { mode } = props
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<FilesSearchTarget | OutlineSearchTarget>(
    mode === 'outline' ? 'title' : 'both'
  )
  const [scope, setScope] = useState<FilesSearchScope>('all')
  const [regex, setRegex] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Always holds the latest props (in particular `onSearch`), updated on every
  // render. The debounce timer's callback reads through this ref instead of
  // closing over `props` directly, so if `onSearch` closes over other state
  // that resolves after the user starts typing (e.g. App's `roots`, fetched
  // from GET /api/roots), the debounce still invokes the current callback
  // when it fires rather than a stale one captured back when the timer was
  // scheduled.
  const latestPropsRef = useRef(props)
  useEffect(() => {
    latestPropsRef.current = props
  })

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const current = latestPropsRef.current
      if (current.mode === 'files') {
        current.onSearch(query, { target: target as FilesSearchTarget, scope, regex })
      } else {
        current.onSearch(query, { target: target as OutlineSearchTarget, regex })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [query, target, scope, regex])

  // 'name' (files mode) and 'title' (outline mode) are the same UI slot but a
  // different semantic target value + label — a heading has no filename, so
  // outline mode's first target button must read "Title", not "Name".
  const nameOrTitleTarget: FilesSearchTarget | OutlineSearchTarget = mode === 'files' ? 'name' : 'title'
  const nameOrTitleLabel =
    mode === 'files' ? t('search.targetName', 'Name') : t('search.targetTitle', 'Title')

  return (
    <div data-testid="search-bar">
      <input
        placeholder={t('search.placeholder', 'Search...')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div>
        <button
          aria-pressed={target === nameOrTitleTarget}
          onClick={() => setTarget(nameOrTitleTarget)}
        >
          {nameOrTitleLabel}
        </button>
        {mode === 'files' && (
          <>
            <button aria-pressed={target === 'content'} onClick={() => setTarget('content')}>
              {t('search.targetContent', 'Content')}
            </button>
            <button aria-pressed={target === 'both'} onClick={() => setTarget('both')}>
              {t('search.targetBoth', 'Both')}
            </button>
          </>
        )}
      </div>
      {mode === 'files' && (
        <div>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            {t('search.scopeAll', 'All files')}
          </button>
          <button aria-pressed={scope === 'open'} onClick={() => setScope('open')}>
            {t('search.scopeOpen', 'Open tabs')}
          </button>
        </div>
      )}
      <button aria-pressed={regex} aria-label="regex" onClick={() => setRegex((r) => !r)}>
        .*
      </button>
    </div>
  )
}
