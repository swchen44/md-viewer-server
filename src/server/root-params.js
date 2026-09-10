// Query-string values are user input. In particular, Number('') is 0 and
// Number([]) is also 0, which can accidentally select the first configured
// root when a caller omitted or malformed the root parameter.
export function parseRootId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function findRoot(roots, value) {
  const rootId = parseRootId(value)
  return rootId === null ? null : roots.find((root) => root.id === rootId) ?? null
}
