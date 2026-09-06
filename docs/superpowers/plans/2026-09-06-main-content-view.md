# 主內容區 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立分頁的主內容區：markdown/html/mermaid/plantuml 渲染、檢視/編輯/Split 三模式切換、存檔與 409 衝突對話框、草稿持久化、`Ctrl+S` 快捷鍵。這是使用者真正閱讀與編輯文件的地方，建立在「前端骨架」子計畫（Tab 狀態、側邊欄開檔）之上。

**Architecture:** 每個分頁的內容元件（`TabContent`）依 `activeTab` 決定要渲染檢視/編輯/Split 中的哪一種；三者共用同一份「已讀取的檔案內容」狀態（由 `TabContent` 的父層 `App.tsx` 持有並向下傳遞，取代 Plan 5 目前 `Tab` 型別裡只有 metadata、沒有內容快取的簡化版本）。Markdown 渲染用 `react-markdown` + `remark-gfm`；HTML 一律走 sandboxed `<iframe>`；Mermaid 用官方 `mermaid` 套件在前端動態渲染；PlantUML 呼叫 Plan 4 的 `POST /api/plantuml-proxy`。

**Tech Stack:** 沿用 Plan 5 的 React + TypeScript + Vitest；新增 `react-markdown`、`remark-gfm`、`mermaid`。不引入 Shiki/CodeMirror 等重量級編輯器套件——編輯模式先用原生 `<textarea>`（YAGNI，若之後證明體驗不足再升級）。

## Global Constraints

- `.html` 檔案一律用 `<iframe sandbox="allow-scripts">`（不給 `allow-same-origin`）顯示；設定選單的「允許 html 執行 script」開關預設關閉時，`sandbox` 屬性完全不給 `allow-scripts`（純靜態顯示），開啟時才加上 `allow-scripts`（因為沒有 `allow-same-origin`，即使允許執行 script 也讀不到 `sessionStorage` 裡的 token）—— 這個開關本身屬於「設定選單」子計畫，本計畫先假設一個寫死的 `false` 常數，等設定選單子計畫接上真正的設定值
- 非 UTF-8 檔案（`GET /api/file` 回傳 `encoding: 'unknown'`）強制唯讀，不顯示編輯/Split 按鈕
- 存檔用 `PUT /api/file`，帶入讀取當下的 `mtimeMs`；409 時彈對話框讓使用者選「保留我的並覆蓋」（`force=true` 重送）或「捨棄我的，重新載入最新版」
- 編輯中內容定期（例如每 5 秒或每次變更後 debounce）存進 `localStorage`，key 格式 `mvs-draft:<rootId>:<relPath>`，成功存檔後清除對應 draft
- `Ctrl+S`：編輯/Split 模式下觸發存檔，需 `event.preventDefault()` 避免瀏覽器原生存檔對話框
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，訊息含 Why/What/How；UI 段落比照 Plan 5 的做法，在 commit message 標註 `[UI CHECKPOINT]`

---

## File Structure

```
src/frontend/
├── types.ts                              ← 共用型別（Tab 擴充定義移到這裡，避免循環 import）
├── hooks/
│   └── useDraft.ts                          ← localStorage 草稿存取 hook
├── components/
│   ├── TabContent.tsx                         ← 依模式分派 View/Edit/Split
│   ├── MarkdownView.tsx                        ← 唯讀 markdown 渲染
│   ├── HtmlView.tsx                             ← sandboxed iframe
│   ├── MermaidBlock.tsx                          ← 單一 mermaid 圖表渲染
│   ├── MarkdownEditor.tsx                         ← 純文字編輯（textarea）
│   ├── SplitView.tsx                               ← 左右分割（複用 MarkdownEditor + MarkdownView）
│   └── ConflictDialog.tsx                           ← 409 衝突對話框

tests/frontend/
├── useDraft.test.ts
├── TabContent.test.tsx
├── MarkdownView.test.tsx
├── HtmlView.test.tsx
├── MarkdownEditor.test.tsx
├── SplitView.test.tsx
└── ConflictDialog.test.tsx
```

---

### Task 1: 共用型別 + 草稿持久化 hook

**Files:**
- Create: `src/frontend/types.ts`
- Create: `src/frontend/hooks/useDraft.ts`
- Test: `tests/frontend/useDraft.test.ts`

**Interfaces:**
- Produces:
  - `types.ts` exports `Tab` (extended: `{id, rootId, relPath, title, dirty, content: string | null, mtimeMs: number | null, encoding: 'utf-8' | 'unknown', mode: 'view' | 'edit' | 'split'}`)
  - `useDraft(rootId: number, relPath: string)`: `{draft: string | null, saveDraft: (content: string) => void, clearDraft: () => void}` — React hook wrapping `localStorage` access for the `mvs-draft:<rootId>:<relPath>` key

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/useDraft.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraft } from '../../src/frontend/hooks/useDraft.js'

describe('useDraft', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when no draft is stored', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    expect(result.current.draft).toBeNull()
  })

  it('saveDraft persists content and updates the returned draft', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    act(() => result.current.saveDraft('hello'))
    expect(result.current.draft).toBe('hello')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('hello')
  })

  it('clearDraft removes the stored draft', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    act(() => result.current.saveDraft('hello'))
    act(() => result.current.clearDraft())
    expect(result.current.draft).toBeNull()
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
  })

  it('keys drafts independently per rootId+relPath', () => {
    const { result: a } = renderHook(() => useDraft(0, 'a.md'))
    const { result: b } = renderHook(() => useDraft(1, 'a.md'))
    act(() => a.current.saveDraft('from root 0'))
    expect(b.current.draft).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- useDraft.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/types.ts`:

```ts
export interface Tab {
  id: string
  rootId: number
  relPath: string
  title: string
  dirty: boolean
  content: string | null
  mtimeMs: number | null
  encoding: 'utf-8' | 'unknown'
  mode: 'view' | 'edit' | 'split'
}
```

`src/frontend/hooks/useDraft.ts`:

```ts
import { useCallback, useState } from 'react'

function draftKey(rootId: number, relPath: string): string {
  return `mvs-draft:${rootId}:${relPath}`
}

export function useDraft(rootId: number, relPath: string) {
  const key = draftKey(rootId, relPath)
  const [draft, setDraft] = useState<string | null>(() => localStorage.getItem(key))

  const saveDraft = useCallback(
    (content: string) => {
      localStorage.setItem(key, content)
      setDraft(content)
    },
    [key]
  )

  const clearDraft = useCallback(() => {
    localStorage.removeItem(key)
    setDraft(null)
  }, [key])

  return { draft, saveDraft, clearDraft }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- useDraft.test.ts`
Expected: PASS（4 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/frontend/types.ts src/frontend/hooks/useDraft.ts tests/frontend/useDraft.test.ts
git commit -m "$(cat <<'EOF'
Add shared Tab type and draft-persistence hook

Why: Plan 5's Tab type only tracked metadata (id/rootId/relPath/
title/dirty) with no content cache — the main content view needs
each tab to also carry its loaded file content, mtime (for conflict
detection), encoding (to gate edit availability), and view mode.
Draft persistence (per the design spec) needs a per-tab localStorage
slot so an editing session survives a browser crash or accidental tab
close.
What: types.ts centralizes the extended Tab interface so later
components import from one place instead of redefining it. useDraft
wraps localStorage access keyed by rootId+relPath, independent across
different files.
How: Plain localStorage (not IndexedDB) since draft content is
markdown/html text, well within localStorage's size limits for this
use case, and synchronous access simplifies the save-on-every-
keystroke-ish pattern later tasks will use.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: Markdown 唯讀渲染

**Files:**
- Create: `src/frontend/components/MarkdownView.tsx`
- Test: `tests/frontend/MarkdownView.test.tsx`

**Interfaces:**
- Produces: `<MarkdownView content={string} />` — renders GFM markdown (tables, task lists, strikethrough) as read-only HTML; mermaid code fences render via `<MermaidBlock>` (Task 3) instead of a plain code block

- [ ] **Step 1: 安裝依賴**

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 2: 寫失敗測試**

`tests/frontend/MarkdownView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownView } from '../../src/frontend/components/MarkdownView.js'

describe('MarkdownView', () => {
  it('renders a heading', () => {
    render(<MarkdownView content="# Hello" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
  })

  it('renders a GFM table', () => {
    render(<MarkdownView content={'| A | B |\n|---|---|\n| 1 | 2 |'} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders a GFM task list', () => {
    render(<MarkdownView content={'- [x] done\n- [ ] pending'} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('renders a mermaid code fence as a mermaid block, not a plain code block', () => {
    render(<MarkdownView content={'```mermaid\ngraph TD; A-->B;\n```'} />)
    expect(screen.getByTestId('mermaid-block')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- MarkdownView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: 實作**

`src/frontend/components/MarkdownView.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from './MermaidBlock.js'

interface MarkdownViewProps {
  content: string
}

export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div data-testid="markdown-view" className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props
            const isMermaid = /language-mermaid/.test(className ?? '')
            if (isMermaid) {
              return <MermaidBlock definition={String(children).trim()} />
            }
            return <code className={className}>{children}</code>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend -- MarkdownView.test.tsx`
Expected: PASS（4 個測試，此時 `MermaidBlock` 還不存在，先建立一個最小 stub 讓測試能編譯）

在 Task 3 完成前，先建立一個佔位的 `src/frontend/components/MermaidBlock.tsx`：

```tsx
interface MermaidBlockProps {
  definition: string
}

export function MermaidBlock({ definition: _definition }: MermaidBlockProps) {
  return <div data-testid="mermaid-block" />
}
```

（Task 3 會把這個 stub 換成真正的渲染邏輯，介面 `{definition: string}` 保持不變，不影響這裡已經通過的測試。）

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/frontend/components/MarkdownView.tsx src/frontend/components/MermaidBlock.tsx tests/frontend/MarkdownView.test.tsx
git commit -m "$(cat <<'EOF'
Add read-only Markdown rendering with GFM support

Why: This is the default "view mode" rendering for every markdown
tab — needs GFM extensions (tables, task lists) since the design
spec calls for CommonMark+GFM parity, and mermaid code fences need to
render as diagrams, not literal code blocks.
What: MarkdownView wraps react-markdown + remark-gfm, overriding the
default `code` renderer to detect a `language-mermaid` class (from a
mermaid-tagged code fence) and delegate to a dedicated MermaidBlock
component instead of rendering plain code. A placeholder MermaidBlock stub is
included so this task's tests compile independently of Task 3, which
replaces the stub with real rendering behind the same {definition}
prop contract.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule (background-session handling per Plan 5's established note).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: Mermaid 圖表渲染

**Files:**
- Modify: `src/frontend/components/MermaidBlock.tsx`（取代 Task 2 的 stub）
- Test: `tests/frontend/MermaidBlock.test.tsx`

**Interfaces:**
- Produces: `<MermaidBlock definition={string} />` — renders an SVG diagram via the `mermaid` package; shows an error message inline (not a crash) if the definition is invalid syntax

- [ ] **Step 1: 安裝依賴**

```bash
npm install mermaid
```

- [ ] **Step 2: 寫失敗測試**

`tests/frontend/MermaidBlock.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MermaidBlock } from '../../src/frontend/components/MermaidBlock.js'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, definition: string) => {
      if (definition.includes('INVALID')) {
        return Promise.reject(new Error('Parse error'))
      }
      return Promise.resolve({ svg: `<svg data-id="${id}"></svg>` })
    }),
  },
}))

describe('MermaidBlock', () => {
  it('renders the SVG returned by mermaid.render', async () => {
    render(<MermaidBlock definition="graph TD; A-->B;" />)
    await waitFor(() => expect(screen.getByTestId('mermaid-block').innerHTML).toContain('<svg'))
  })

  it('shows an inline error message instead of crashing on invalid syntax', async () => {
    render(<MermaidBlock definition="INVALID syntax here" />)
    await waitFor(() => expect(screen.getByText(/diagram error/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm run test:frontend -- MermaidBlock.test.tsx`
Expected: FAIL — assertions fail against the stub (stub renders an empty div, never an svg or error text)

- [ ] **Step 4: 實作**

`src/frontend/components/MermaidBlock.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false })

let renderCounter = 0

interface MermaidBlockProps {
  definition: string
}

export function MermaidBlock({ definition }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${renderCounter++}`)

  useEffect(() => {
    let cancelled = false
    setError(null)
    mermaid
      .render(idRef.current, definition)
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch(() => {
        if (!cancelled) setError('Diagram error: could not render this diagram.')
      })
    return () => {
      cancelled = true
    }
  }, [definition])

  return (
    <div data-testid="mermaid-block">
      {error && <p>{error}</p>}
      {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  )
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm run test:frontend -- MermaidBlock.test.tsx`
Expected: PASS（2 個測試）

- [ ] **Step 6: 重新執行 MarkdownView 測試確認仍相容**

Run: `npm run test:frontend -- MarkdownView.test.tsx`
Expected: PASS（`mermaid.render` 在測試環境下走真正的套件而非 mock；若這個測試檔案沒有 mock `mermaid`，`MermaidBlock` 內部的 render 呼叫可能是非同步且測試只斷言 `mermaid-block` 這個 testid 存在，不斷言 svg 內容，所以不受影響——若執行後發現真的因為缺少 mock 而報錯或印出大量 console warning，比照 `MermaidBlock.test.tsx` 的做法在 `MarkdownView.test.tsx` 也加上 `vi.mock('mermaid', ...)`）

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/frontend/components/MermaidBlock.tsx tests/frontend/MermaidBlock.test.tsx
git commit -m "$(cat <<'EOF'
Implement real Mermaid diagram rendering

Why: Task 2 shipped a stub MermaidBlock so MarkdownView's tests could
compile independently. This task replaces it with real rendering via
the mermaid package, completing the "```mermaid renders as a diagram"
feature the design spec requires.
What: MermaidBlock calls mermaid.render() with a unique per-instance
id (needed because mermaid.render requires a DOM-unique id argument,
not tied to any real DOM node it manages itself), injects the
returned SVG string, and shows an inline "Diagram error" message
instead of crashing when the definition has invalid syntax.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. mermaid.render returns a Promise (async), so a `cancelled`
guard flag prevents a late-resolving render from calling setState on
an unmounted component if the definition changes or the tab closes
mid-render.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: HTML Sandbox 渲染

**Files:**
- Create: `src/frontend/components/HtmlView.tsx`
- Test: `tests/frontend/HtmlView.test.tsx`

**Interfaces:**
- Produces: `<HtmlView content={string} allowScripts={boolean} />` — renders the given HTML string inside a sandboxed `<iframe>`; `sandbox` attribute is `"allow-scripts"` when `allowScripts` is `true`, empty string otherwise; **never** includes `allow-same-origin` regardless of `allowScripts`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/HtmlView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HtmlView } from '../../src/frontend/components/HtmlView.js'

describe('HtmlView', () => {
  it('renders an iframe with no sandbox permissions when allowScripts is false', () => {
    render(<HtmlView content="<p>hi</p>" allowScripts={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('sandbox')).toBe('')
  })

  it('renders an iframe with allow-scripts but never allow-same-origin when allowScripts is true', () => {
    render(<HtmlView content="<script>alert(1)</script>" allowScripts={true} />)
    const iframe = screen.getByTitle('html-preview')
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('uses the srcdoc attribute to inject content (not src, which would need a real URL)', () => {
    render(<HtmlView content="<p>hello world</p>" allowScripts={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('srcdoc')).toBe('<p>hello world</p>')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- HtmlView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/HtmlView.tsx`:

```tsx
interface HtmlViewProps {
  content: string
  allowScripts: boolean
}

export function HtmlView({ content, allowScripts }: HtmlViewProps) {
  return (
    <iframe
      title="html-preview"
      srcDoc={content}
      sandbox={allowScripts ? 'allow-scripts' : ''}
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- HtmlView.test.tsx`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/HtmlView.tsx tests/frontend/HtmlView.test.tsx
git commit -m "$(cat <<'EOF'
Add sandboxed HTML rendering

Why: Per the design spec's security section, .html files must never
execute script in a way that could read the sessionStorage token or
call authenticated APIs — the sandbox must never include
allow-same-origin regardless of the script-execution setting, since
that's what makes even an allowed script unable to reach the parent
page's storage.
What: HtmlView renders content via an iframe's srcdoc (not src, which
would require a real same-origin URL and defeat the sandboxing
purpose). The allowScripts prop toggles only the allow-scripts sandbox
token; allow-same-origin is never included under any circumstance.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. allowScripts is a prop here (not yet wired to a real setting —
the settings-menu plan will wire the actual "allow html script
execution" toggle and privacy-mode override into whatever renders
HtmlView).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: Markdown 編輯器（純文字）

**Files:**
- Create: `src/frontend/components/MarkdownEditor.tsx`
- Test: `tests/frontend/MarkdownEditor.test.tsx`

**Interfaces:**
- Produces: `<MarkdownEditor value={string} onChange={(value: string) => void} onSave={() => void} />` — a `<textarea>`-based editor; `Ctrl+S`（或 `Cmd+S` on Mac）calls `onSave()` and prevents the browser's native save dialog

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/MarkdownEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownEditor } from '../../src/frontend/components/MarkdownEditor.js'

describe('MarkdownEditor', () => {
  it('renders the current value in a textarea', () => {
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onChange with the new value when the user types', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="hello" onChange={onChange} onSave={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } })
    expect(onChange).toHaveBeenCalledWith('hello world')
  })

  it('calls onSave and prevents default on Ctrl+S', () => {
    const onSave = vi.fn()
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
    expect(onSave).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('calls onSave on Cmd+S (metaKey, for Mac)', () => {
    const onSave = vi.fn()
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
    expect(onSave).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- MarkdownEditor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/MarkdownEditor.tsx`:

```tsx
interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export function MarkdownEditor({ value, onChange, onSave }: MarkdownEditorProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
    if (isSaveShortcut) {
      e.preventDefault()
      onSave()
    }
  }

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      style={{ width: '100%', height: '100%', border: 'none', resize: 'none', fontFamily: 'monospace' }}
    />
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- MarkdownEditor.test.tsx`
Expected: PASS（4 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/MarkdownEditor.tsx tests/frontend/MarkdownEditor.test.tsx
git commit -m "$(cat <<'EOF'
Add plain-textarea Markdown editor with Ctrl+S

Why: Editing needs a text input surface, and the design spec calls
out Ctrl+S as the one required keyboard shortcut for this plan (other
shortcuts are left to implementation-time convention).
What: A controlled <textarea> wrapper. Both Ctrl+S (Windows/Linux)
and Cmd+S (Mac, via metaKey) trigger onSave with preventDefault so
the browser's native "Save Page As" dialog never appears.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. No syntax highlighting or rich editor (CodeMirror/Monaco) —
YAGNI per the plan's stated tech stack decision; a plain textarea is
sufficient for markdown source editing and keeps bundle size down.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 6: Split View + 衝突對話框

**Files:**
- Create: `src/frontend/components/SplitView.tsx`
- Create: `src/frontend/components/ConflictDialog.tsx`
- Test: `tests/frontend/SplitView.test.tsx`
- Test: `tests/frontend/ConflictDialog.test.tsx`

**Interfaces:**
- Produces:
  - `<SplitView value={string} onChange={(v: string) => void} onSave={() => void} />` — renders `<MarkdownEditor>` on the left, `<MarkdownView>` (live preview of `value`) on the right
  - `<ConflictDialog currentContent={string} onKeepMine={() => void} onDiscardMine={() => void} />` — modal-style dialog shown on a 409 response

- [ ] **Step 1: 寫失敗測試（SplitView）**

`tests/frontend/SplitView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SplitView } from '../../src/frontend/components/SplitView.js'

describe('SplitView', () => {
  it('renders both an editable textarea and a live markdown preview', () => {
    render(<SplitView value="# Title" onChange={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('# Title')
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
  })

  it('propagates onChange from the editor side', () => {
    const onChange = vi.fn()
    render(<SplitView value="# Title" onChange={onChange} onSave={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# New Title' } })
    expect(onChange).toHaveBeenCalledWith('# New Title')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- SplitView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作 SplitView**

`src/frontend/components/SplitView.tsx`:

```tsx
import { MarkdownEditor } from './MarkdownEditor.js'
import { MarkdownView } from './MarkdownView.js'

interface SplitViewProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export function SplitView({ value, onChange, onSave }: SplitViewProps) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, borderRight: '1px solid #ccc' }}>
        <MarkdownEditor value={value} onChange={onChange} onSave={onSave} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MarkdownView content={value} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- SplitView.test.tsx`
Expected: PASS（2 個測試）

- [ ] **Step 5: 寫失敗測試（ConflictDialog）**

`tests/frontend/ConflictDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictDialog } from '../../src/frontend/components/ConflictDialog.js'

describe('ConflictDialog', () => {
  it('shows the current (external) content for reference', () => {
    render(
      <ConflictDialog currentContent="external version" onKeepMine={() => {}} onDiscardMine={() => {}} />
    )
    expect(screen.getByText(/external version/)).toBeInTheDocument()
  })

  it('calls onKeepMine when the keep-mine button is clicked', () => {
    const onKeepMine = vi.fn()
    render(<ConflictDialog currentContent="x" onKeepMine={onKeepMine} onDiscardMine={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))
    expect(onKeepMine).toHaveBeenCalledOnce()
  })

  it('calls onDiscardMine when the discard-mine button is clicked', () => {
    const onDiscardMine = vi.fn()
    render(<ConflictDialog currentContent="x" onKeepMine={() => {}} onDiscardMine={onDiscardMine} />)
    fireEvent.click(screen.getByRole('button', { name: /discard mine/i }))
    expect(onDiscardMine).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 6: 執行測試確認失敗**

Run: `npm run test:frontend -- ConflictDialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: 實作 ConflictDialog**

`src/frontend/components/ConflictDialog.tsx`:

```tsx
interface ConflictDialogProps {
  currentContent: string
  onKeepMine: () => void
  onDiscardMine: () => void
}

export function ConflictDialog({ currentContent, onKeepMine, onDiscardMine }: ConflictDialogProps) {
  return (
    <div role="dialog" aria-label="File conflict">
      <p>This file was modified externally while you were editing it.</p>
      <pre style={{ maxHeight: 200, overflow: 'auto' }}>{currentContent}</pre>
      <button onClick={onKeepMine}>Keep mine and overwrite</button>
      <button onClick={onDiscardMine}>Discard mine, reload latest</button>
    </div>
  )
}
```

- [ ] **Step 8: 執行測試確認通過**

Run: `npm run test:frontend -- ConflictDialog.test.tsx`
Expected: PASS（3 個測試）

- [ ] **Step 9: Commit**

```bash
git add src/frontend/components/SplitView.tsx src/frontend/components/ConflictDialog.tsx tests/frontend/SplitView.test.tsx tests/frontend/ConflictDialog.test.tsx
git commit -m "$(cat <<'EOF'
Add Split view and the save-conflict dialog

Why: Split mode (edit + live preview side by side) is one of the
three view modes the design spec requires. Separately, the backend's
409 conflict response (Plan 2) needs a UI surface — the spec calls
for "prompt but don't block": show what changed externally and let
the user choose to keep their edits or discard them, not silently
overwrite or silently lose work.
What: SplitView composes the already-tested MarkdownEditor and
MarkdownView side by side, sharing the same value/onChange/onSave
contract as the editor alone. ConflictDialog displays the server's
current (externally-modified) content and offers exactly the two
choices the spec calls for.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. ConflictDialog is presentation-only here — the actual
force=true retry / discard-and-refetch logic that calls it is Task 8,
where TabContent wires real save/conflict handling.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 7: TabContent — 依模式分派 + 載入檔案內容

**Files:**
- Create: `src/frontend/components/TabContent.tsx`
- Test: `tests/frontend/TabContent.test.tsx`

**Interfaces:**
- Produces: `<TabContent tab={Tab} onContentLoaded={(content: string, mtimeMs: number, encoding: 'utf-8'|'unknown') => void} onChange={(value: string) => void} onSave={() => void} allowHtmlScripts={boolean} />` — fetches `GET /api/file` when `tab.content === null` (not yet loaded), then renders `MarkdownView`/`MarkdownEditor`/`SplitView`/`HtmlView` based on `tab.mode` and the file extension; non-UTF-8 files force `mode` display to a read-only view regardless of `tab.mode`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/TabContent.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TabContent } from '../../src/frontend/components/TabContent.js'
import type { Tab } from '../../src/frontend/types.js'

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: '0:a.md',
    rootId: 0,
    relPath: 'a.md',
    title: 'a.md',
    dirty: false,
    content: null,
    mtimeMs: null,
    encoding: 'utf-8',
    mode: 'view',
    ...overrides,
  }
}

describe('TabContent', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('fetches file content when not yet loaded, then calls onContentLoaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ content: '# Hi', mtimeMs: 123, encoding: 'utf-8' }))
      )
    )
    const onContentLoaded = vi.fn()
    render(
      <TabContent
        tab={makeTab()}
        onContentLoaded={onContentLoaded}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    await waitFor(() => expect(onContentLoaded).toHaveBeenCalledWith('# Hi', 123, 'utf-8'))
  })

  it('renders MarkdownView in view mode once content is loaded', () => {
    render(
      <TabContent
        tab={makeTab({ content: '# Hi', mtimeMs: 1 })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.getByTestId('markdown-view')).toBeInTheDocument()
  })

  it('renders HtmlView for a .html file regardless of mode', () => {
    render(
      <TabContent
        tab={makeTab({ relPath: 'a.html', content: '<p>hi</p>', mtimeMs: 1, mode: 'edit' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.getByTitle('html-preview')).toBeInTheDocument()
  })

  it('forces view mode for non-UTF-8 files even if tab.mode is edit', () => {
    render(
      <TabContent
        tab={makeTab({ content: '�', mtimeMs: 1, encoding: 'unknown', mode: 'edit' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:frontend -- TabContent.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/frontend/components/TabContent.tsx`:

```tsx
import { useEffect } from 'react'
import type { Tab } from '../types.js'
import { apiFetch } from '../api-client.js'
import { MarkdownView } from './MarkdownView.js'
import { MarkdownEditor } from './MarkdownEditor.js'
import { SplitView } from './SplitView.js'
import { HtmlView } from './HtmlView.js'

interface TabContentProps {
  tab: Tab
  onContentLoaded: (content: string, mtimeMs: number, encoding: 'utf-8' | 'unknown') => void
  onChange: (value: string) => void
  onSave: () => void
  allowHtmlScripts: boolean
}

export function TabContent({ tab, onContentLoaded, onChange, onSave, allowHtmlScripts }: TabContentProps) {
  useEffect(() => {
    if (tab.content !== null) return
    let cancelled = false
    apiFetch(`/api/file?root=${tab.rootId}&path=${encodeURIComponent(tab.relPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) onContentLoaded(data.content, data.mtimeMs, data.encoding)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.rootId, tab.relPath, tab.content])

  if (tab.content === null) {
    return <div>Loading...</div>
  }

  const isHtml = tab.relPath.endsWith('.html')
  if (isHtml) {
    return <HtmlView content={tab.content} allowScripts={allowHtmlScripts} />
  }

  const effectiveMode = tab.encoding === 'unknown' ? 'view' : tab.mode

  if (effectiveMode === 'edit') {
    return <MarkdownEditor value={tab.content} onChange={onChange} onSave={onSave} />
  }
  if (effectiveMode === 'split') {
    return <SplitView value={tab.content} onChange={onChange} onSave={onSave} />
  }
  return <MarkdownView content={tab.content} />
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend -- TabContent.test.tsx`
Expected: PASS（4 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/TabContent.tsx tests/frontend/TabContent.test.tsx
git commit -m "$(cat <<'EOF'
Add TabContent: fetches file content and dispatches to the right view

Why: Every other component in this plan (MarkdownView, MarkdownEditor,
SplitView, HtmlView) is content-agnostic about where its data comes
from — something needs to fetch GET /api/file for a not-yet-loaded
tab and route to the correct renderer based on file type, view mode,
and the non-UTF-8-forces-read-only rule from the design spec.
What: TabContent fetches content once per tab (guarded by
tab.content !== null so it doesn't refetch on every re-render),
reports the result upward via onContentLoaded (App.tsx owns the tab
state, per the single-source-of-truth pattern), and dispatches to
HtmlView (for .html, regardless of mode) or
MarkdownView/MarkdownEditor/SplitView (for everything else, gated by
an effectiveMode that silently downgrades edit/split to view when the
file's encoding is 'unknown').
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule. allowHtmlScripts is still a passed-in prop (not yet wired to a
real setting) — the settings-menu plan connects it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 8: 整合進 `App.tsx` — 存檔、衝突處理、草稿、快捷鍵

**Files:**
- Modify: `src/frontend/App.tsx`
- Test: `tests/frontend/App.test.tsx`（擴充）

**Interfaces:**
- `App.tsx` 的 `openFile` 改為建立含完整 `Tab` 欄位的分頁；新增 `saveActiveTab()`（呼叫 `PUT /api/file`，處理 409 顯示 `ConflictDialog`，成功後清除對應 draft、更新 `mtimeMs`、清除 `dirty`）；`onChange` 時同步呼叫 `useDraft` 的 `saveDraft`（debounce）並設定 `dirty: true`

- [ ] **Step 1: 讀取現有 `App.tsx`（Plan 5 留下的版本）**

- [ ] **Step 2: 寫失敗測試（擴充 `App.test.tsx`）**

在既有的 `App.test.tsx` 加入：

```tsx
it('opens a file and shows its content in the main content area', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/roots')) return Promise.resolve(new Response(JSON.stringify([{ id: 0, name: 'proj' }])))
    if (url.includes('/api/files')) return Promise.resolve(new Response(JSON.stringify({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] })))
    if (url.includes('/api/file?')) return Promise.resolve(new Response(JSON.stringify({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' })))
    return Promise.resolve(new Response('{}'))
  }))
  render(<App />)
  await waitFor(() => screen.getByText('a.md'))
  fireEvent.click(screen.getByText('a.md'))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
  vi.unstubAllGlobals()
})
```

（實作者可視現有 `App.test.tsx` 的實際結構調整這段測試的細節，重點是驗證「點檔案 → 內容顯示出來」這條端到端路徑，不需要逐字照抄。）

- [ ] **Step 3: 實作**

在 `App.tsx` 中：
1. `openFile` 建立的 `Tab` 物件補上 `content: null, mtimeMs: null, encoding: 'utf-8', mode: 'view'`
2. 新增 `handleContentLoaded(tabId, content, mtimeMs, encoding)`：更新對應 tab 的 `content`/`mtimeMs`/`encoding`（若該檔案有草稿，`content` 改用草稿內容而非伺服器內容，並保留 `dirty: true`）
3. 新增 `handleChange(tabId, value)`：更新 tab 的暫存內容、設 `dirty: true`、呼叫 `useDraft(tab.rootId, tab.relPath).saveDraft(value)`
4. 新增 `handleSave(tabId)`：呼叫 `PUT /api/file`，成功時更新 `mtimeMs`、清 `dirty`、清 draft；409 時記錄 `conflictContent` 狀態觸發 `<ConflictDialog>` 顯示
5. 在主內容區渲染 `<TabContent tab={activeTab} onContentLoaded={...} onChange={...} onSave={() => handleSave(activeTab.id)} allowHtmlScripts={false} />`，以及條件式渲染 `<ConflictDialog>`

（這是整合既有元件的組裝工作，實作者請對照 Task 1-7 已經測試過的元件介面精確串接，不要重新設計介面。）

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test:frontend`
Expected: 全部通過

- [ ] **Step 5: 執行完整驗證**

Run: `npm run lint && npm run typecheck:frontend && npm run test:frontend && npm run build`
Expected: 全部通過

- [ ] **Step 6: Commit — 這是一個 UI 段落**

```bash
git add src/frontend/App.tsx tests/frontend/App.test.tsx
git commit -m "$(cat <<'EOF'
Wire save, conflict handling, and drafts into App.tsx

Why: Tasks 1-7 built each piece (content loading, editor, split view,
conflict dialog, draft hook) independently and tested; nothing yet
connected them into the actual save/edit/conflict lifecycle a real
user session goes through.
What: openFile's created Tab now carries the full content/mtimeMs/
encoding/mode fields. handleContentLoaded prefers a localStorage
draft over freshly-fetched server content when one exists (so a
crash-recovered draft isn't silently discarded by the next file
open), keeping dirty:true in that case. handleChange updates the
tab's in-memory content and persists a draft on every change.
handleSave calls PUT /api/file, updates mtimeMs and clears dirty+draft
on success, or surfaces ConflictDialog on 409 with a choice to
force-overwrite or discard-and-reload.
How: [UI CHECKPOINT] UI-facing segment per CLAUDE.md's checkpoint
rule — this is the last UI-facing task in this plan.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint` passes
- [ ] `npm run typecheck:frontend` passes
- [ ] `npm run test:frontend` passes (all component/hook tests)
- [ ] `npm run build` produces `dist/frontend/` including all new components
- [ ] `npm run test:unit` / `npm run test:integration` (backend) remain unaffected
- [ ] Opening a markdown file renders it in view mode; switching to edit mode shows a textarea; switching to split shows both
- [ ] `Ctrl+S`/`Cmd+S` triggers a save; a 409 response shows the conflict dialog with working keep/discard choices
- [ ] A non-UTF-8 file cannot be switched to edit/split mode
- [ ] An `.html` file renders inside a sandboxed iframe with no `allow-same-origin` under any setting
- [ ] Editing content persists a draft in localStorage; a successful save clears it
