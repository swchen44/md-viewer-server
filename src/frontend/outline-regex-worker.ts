// Runs inside a dedicated Worker thread — see outline-regex-client.ts for why
// this exists. This file's own code is trusted (checked in, not user input);
// only `pattern` (from `event.data`) is untrusted, and it's just passed to
// `new RegExp`/`.test`, exactly like the plain-text case would be if it were
// unsafe — the safety property comes entirely from running this on a
// separate thread the caller can kill, not from anything in this file.
//
// Typed loosely (`self` cast through `unknown`) rather than adding the
// "webworker" lib to tsconfig: this project's tsconfig.json already sets
// `lib: ["ES2022", "DOM", "DOM.Iterable"]` for src/frontend, and TypeScript
// doesn't support mixing the "DOM" and "webworker" lib globals in one
// program. A local cast avoids a second tsconfig just for this one file.
import { matchOutlineHeadings, type OutlineRegexMatchResult } from './outline-regex-match.js'

interface OutlineRegexRequest {
  pattern: string
  texts: string[]
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<OutlineRegexRequest>) => void) | null
  postMessage: (message: OutlineRegexMatchResult) => void
}

ctx.onmessage = (event) => {
  const { pattern, texts } = event.data
  ctx.postMessage(matchOutlineHeadings(pattern, texts))
}
