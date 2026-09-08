export function parseArgs(argv) {
  const [command, ...rest] = argv
  const roots = []
  const positionals = []
  let port
  let debug = false
  let rotateToken = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--root') {
      roots.push(rest[++i])
    } else if (arg === '--port') {
      port = Number(rest[++i])
    } else if (arg === '--debug') {
      debug = true
    } else if (arg === '--rotate-token') {
      rotateToken = true
    } else {
      // Non-flag argument, e.g. <path> in `add-root <path>`.
      positionals.push(arg)
    }
  }

  return { command, roots, port, debug, rotateToken, positionals }
}

export function resolveRoots(roots, cwd) {
  return roots.length > 0 ? roots : [cwd]
}
