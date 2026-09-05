# 認證細節 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補完 Plan 1/2 尚未涵蓋的認證與隱私相關後端功能：PlantUML 文字編碼與代理 API（避免前端直接對外部 PlantUML server 發請求造成 CORS 問題，且由後端統一處理「是否允許傳送」）、伺服器端設定管理（PlantUML 伺服器網址）、token rotation（`--rotate-token`，Plan 1 保留但未實作的功能）。

**Architecture:** PlantUML 的文字編碼是一組純函式（deflate 壓縮 + PlantUML 專屬 64 字元表編碼），透過一個新的 proxy router 轉發到設定的 PlantUML server。設定值（PlantUML 伺服器網址）擴充進既有的 `config.json`，用一組新的 `GET/PUT /api/settings` 端點讀寫。

**Tech Stack:** 沿用 Plan 1/2 的 Express、Vitest、supertest；用 Node 內建 `node:zlib` 做 deflate 壓縮，不新增依賴。

## Global Constraints

- 所有新增 REST 端點一樣需要 `X-Auth-Token`（沿用 Plan 2 的 `createAuthMiddleware`）
- PlantUML 代理只在收到請求時才會真的送出資料到外部 server——是否呼叫這支 API 完全由前端決定（呼叫了就代表使用者已經透過隱私模式判斷允許傳送），後端不做額外的「是否允許」邏輯判斷,只單純轉發
- PlantUML 伺服器網址預設 `https://www.plantuml.com/plantuml`，可透過 `PUT /api/settings` 覆蓋，存進 `config.json`
- token rotation 產生新的 4 位數字 token 並立即覆蓋 `config.json`；沿用 Plan 1 `generateToken()`
- Commit 規範（`CLAUDE.md`）：一個邏輯段落一個 commit，訊息含 Why/What/How

---

## File Structure

```
src/server/
├── plantuml-encode.js        ← 純函式：deflate + PlantUML 專屬 base64 編碼
├── settings.js                 ← 讀寫 config.json 裡的可調設定（目前只有 plantumlServerUrl）
└── api/
    ├── settings.js               ← GET/PUT /api/settings
    └── plantuml.js                ← POST /api/plantuml-proxy

tests/unit/server/
├── plantuml-encode.test.js
└── settings.test.js

tests/integration/
└── api-plantuml-settings.test.js
```

---

### Task 1: PlantUML 文字編碼

**Files:**
- Create: `src/server/plantuml-encode.js`
- Test: `tests/unit/server/plantuml-encode.test.js`

**Interfaces:**
- Produces: `encodePlantUmlText(diagramSource: string): string` — PlantUML 官方定義的編碼算法（UTF-8 → raw deflate 壓縮 → 客製化 64 字元表編碼），回傳可直接接在 PlantUML server URL 後面的字串

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/plantuml-encode.test.js`:

```js
import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { encodePlantUmlText } from '../../../src/server/plantuml-encode.js'

describe('encodePlantUmlText', () => {
  it('produces a non-empty string for simple diagram source', () => {
    const result = encodePlantUmlText('@startuml\nAlice -> Bob\n@enduml')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('only uses characters from PlantUML\'s 64-character alphabet', () => {
    const result = encodePlantUmlText('@startuml\nAlice -> Bob: hello\n@enduml')
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces different output for different input', () => {
    const a = encodePlantUmlText('@startuml\nA -> B\n@enduml')
    const b = encodePlantUmlText('@startuml\nB -> C\n@enduml')
    expect(a).not.toBe(b)
  })

  it('is deterministic (same input produces same output)', () => {
    const source = '@startuml\nfoo -> bar\n@enduml'
    expect(encodePlantUmlText(source)).toBe(encodePlantUmlText(source))
  })

  it('round-trips through raw deflate decompression back to the original bytes', () => {
    // Verifies the encoding is actually a valid deflate+custom-base64 pipeline,
    // not just an opaque hash — decode the custom alphabet back to bytes,
    // inflate, and confirm we get the original UTF-8 text back.
    const source = '@startuml\nAlice -> Bob: Authentication Request\n@enduml'
    const encoded = encodePlantUmlText(source)

    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const sixBitValues = [...encoded].map((ch) => ALPHABET.indexOf(ch))
    const bytes = []
    for (let i = 0; i + 3 < sixBitValues.length + 1; i += 4) {
      const [c1, c2, c3, c4] = [
        sixBitValues[i] ?? 0,
        sixBitValues[i + 1] ?? 0,
        sixBitValues[i + 2] ?? 0,
        sixBitValues[i + 3] ?? 0,
      ]
      bytes.push((c1 << 2) | (c2 >> 4))
      bytes.push(((c2 & 0xf) << 4) | (c3 >> 2))
      bytes.push(((c3 & 0x3) << 6) | c4)
    }
    const compressed = Buffer.from(bytes)
    const inflated = zlib.inflateRawSync(compressed)
    expect(inflated.toString('utf-8').startsWith(source)).toBe(true)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/plantuml-encode.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/server/plantuml-encode.js`:

```js
import zlib from 'node:zlib'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function encode6bit(value) {
  return ALPHABET[value & 0x3f]
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4)
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6)
  const c4 = b3 & 0x3f
  return encode6bit(c1) + encode6bit(c2) + encode6bit(c3) + encode6bit(c4)
}

function encode64(data) {
  let result = ''
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      result += append3bytes(data[i], data[i + 1], 0)
    } else if (i + 1 === data.length) {
      result += append3bytes(data[i], 0, 0)
    } else {
      result += append3bytes(data[i], data[i + 1], data[i + 2])
    }
  }
  return result
}

export function encodePlantUmlText(diagramSource) {
  const utf8Bytes = Buffer.from(diagramSource, 'utf-8')
  const compressed = zlib.deflateRawSync(utf8Bytes, { level: 9 })
  return encode64(compressed)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/plantuml-encode.test.js`
Expected: PASS（5 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/plantuml-encode.js tests/unit/server/plantuml-encode.test.js
git commit -m "$(cat <<'EOF'
Add PlantUML text encoding (deflate + custom base64)

Why: Rendering .puml/.plantuml diagrams via an external PlantUML
server (opt-in, per the design spec's privacy settings) requires
encoding the diagram source into PlantUML's URL-safe text format
before it can be appended to a server URL like
/plantuml/png/<encoded>.
What: encodePlantUmlText(diagramSource) implements PlantUML's
documented algorithm: UTF-8 encode, raw deflate compress (no zlib
header), then encode 3-byte groups into 4 characters from PlantUML's
own 64-character alphabet (A-Z, a-z, 0-9, -, _ — not standard
base64's +/).
How: No external dependency — node:zlib's deflateRawSync covers
compression; the custom 6-bit-group encoding is implemented directly
per PlantUML's own reference algorithm. Verified with a round-trip
test that decodes the custom alphabet back to bytes and inflates them
to confirm the original text is recoverable, not just that the
function produces *some* deterministic string.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: 設定管理（PlantUML 伺服器網址）

**Files:**
- Create: `src/server/settings.js`
- Test: `tests/unit/server/settings.test.js`

**Interfaces:**
- Produces:
  - `readSettings(configDir): {plantumlServerUrl: string}` — 從 `config.json` 讀取，若欄位不存在回傳預設值 `'https://www.plantuml.com/plantuml'`
  - `updateSettings(configDir, updates: {plantumlServerUrl?: string}): {plantumlServerUrl: string}` — 合併寫回 `config.json`，不影響 `token`/`port`/`roots` 等既有欄位

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/settings.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, updateSettings } from '../../../src/server/settings.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'

describe('settings', () => {
  let configDir

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'))
    loadOrCreateConfig(configDir, { roots: ['/tmp/a'], port: 4173 })
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('returns the default PlantUML server URL when not set', () => {
    const settings = readSettings(configDir)
    expect(settings.plantumlServerUrl).toBe('https://www.plantuml.com/plantuml')
  })

  it('persists an updated PlantUML server URL', () => {
    updateSettings(configDir, { plantumlServerUrl: 'https://plantuml.example.com' })
    const settings = readSettings(configDir)
    expect(settings.plantumlServerUrl).toBe('https://plantuml.example.com')
  })

  it('does not clobber token/port/roots when updating settings', () => {
    const before = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
    updateSettings(configDir, { plantumlServerUrl: 'https://plantuml.example.com' })
    const after = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
    expect(after.token).toBe(before.token)
    expect(after.port).toBe(before.port)
    expect(after.roots).toEqual(before.roots)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/settings.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/server/settings.js`:

```js
import fs from 'node:fs'
import { getConfigPath, readConfig } from './config.js'

const DEFAULT_PLANTUML_SERVER_URL = 'https://www.plantuml.com/plantuml'

export function readSettings(configDir) {
  const config = readConfig(configDir) ?? {}
  return {
    plantumlServerUrl: config.plantumlServerUrl ?? DEFAULT_PLANTUML_SERVER_URL,
  }
}

export function updateSettings(configDir, updates) {
  const config = readConfig(configDir) ?? {}
  const merged = { ...config, ...updates }
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(merged, null, 2))
  return readSettings(configDir)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/settings.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/settings.js tests/unit/server/settings.test.js
git commit -m "$(cat <<'EOF'
Add server-side settings management (PlantUML server URL)

Why: The PlantUML server URL is a daemon-level setting (which
external service this instance talks to), not a per-browser UI
preference like theme/language — it belongs in config.json alongside
token/port/roots, not localStorage, and needs read/write access for
the upcoming settings API and the settings UI panel.
What: readSettings (defaults to the public plantuml.com server when
unset) and updateSettings (merges into config.json without touching
token/port/roots).
How: Reuses config.js's getConfigPath/readConfig rather than
duplicating file I/O; settings are just additional keys on the same
config.json Plan 1 already manages.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: `GET/PUT /api/settings` + `POST /api/plantuml-proxy`

**Files:**
- Create: `src/server/api/settings.js`
- Create: `src/server/api/plantuml.js`
- Test: `tests/integration/api-plantuml-settings.test.js`

**Interfaces:**
- Consumes: `readSettings`/`updateSettings` (Task 2), `encodePlantUmlText` (Task 1)
- Produces:
  - `createSettingsRouter(configDir): express.Router` — `GET /api/settings` → `{plantumlServerUrl}`; `PUT /api/settings` body `{plantumlServerUrl}` → updated settings
  - `createPlantUmlRouter(configDir): express.Router` — `POST /api/plantuml-proxy` body `{source: string}` → proxies to `<plantumlServerUrl>/png/<encoded>`, streams the image back; upstream failure → 502 `{errorCode: 'PLANTUML_UNREACHABLE'}`

This task uses a fake upstream PlantUML server (a local `http.createServer`) in the test rather than hitting the real `plantuml.com`, so tests stay fast and don't depend on network access.

- [ ] **Step 1: 寫失敗測試**

`tests/integration/api-plantuml-settings.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSettingsRouter } from '../../src/server/api/settings.js'
import { createPlantUmlRouter } from '../../src/server/api/plantuml.js'
import { loadOrCreateConfig } from '../../src/server/config.js'
import { encodePlantUmlText } from '../../src/server/plantuml-encode.js'

describe('settings and PlantUML proxy API', () => {
  let configDir
  let fakeUpstream
  let fakeUpstreamPort

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-plantuml-'))
    loadOrCreateConfig(configDir, { roots: ['/tmp/a'], port: 4173 })

    fakeUpstream = http.createServer((req, res) => {
      if (req.url.includes('/png/')) {
        res.setHeader('Content-Type', 'image/png')
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    await new Promise((resolve) => fakeUpstream.listen(0, '127.0.0.1', resolve))
    fakeUpstreamPort = fakeUpstream.address().port
  })

  afterEach(async () => {
    await new Promise((resolve) => fakeUpstream.close(resolve))
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/api', createSettingsRouter(configDir))
    app.use('/api', createPlantUmlRouter(configDir))
    return app
  }

  it('GET /api/settings returns the default PlantUML server URL', async () => {
    const res = await request(buildApp()).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body.plantumlServerUrl).toBe('https://www.plantuml.com/plantuml')
  })

  it('PUT /api/settings updates and persists the PlantUML server URL', async () => {
    const app = buildApp()
    const putRes = await request(app)
      .put('/api/settings')
      .send({ plantumlServerUrl: `http://127.0.0.1:${fakeUpstreamPort}` })
    expect(putRes.status).toBe(200)
    expect(putRes.body.plantumlServerUrl).toBe(`http://127.0.0.1:${fakeUpstreamPort}`)

    const getRes = await request(app).get('/api/settings')
    expect(getRes.body.plantumlServerUrl).toBe(`http://127.0.0.1:${fakeUpstreamPort}`)
  })

  it('POST /api/plantuml-proxy encodes the source and proxies to the configured server', async () => {
    const app = buildApp()
    await request(app)
      .put('/api/settings')
      .send({ plantumlServerUrl: `http://127.0.0.1:${fakeUpstreamPort}` })

    const res = await request(app)
      .post('/api/plantuml-proxy')
      .send({ source: '@startuml\nAlice -> Bob\n@enduml' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })

  it('returns 502 when the upstream PlantUML server is unreachable', async () => {
    const app = buildApp()
    await request(app).put('/api/settings').send({ plantumlServerUrl: 'http://127.0.0.1:1' })

    const res = await request(app)
      .post('/api/plantuml-proxy')
      .send({ source: '@startuml\nA -> B\n@enduml' })

    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('PLANTUML_UNREACHABLE')
  })

  it('returns 400 when source is missing from the request body', async () => {
    const res = await request(buildApp()).post('/api/plantuml-proxy').send({})
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/integration/api-plantuml-settings.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 實作**

`src/server/api/settings.js`:

```js
import express from 'express'
import { readSettings, updateSettings } from '../settings.js'

export function createSettingsRouter(configDir) {
  const router = express.Router()

  router.get('/settings', (req, res) => {
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(readSettings(configDir))
  })

  router.put('/settings', (req, res) => {
    const updated = updateSettings(configDir, req.body)
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(updated)
  })

  return router
}
```

`src/server/api/plantuml.js`:

```js
import express from 'express'
import { readSettings } from '../settings.js'
import { encodePlantUmlText } from '../plantuml-encode.js'

export function createPlantUmlRouter(configDir) {
  const router = express.Router()

  router.post('/plantuml-proxy', async (req, res) => {
    const { source } = req.body
    if (!source || typeof source !== 'string') {
      return res.status(400).json({ errorCode: 'MISSING_SOURCE' })
    }

    const { plantumlServerUrl } = readSettings(configDir)
    const encoded = encodePlantUmlText(source)
    const upstreamUrl = `${plantumlServerUrl}/png/${encoded}`

    try {
      const upstreamRes = await fetch(upstreamUrl, { signal: AbortSignal.timeout(10_000) })
      if (!upstreamRes.ok) {
        return res.status(502).json({ errorCode: 'PLANTUML_UNREACHABLE' })
      }
      const buffer = Buffer.from(await upstreamRes.arrayBuffer())
      res.set('Content-Type', upstreamRes.headers.get('content-type') ?? 'image/png')
      res.send(buffer)
    } catch {
      res.status(502).json({ errorCode: 'PLANTUML_UNREACHABLE' })
    }
  })

  return router
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/integration/api-plantuml-settings.test.js`
Expected: PASS（5 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/api/settings.js src/server/api/plantuml.js tests/integration/api-plantuml-settings.test.js
git commit -m "$(cat <<'EOF'
Add GET/PUT /api/settings and POST /api/plantuml-proxy

Why: The frontend's privacy settings panel needs to read/write the
PlantUML server URL, and rendering .puml diagrams needs a backend
proxy — sending diagram source directly from the browser to an
external PlantUML server risks CORS failures against
non-CORS-enabled self-hosted servers, and centralizing the request
server-side is simpler than requiring every deployment's PlantUML
server to be CORS-configured.
What: GET/PUT /api/settings exposes the daemon-level settings
(currently just plantumlServerUrl). POST /api/plantuml-proxy encodes
the given diagram source (Task 1) and fetches
<plantumlServerUrl>/png/<encoded>, streaming the image back;
unreachable/non-2xx upstream -> 502 PLANTUML_UNREACHABLE; missing
source -> 400.
How: Tests use a local fake HTTP server as the "upstream PlantUML
server" instead of hitting the real plantuml.com, keeping tests fast
and network-independent. A 10s AbortSignal.timeout guards against a
hung upstream connection.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: `--rotate-token` CLI 參數

**Files:**
- Modify: `src/server/config.js` — add `rotateToken(configDir)`
- Modify: `src/server/commands/cli-args.js` — parse `--rotate-token`
- Modify: `bin/cli.js` — handle rotation before/independent of `start`
- Test: `tests/unit/server/config.test.js` (append), `tests/unit/server/cli-args.test.js` (append)

**Interfaces:**
- Produces: `rotateToken(configDir): {token, port, roots, ...}` — generates a new 4-digit token, overwrites `config.json`, returns the full updated config; throws if no config exists yet (nothing to rotate)

- [ ] **Step 1: 讀取現有檔案，規劃最小修改**

讀取 `src/server/config.js`、`src/server/commands/cli-args.js`、`bin/cli.js` 目前的內容。

- [ ] **Step 2: 寫失敗測試並實作 `rotateToken`**

在 `tests/unit/server/config.test.js` 新增（沿用既有的 `describe('config file management', ...)` 區塊）：

```js
import { rotateToken } from '../../../src/server/config.js'

// ...
it('rotateToken generates a new token and persists it', () => {
  const first = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
  const rotated = rotateToken(dir)
  expect(rotated.token).toMatch(/^\d{4}$/)
  expect(rotated.port).toBe(4173)
  expect(rotated.roots).toEqual(['/tmp/a'])
  // extremely unlikely but not impossible to collide; this is a smoke test,
  // not a proof — rotation working is confirmed by config.json actually changing
  const reread = readConfig(dir)
  expect(reread.token).toBe(rotated.token)
})

it('rotateToken throws if no config exists yet', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-empty-'))
  expect(() => rotateToken(emptyDir)).toThrow()
  fs.rmSync(emptyDir, { recursive: true, force: true })
})
```

Run: `npx vitest run tests/unit/server/config.test.js` → confirm FAIL (rotateToken not exported)

In `src/server/config.js`, add:

```js
export function rotateToken(configDir) {
  const existing = readConfig(configDir)
  if (!existing) {
    throw new Error('No config.json found; nothing to rotate. Run `start` first.')
  }
  const updated = { ...existing, token: generateToken() }
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(updated, null, 2))
  return updated
}
```

Run: `npx vitest run tests/unit/server/config.test.js` → confirm PASS

- [ ] **Step 3: 擴充 CLI 參數解析**

在 `tests/unit/server/cli-args.test.js` 新增：

```js
it('parses --rotate-token as a boolean flag', () => {
  expect(parseArgs(['start', '--rotate-token']).rotateToken).toBe(true)
  expect(parseArgs(['start']).rotateToken).toBe(false)
})
```

Run: confirm FAIL, then add to `src/server/commands/cli-args.js`'s loop:

```js
} else if (arg === '--rotate-token') {
  rotateTokenFlag = true
}
```

(declare `let rotateTokenFlag = false` alongside the other flags, include `rotateToken: rotateTokenFlag` in the returned object)

Run: confirm PASS.

- [ ] **Step 4: 接上 `bin/cli.js`**

讀取現有 `bin/cli.js`。在 `start` 分支之前（或之內，視現有結構決定，但邏輯上應該是：先處理 rotate，再進行 health-check 探活與 spawn 判斷），加入：

```js
import { rotateToken } from '../src/server/config.js'
import { getConfigDir } from '../src/server/xdg-paths.js'

// inside the `if (command === 'start')` branch, before calling runStart:
if (rotateToken_flag_from_parseArgs) {
  try {
    const rotated = rotateToken(getConfigDir())
    console.log(`Token rotated: ${rotated.token}`)
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
    return
  }
}
```

（實作者請依照 `bin/cli.js` 實際的變數命名與 `main()` 函式結構調整，不要逐字貼上——這裡只給出邏輯順序：`--rotate-token` 與 `start` 同時給時，先完成 rotation 再繼續原本的 start 流程；且 rotation 必須在既有 config 存在時才有意義，若 daemon 已在執行中，rotation 後既有連線的舊 token 立即失效，這是預期行為，不需要額外處理。）

- [ ] **Step 5: 執行完整驗證**

Run: `npm run lint && npm run test:unit && npm run build && npm run test:integration`
Expected: 全部通過

- [ ] **Step 6: Commit**

```bash
git add src/server/config.js src/server/commands/cli-args.js bin/cli.js tests/unit/server/config.test.js tests/unit/server/cli-args.test.js
git commit -m "$(cat <<'EOF'
Add --rotate-token CLI flag

Why: Plan 1's design spec noted token rotation as a future CLI flag
("除非之後手動提供 --rotate-token") but didn't implement it — a user
who suspects their connection link leaked (e.g. shared a screenshot,
browser history) had no way to invalidate it short of manually
editing config.json.
What: rotateToken(configDir) generates a fresh 4-digit token and
overwrites config.json (preserving port/roots), throwing if no config
exists yet. `start --rotate-token` rotates before proceeding with the
normal start flow.
How: Rotating while the daemon is already running immediately
invalidates existing connections' tokens — this is the intended
behavior (that's the whole point of rotation), not a bug to guard
against.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: 整合進 `createApp` + Doctor 串接真實設定

**Files:**
- Modify: `src/server/app.js` — mount `createSettingsRouter`/`createPlantUmlRouter` behind auth middleware
- Modify: `src/server/doctor.js` — PlantUML 連線檢查改讀真實 `readSettings`，而非寫死網址

**Interfaces:**
- Consumes: `createSettingsRouter`/`createPlantUmlRouter` (Task 3), `readSettings` (Task 2)

- [ ] **Step 1: 讀取現有 `src/server/app.js`、`src/server/doctor.js`**

- [ ] **Step 2: 修改 `src/server/app.js`**

```js
import { createSettingsRouter } from './api/settings.js'
import { createPlantUmlRouter } from './api/plantuml.js'

// alongside the other app.use('/api', authMiddleware, ...) calls — note these
// two need `configDir`, which app.js's caller (entry.js) must now pass in as
// part of createApp's options object:
app.use('/api', authMiddleware, createSettingsRouter(configDir))
app.use('/api', authMiddleware, createPlantUmlRouter(configDir))
```

（`configDir` 需要從 `entry.js` 傳入 `createApp` 的參數物件；`entry.js` 本身已經有 `getConfigDir()` 的結果可以直接沿用，只是先前沒有把它傳進 `createApp`）

- [ ] **Step 3: 修改 `src/server/entry.js`**（若 Step 2 需要）

確認 `configDir` 變數在 `createApp({...})` 呼叫處可用，補上 `configDir` 這個 option。

- [ ] **Step 4: 修改 `src/server/doctor.js`**

找到 Plan 2 Task 9 寫的 PlantUML 連線檢查（目前可能是寫死網址或是尚未真正檢查），改成：

```js
import { readSettings } from './settings.js'

// inside runDoctor or its PlantUML check function:
const { plantumlServerUrl } = readSettings(configDir)
// ... use plantumlServerUrl instead of any hardcoded value when checking reachability
```

- [ ] **Step 5: 執行完整驗證**

Run: `npm run lint && npm run test:unit && npm run build && npm run test:integration`
Expected: 全部通過

- [ ] **Step 6: Commit**

```bash
git add src/server/app.js src/server/entry.js src/server/doctor.js
git commit -m "$(cat <<'EOF'
Mount settings/PlantUML routers; doctor reads real PlantUML URL

Why: Tasks 1-4 built settings management, the PlantUML proxy, and
token rotation in isolation; nothing yet mounted the two new routers
onto the real app, and Plan 2's doctor PlantUML-reachability check
wasn't reading the actual configured server URL.
What: app.js mounts createSettingsRouter/createPlantUmlRouter behind
the existing auth middleware, with configDir threaded through from
entry.js. doctor.js's PlantUML check now calls readSettings() instead
of using a placeholder/hardcoded URL.
How: Minimal wiring changes, consistent with how Plan 2 Task 10
mounted its routers and threaded roots/extensions through.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes (plantuml-encode.js, settings.js, config.js rotation, cli-args.js)
- [ ] `npm run build` produces `dist/bundle.js` including this plan's code
- [ ] `npm run test:integration` passes (api-plantuml-settings.test.js plus all prior suites)
- [ ] A real spawned daemon's `GET/PUT /api/settings` correctly persists the PlantUML server URL across requests
- [ ] `POST /api/plantuml-proxy` correctly proxies to a real (or faked) PlantUML server and returns 502 on unreachable upstream
- [ ] `node bin/cli.js start --root <path> --rotate-token` generates a new token and the printed link reflects it
- [ ] `node bin/cli.js doctor` checks the actual configured PlantUML server URL, not a hardcoded one
