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
  localStorage.setItem(storageKey(mode), JSON.stringify(history))
}

export function useSearchHistory(mode: string) {
  const [history, setHistory] = useState<StoredHistory>(() => loadHistory(mode))

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
