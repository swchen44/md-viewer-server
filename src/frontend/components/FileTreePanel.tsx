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

interface FileTreePanelProps {
  roots: Root[]
  onOpenFile: (rootId: number, relPath: string) => void
}

export function FileTreePanel({ roots, onOpenFile }: FileTreePanelProps) {
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
