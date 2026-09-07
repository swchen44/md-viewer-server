// Kept in sync with src/server/custom-css-presets.js's EDITORIAL_CSS/DEVELOPER_CSS
// by hand — frontend and backend are separate bundles with no shared-module
// mechanism, so duplicating these two string constants is the simplest option.
// The two copies are locked together by tests/unit/server/custom-css-presets.test.js,
// which reads THIS file as source text (the node-environment unit suite cannot
// import a frontend .ts module), extracts the two backtick literals below, and
// asserts they equal the backend's constants — so editing one copy without the
// other fails that test instead of silently diverging. Keep both constants as
// plain backtick literals with no `${}` interpolation, which is what makes that
// text extraction exact.
export const EDITORIAL_CSS = `.markdown-body {
  background: #f5f1e8;
  font-family: Georgia, 'Times New Roman', serif;
}
.markdown-body h1, .markdown-body h2 {
  font-family: Georgia, serif;
  font-size: 2.2em;
}`

export const DEVELOPER_CSS = `.markdown-body {
  background: #1e1e1e;
  color: #d4d4d4;
}
.markdown-body pre, .markdown-body code {
  background: #0d0d0d;
  color: #9cdcfe;
  font-family: 'Fira Code', monospace;
}`

export interface EffectiveCustomCssSettings {
  customCssChoice: 'editorial' | 'developer' | 'user1' | 'user2'
  customCssUser1: string
  customCssUser2: string
}

// Shared by App.tsx (to compute the CSS actually injected into the page) and
// available for CustomCssTab to reuse if it ever needs the same resolution —
// kept here alongside the constants per the task brief rather than duplicated
// inline in App.tsx.
export function resolveEffectiveCustomCss(settings: EffectiveCustomCssSettings | null): string {
  if (!settings) return ''
  if (settings.customCssChoice === 'editorial') return EDITORIAL_CSS
  if (settings.customCssChoice === 'developer') return DEVELOPER_CSS
  if (settings.customCssChoice === 'user2') return settings.customCssUser2
  return settings.customCssUser1
}
