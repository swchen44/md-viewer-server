// Pure regex-matching logic shared by outline-regex-worker.ts (the real
// Worker entry point, run in a separate thread in the browser) and by the
// frontend test suite's fake Worker (tests/frontend/setup.ts — jsdom doesn't
// implement the Worker API, so tests substitute a same-thread stand-in that
// calls this same function instead of duplicating its logic).
export type OutlineRegexMatchResult =
  | { ok: true; matchedIndexes: number[] }
  | { ok: false; error: string }

export function matchOutlineHeadings(pattern: string, texts: string[]): OutlineRegexMatchResult {
  try {
    const re = new RegExp(pattern, 'i')
    const matchedIndexes: number[] = []
    for (let i = 0; i < texts.length; i++) {
      if (re.test(texts[i])) matchedIndexes.push(i)
    }
    return { ok: true, matchedIndexes }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
