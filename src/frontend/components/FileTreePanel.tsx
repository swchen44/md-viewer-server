import { useEffect, useState } from 'react'
import { apiFetch } from '../api-client.js'

interface FileEntry {
  relPath: string
  size: number
  mtimeMs: number
}

interface Root {
  id: number
  name: string
}

interface FileMatch extends FileEntry {
  rootId: number
}

interface ContentMatchLine {
  line: number
  text: string
}

interface ContentMatch {
  relPath: string
  rootId: number
  matches?: ContentMatchLine[]
  skipped?: boolean
}

export interface FileSearchResults {
  fileMatches: FileMatch[]
  contentMatches: ContentMatch[]
}

interface FileTreePanelProps {
  roots: Root[]
  onOpenFile: (rootId: number, relPath: string) => void
  searchResults?: FileSearchResults | null
}

export function FileTreePanel({ roots, onOpenFile, searchResults }: FileTreePanelProps) {
  const [filesByRoot, setFilesByRoot] = useState<Record<number, FileEntry[]>>({})

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const entries = await Promise.all(
        roots.map(async (root) => {
          const res = await apiFetch(`/api/files?root=${root.id}`)
          const data = await res.json()
          return [root.id, data.files as FileEntry[]] as const
        })
      )
      if (!cancelled) {
        setFilesByRoot(Object.fromEntries(entries))
      }
    }
    loadAll()
    return () => {
      cancelled = true
    }
  }, [roots])

  if (searchResults) {
    return (
      <div data-testid="file-tree-panel">
        <div data-testid="search-results">
          {searchResults.fileMatches.map((file) => (
            <div
              key={`name:${file.rootId}:${file.relPath}`}
              onClick={() => onOpenFile(file.rootId, file.relPath)}
              style={{ cursor: 'pointer' }}
            >
              {file.relPath}
            </div>
          ))}
          {searchResults.contentMatches.map((match) => (
            <div key={`content:${match.rootId}:${match.relPath}`}>
              <div
                onClick={() => onOpenFile(match.rootId, match.relPath)}
                style={{ cursor: 'pointer', fontWeight: 'bold' }}
              >
                {match.relPath}
              </div>
              {(match.matches ?? []).map((line) => (
                <div
                  key={line.line}
                  onClick={() => onOpenFile(match.rootId, match.relPath)}
                  style={{ cursor: 'pointer', paddingLeft: 12 }}
                >
                  {line.line}: {line.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="file-tree-panel">
      {roots.map((root) => (
        <div key={root.id}>
          {roots.length > 1 && <div style={{ fontWeight: 'bold' }}>{root.name}</div>}
          {(filesByRoot[root.id] ?? []).map((file) => (
            <div
              key={file.relPath}
              onClick={() => onOpenFile(root.id, file.relPath)}
              style={{ cursor: 'pointer' }}
            >
              {file.relPath}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
