import os from 'node:os'

export async function checkHealth(port, { timeoutMs = 1000 } = {}) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const body = await res.json()
    if (body.service !== 'md-viewer-server') return null
    return body
  } catch {
    return null
  }
}

export function listCandidateIPs() {
  const interfaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address)
      }
    }
  }
  return candidates
}
