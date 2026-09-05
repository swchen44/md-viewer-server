import { getConfigDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth, listCandidateIPs } from '../daemon-utils.js'

export async function runStatus() {
  const config = readConfig(getConfigDir())
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running', port: config.port }
  }

  return {
    outcome: 'running',
    port: config.port,
    token: config.token,
    uptime: health.uptime,
    roots: health.roots,
    ips: listCandidateIPs(),
  }
}
