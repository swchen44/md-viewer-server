import os from 'node:os'
import path from 'node:path'

const APP_DIR_NAME = 'md-viewer-server'

export function getConfigDir(env = process.env, homedir = os.homedir()) {
  const base = env.XDG_CONFIG_HOME || path.join(homedir, '.config')
  return path.join(base, APP_DIR_NAME)
}

export function getStateDir(env = process.env, homedir = os.homedir()) {
  const base = env.XDG_STATE_HOME || path.join(homedir, '.local', 'state')
  return path.join(base, APP_DIR_NAME)
}
