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

export function resolveCustomCssChoice({ customCssChoice, customCssUser1, customCssUser2 }) {
  if (customCssChoice === 'editorial') {
    return { choice: 'editorial', draft: EDITORIAL_CSS, readonly: true }
  }
  if (customCssChoice === 'developer') {
    return { choice: 'developer', draft: DEVELOPER_CSS, readonly: true }
  }
  if (customCssChoice === 'user2') {
    return { choice: 'user2', draft: customCssUser2 ?? '', readonly: false }
  }
  return { choice: 'user1', draft: customCssUser1 ?? '', readonly: false }
}
