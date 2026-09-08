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
  // Set when the tab's underlying file was deleted on disk while it was open
  // (the daemon's `file-removed` event — see App.tsx). Editing a file that no
  // longer exists would only produce a save that recreates it from possibly
  // stale content, so the tab drops to the same "view only" posture already
  // used for non-UTF-8 files: Edit/Split hidden, mode forced to view. Cleared
  // again if the file reappears (see App.tsx's handleFileAdded — an atomic
  // rewrite shows up as remove + add).
  readOnly?: boolean
}
