import fs from 'node:fs'

export function readInotifyLimit() {
  try {
    const raw = fs.readFileSync('/proc/sys/fs/inotify/max_user_watches', 'utf-8')
    return Number(raw.trim())
  } catch {
    return null
  }
}
