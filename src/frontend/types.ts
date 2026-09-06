export interface Tab {
  id: string
  rootId: number
  relPath: string
  title: string
  dirty: boolean
  content: string | null
  mtimeMs: number | null
  encoding: 'utf-8' | 'unknown'
  mode: 'view' | 'edit' | 'split'
}
