import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type FilesSearchTarget = 'name' | 'content' | 'both'
export type FilesSearchScope = 'all' | 'open'
export type OutlineSearchTarget = 'title' | 'content' | 'both'

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
  const [target, setTarget] = useState<FilesSearchTarget | OutlineSearchTarget>('both')
  const [scope, setScope] = useState<FilesSearchScope>('all')
  const [regex, setRegex] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (props.mode === 'files') {
        props.onSearch(query, { target: target as FilesSearchTarget, scope, regex })
      } else {
        props.onSearch(query, { target: target as OutlineSearchTarget, regex })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target, scope, regex, props.mode])

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
        <button aria-pressed={target === 'content'} onClick={() => setTarget('content')}>
          {t('search.targetContent', 'Content')}
        </button>
        <button aria-pressed={target === 'both'} onClick={() => setTarget('both')}>
          {t('search.targetBoth', 'Both')}
        </button>
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
