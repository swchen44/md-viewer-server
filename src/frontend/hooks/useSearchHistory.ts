import { useCallback, useState } from 'react'

interface StoredHistory {
  maxSize: number
  entries: string[]
}

const DEFAULT_MAX_SIZE = 10

function storageKey(mode: string): string {
  return `mvs-search-history:${mode}`
}

function loadHistory(mode: string): StoredHistory {
  try {
    const raw = localStorage.getItem(storageKey(mode))
    if (!raw) return { maxSize: DEFAULT_MAX_SIZE, entries: [] }
    const parsed = JSON.parse(raw)
    return {
      maxSize: typeof parsed.maxSize === 'number' && parsed.maxSize > 0 ? parsed.maxSize : DEFAULT_MAX_SIZE,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    }
  } catch {
    return { maxSize: DEFAULT_MAX_SIZE, entries: [] }
  }
}

function persist(mode: string, history: StoredHistory) {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(history))
  } catch {
    // localStorage can throw (private browsing, quota exceeded, storage disabled
    // by browser settings). Persistence is best-effort: the in-memory React state
    // update must still succeed, degrading to "history doesn't survive a reload"
    // rather than breaking the search UI.
  }
}

export function useSearchHistory(mode: string) {
  const [history, setHistory] = useState<StoredHistory>(() => loadHistory(mode))

  // `SearchBar` is rerendered in place (not remounted) when the sidebar swaps
  // between 'files' and 'outline' (same pattern as the `target`-reset handling
  // in SearchBar.tsx and `prevActiveTab` in OutlinePanel.tsx), so the `useState`
  // initializer above only runs once, at first mount, and never re-derives for
  // a new `mode`. Adjust state during render (rather than in a `useEffect`,
  // which this repo's react-hooks/set-state-in-effect lint rule flags) so the
  // old mode's in-memory entries are gone before this render commits.
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    setHistory(loadHistory(mode))
  }

  const addEntry = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      setHistory((prev) => {
        const withoutDuplicate = prev.entries.filter((e) => e !== trimmed)
        const entries = [trimmed, ...withoutDuplicate].slice(0, prev.maxSize)
        const next = { ...prev, entries }
        persist(mode, next)
        return next
      })
    },
    [mode]
  )

  const clearHistory = useCallback(() => {
    setHistory((prev) => {
      const next = { ...prev, entries: [] }
      persist(mode, next)
      return next
    })
  }, [mode])

  const setMaxSize = useCallback(
    (maxSize: number) => {
      setHistory((prev) => {
        const next = { maxSize, entries: prev.entries.slice(0, maxSize) }
        persist(mode, next)
        return next
      })
    },
    [mode]
  )

  return { entries: history.entries, maxSize: history.maxSize, addEntry, clearHistory, setMaxSize }
}
