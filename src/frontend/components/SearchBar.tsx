import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchHistory } from '../hooks/useSearchHistory.js'

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

  // Search history + autocomplete: entries/maxSize are `useSearchHistory`'s own
  // state (persisted to localStorage, per-mode). `suggestionsOpen` and
  // `highlightedIndex` are genuine per-render-cycle state (they must survive
  // across renders as the user navigates with the keyboard) — everything else
  // needed for rendering the suggestion list (`suggestions` below) is cheap to
  // derive fresh each render instead of being stored redundantly.
  const { entries: historyEntries, maxSize: historyMaxSize, addEntry, clearHistory, setMaxSize } =
    useSearchHistory(mode)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // SearchBar is rerendered in place (not remounted) when App.tsx swaps which
  // mode's instance is shown for a given sidebar slot, so `target`'s useState
  // initializer above only runs once and never re-derives for the new mode.
  // Adjust state during render (React's documented pattern for resetting
  // state when a prop changes, already used the same way in OutlinePanel.tsx)
  // rather than in an effect, which this repo's react-hooks/set-state-in-effect
  // lint rule flags. Without this, switching sidebar modes carries over a
  // target value that's invalid for the new mode (e.g. files' 'both'
  // surviving into outline mode, which only supports 'title').
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    setTarget(mode === 'outline' ? 'title' : 'both')
    // A mode switch swaps which mode's history the suggestion list reads from
    // (useSearchHistory(mode) above), so any highlighted index/open state from
    // the previous mode's list no longer means anything valid.
    setSuggestionsOpen(false)
    setHighlightedIndex(-1)
  }

  // `query` empty string matches every entry via String.includes, so this
  // naturally satisfies "show all history when the input is empty" without a
  // separate branch.
  const suggestions = historyEntries.filter((entry) =>
    entry.toLowerCase().includes(query.toLowerCase())
  )
  const showSuggestions = suggestionsOpen && suggestions.length > 0

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

  // Shared "commit a search now" logic used by both Enter and picking a
  // suggestion (click or keyboard): unlike the debounced live-search effect
  // above, a commit is a deliberate user action, so it bypasses the debounce
  // entirely, calls onSearch immediately, and is the only place history gets
  // recorded (recording on every debounced tick would log each intermediate
  // keystroke, which isn't what the user searched for).
  const commitSearch = (finalQuery: string) => {
    clearTimeout(timerRef.current)
    addEntry(finalQuery)
    setQuery(finalQuery)
    setSuggestionsOpen(false)
    setHighlightedIndex(-1)
    if (props.mode === 'files') {
      props.onSearch(finalQuery, { target: target as FilesSearchTarget, scope, regex })
    } else {
      props.onSearch(finalQuery, { target: target as OutlineSearchTarget, regex })
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (suggestions.length === 0) return
      setSuggestionsOpen(true)
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      setHighlightedIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
      setHighlightedIndex(-1)
      return
    }
    if (event.key === 'Tab') {
      // No suggestion to complete to: let Tab do its normal job (move focus).
      if (!showSuggestions) return
      const index = highlightedIndex >= 0 ? highlightedIndex : 0
      const completed = suggestions[index]
      if (completed === undefined) return
      // Autocomplete only: no search, no history write, menu stays open, and
      // focus stays put so the user can still press Enter to commit.
      event.preventDefault()
      setQuery(completed)
      return
    }
    if (event.key === 'Enter') {
      const finalQuery =
        highlightedIndex >= 0 && suggestions[highlightedIndex] !== undefined
          ? suggestions[highlightedIndex]
          : query
      commitSearch(finalQuery)
    }
  }

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
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlightedIndex(-1)
          setSuggestionsOpen(true)
        }}
        onFocus={() => setSuggestionsOpen(true)}
        onBlur={() => setSuggestionsOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showSuggestions && (
        <ul role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={index === highlightedIndex}
              // A suggestion click's own onClick would otherwise be preempted
              // by the input's onBlur firing first (blur happens before
              // click); preventDefault on mousedown stops the input from
              // ever losing focus, so onClick (below) still fires normally.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitSearch(suggestion)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={clearHistory}
          disabled={historyEntries.length === 0}
        >
          {t('search.clearHistory', 'Clear history')}
        </button>
        <input
          type="number"
          min={1}
          max={100}
          value={historyMaxSize}
          onChange={(e) => setMaxSize(Number(e.target.value))}
          aria-label={t('search.historyMaxSizeLabel', 'History size')}
        />
      </div>
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
