# Daemon 核心與 CLI 骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 md-viewer-server 的最底層基礎設施——XDG 路徑解析、`config.json` 管理、結構化 log（含 rotation）、Express 骨架、可用 `start`/`stop`/`status` 操作的背景 daemon，以及把它打包成單一 bundle 的流程。這是後續所有子系統（檔案 API、搜尋、前端）共同依賴的地基。

**Architecture:** Node.js（ESM）+ Express，daemon 用 `spawn(..., {detached:true}).unref()` 拉起，透過自己的 `GET /api/health` 探活（不依賴 pid 檔），`stop` 優先呼叫 `POST /api/shutdown`、pid+SIGTERM 只作 fallback。所有執行期資料存在 XDG Base Directory 路徑下。

**Tech Stack:** Node.js >= 18（開發用 20）、Express、pino（log）、esbuild（打包）、Vitest（測試）、supertest（API 測試）、ESLint + Prettier。

## Global Constraints

- Node.js >= 18（`package.json` engines），開發環境用 Node 20（`.nvmrc`）
- 目標安裝環境可能無 root 權限、無法連外 — 所有執行期資料放在使用者可寫的 XDG 路徑，所有依賴最終要能被 esbuild 打包進單一檔案
- 儘量不引入相依套件；只用 spec 已核准的：`express`、`ws`、`chokidar`、`pino`（`ws`/`chokidar` 屬於後續 plan，這個 plan 不用）
- XDG Base Directory：Config 用 `$XDG_CONFIG_HOME/md-viewer-server`（fallback `~/.config/md-viewer-server`）；State 用 `$XDG_STATE_HOME/md-viewer-server`（fallback `~/.local/state/md-viewer-server`）
- token 為 4 位數字，重啟不換，不做防暴力破解機制
- Daemon 探活一律用 `GET /api/health`，不依賴 `server.pid`（可能因程序異常死亡殘留、或被清除）；pid 檔只在 API 探活/呼叫失敗時作為 `stop` 的 fallback
- port 被佔用或指定失敗時直接報錯結束，不自動改用其他 port
- 所有回傳文字內容的 API 要明確標示 `charset=utf-8`
- log 一律英文，token 絕不原文寫入 log
- Commit 規範（見 `CLAUDE.md`）：一個邏輯段落一個 commit，訊息含 Why / What / How

---

## File Structure

```
md-viewer-server/
├── package.json
├── .nvmrc
├── .gitignore
├── eslint.config.js
├── .prettierrc
├── vitest.config.js
├── bin/
│   └── cli.js                        ← CLI 入口，解析參數並印出結果
├── src/server/
│   ├── xdg-paths.js                  ← XDG 路徑解析
│   ├── log-rotation.js               ← 依大小輪替的 write stream
│   ├── logger.js                     ← pino 封裝
│   ├── config.js                     ← config.json 讀寫、token 產生
│   ├── app.js                        ← Express app（health/shutdown）
│   ├── entry.js                      ← 真正被 spawn 執行、監聽 port 的程式
│   ├── daemon-utils.js               ← 探活（health check）、候選 IP 偵測
│   └── commands/
│       ├── cli-args.js               ← argv 解析
│       ├── start.js
│       ├── status.js
│       └── stop.js
├── scripts/
│   └── build.js                      ← esbuild 打包腳本
└── tests/
    ├── unit/server/
    │   ├── xdg-paths.test.js
    │   ├── log-rotation.test.js
    │   ├── logger.test.js
    │   ├── config.test.js
    │   ├── app.test.js
    │   ├── daemon-utils.test.js
    │   ├── cli-args.test.js
    │   ├── start.test.js
    │   ├── status.test.js
    │   └── stop.test.js
    └── integration/
        ├── entry.test.js
        └── cli-lifecycle.test.js
```

---

### Task 1: 專案骨架初始化

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `vitest.config.js`

**Interfaces:**
- Produces: `npm run lint` / `npm run test:unit` / `npm run test:integration` / `npm run build` scripts that every later task relies on

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "md-viewer-server",
  "version": "0.1.0",
  "description": "Background daemon serving a browser UI to view, search, and edit Markdown/HTML files over LAN",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "bin": {
    "md-viewer-server": "./bin/cli.js"
  },
  "scripts": {
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "lint": "eslint .",
    "build": "node scripts/build.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "pino": "^9.4.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "esbuild": "^0.24.0",
    "eslint": "^9.13.0",
    "prettier": "^3.3.3",
    "supertest": "^7.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 建立 `.nvmrc`**

```
20
```

- [ ] **Step 3: 建立 `.gitignore`**

```
node_modules/
dist/
*.log
coverage/
```

- [ ] **Step 4: 建立 `eslint.config.js`**

```js
import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
]
```

- [ ] **Step 5: 建立 `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
```

- [ ] **Step 6: 建立 `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 7: 安裝依賴**

Run: `npm install`
Expected: `node_modules/` 建立，`package-lock.json` 產生，無錯誤

- [ ] **Step 8: 驗證 lint 可執行**

Run: `npm run lint`
Expected: 無檔案可檢查（尚無原始碼），指令成功結束，exit code 0

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .nvmrc .gitignore eslint.config.js .prettierrc vitest.config.js
git commit -m "$(cat <<'EOF'
Scaffold project: package.json, lint, test, build tooling

Why: Every later task needs npm scripts (lint/test/build) and a
package.json declaring the runtime dependencies decided in the design
spec (express, pino) before any source file can be added.
What: package.json (ESM, Node >=18, bin entry), .nvmrc (20),
eslint.config.js (flat config), .prettierrc, vitest.config.js, and a
.gitignore covering node_modules/dist/logs.
How: ESLint flat config with @eslint/js recommended rules; Vitest
node environment (no DOM needed for backend-only code yet).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 2: XDG 路徑解析

**Files:**
- Create: `src/server/xdg-paths.js`
- Test: `tests/unit/server/xdg-paths.test.js`

**Interfaces:**
- Produces: `getConfigDir(env?, homedir?): string`, `getStateDir(env?, homedir?): string` — both accept optional overrides for testing, default to `process.env`/`os.homedir()`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/xdg-paths.test.js`:

```js
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { getConfigDir, getStateDir } from '../../../src/server/xdg-paths.js'

describe('getConfigDir', () => {
  it('uses XDG_CONFIG_HOME when set', () => {
    const dir = getConfigDir({ XDG_CONFIG_HOME: '/custom/config' }, '/home/user')
    expect(dir).toBe(path.join('/custom/config', 'md-viewer-server'))
  })

  it('falls back to ~/.config when XDG_CONFIG_HOME is not set', () => {
    const dir = getConfigDir({}, '/home/user')
    expect(dir).toBe(path.join('/home/user', '.config', 'md-viewer-server'))
  })
})

describe('getStateDir', () => {
  it('uses XDG_STATE_HOME when set', () => {
    const dir = getStateDir({ XDG_STATE_HOME: '/custom/state' }, '/home/user')
    expect(dir).toBe(path.join('/custom/state', 'md-viewer-server'))
  })

  it('falls back to ~/.local/state when XDG_STATE_HOME is not set', () => {
    const dir = getStateDir({}, '/home/user')
    expect(dir).toBe(path.join('/home/user', '.local', 'state', 'md-viewer-server'))
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/xdg-paths.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/xdg-paths.js'`

- [ ] **Step 3: 實作**

`src/server/xdg-paths.js`:

```js
import os from 'node:os'
import path from 'node:path'

const APP_DIR_NAME = 'md-viewer-server'

export function getConfigDir(env = process.env, homedir = os.homedir()) {
  const base = env.XDG_CONFIG_HOME || path.join(homedir, '.config')
  return path.join(base, APP_DIR_NAME)
}

export function getStateDir(env = process.env, homedir = os.homedir()) {
  const base = env.XDG_STATE_HOME || path.join(homedir, '.local', 'state')
  return path.join(base, APP_DIR_NAME)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/xdg-paths.test.js`
Expected: PASS（4 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/xdg-paths.js tests/unit/server/xdg-paths.test.js
git commit -m "$(cat <<'EOF'
Add XDG Base Directory path resolution

Why: Config and state data need to live in standard Linux paths
(not a hand-rolled ~/.md-viewer-server/) per the design spec, without
pulling in an extra dependency just for path lookup.
What: getConfigDir()/getStateDir() reading XDG_CONFIG_HOME/
XDG_STATE_HOME with fallback to ~/.config and ~/.local/state.
How: Both accept optional env/homedir params (default to
process.env/os.homedir()) purely so tests can inject values without
mutating global state.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 3: Log Rotation Stream

**Files:**
- Create: `src/server/log-rotation.js`
- Test: `tests/unit/server/log-rotation.test.js`

**Interfaces:**
- Produces: `createRotatingStream(filePath, {maxBytes?, maxFiles?}): {write(chunk: string): boolean}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/log-rotation.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRotatingStream } from '../../../src/server/log-rotation.js'

describe('createRotatingStream', () => {
  let dir
  let filePath

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-rotation-test-'))
    filePath = path.join(dir, 'server.log')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes chunks to the file', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 1024, maxFiles: 3 })
    stream.write('hello\n')
    stream.write('world\n')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello\nworld\n')
  })

  it('rotates to .1 when maxBytes is exceeded', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 10, maxFiles: 3 })
    stream.write('0123456789')
    stream.write('next-chunk')
    expect(fs.readFileSync(`${filePath}.1`, 'utf8')).toBe('0123456789')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('next-chunk')
  })

  it('keeps only maxFiles rotated files, discarding the oldest', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 5, maxFiles: 2 })
    stream.write('aaaaa')
    stream.write('bbbbb')
    stream.write('ccccc')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('ccccc')
    expect(fs.readFileSync(`${filePath}.1`, 'utf8')).toBe('bbbbb')
    expect(fs.readFileSync(`${filePath}.2`, 'utf8')).toBe('aaaaa')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/log-rotation.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/log-rotation.js'`

- [ ] **Step 3: 實作**

`src/server/log-rotation.js`:

```js
import fs from 'node:fs'

export function createRotatingStream(filePath, { maxBytes = 10 * 1024 * 1024, maxFiles = 3 } = {}) {
  let currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  let fd = fs.openSync(filePath, 'a')

  function rotate() {
    fs.closeSync(fd)
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = `${filePath}.${i}`
      if (fs.existsSync(src)) {
        const dest = `${filePath}.${i + 1}`
        if (i + 1 > maxFiles) {
          fs.unlinkSync(src)
        } else {
          fs.renameSync(src, dest)
        }
      }
    }
    fs.renameSync(filePath, `${filePath}.1`)
    fd = fs.openSync(filePath, 'a')
    currentSize = 0
  }

  return {
    write(chunk) {
      const buf = Buffer.from(chunk)
      if (currentSize > 0 && currentSize + buf.length > maxBytes) {
        rotate()
      }
      fs.writeSync(fd, buf)
      currentSize += buf.length
      return true
    },
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/log-rotation.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/log-rotation.js tests/unit/server/log-rotation.test.js
git commit -m "$(cat <<'EOF'
Add size-based log rotation stream

Why: The daemon runs in the background indefinitely; without rotation
server.log grows unbounded and can fill the disk over weeks/months of
uptime.
What: createRotatingStream(filePath, {maxBytes, maxFiles}) returning a
{write(chunk)} object pino can use directly as a destination — renames
the current file to .1/.2/... when it exceeds maxBytes, dropping the
oldest once maxFiles is reached.
How: Hand-rolled instead of pulling in pino-roll, to keep the
dependency count down per the offline-install constraint, and because
plain fs rename/open calls are trivial to unit test deterministically.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 4: Logger

**Files:**
- Create: `src/server/logger.js`
- Test: `tests/unit/server/logger.test.js`

**Interfaces:**
- Consumes: `createRotatingStream` from `src/server/log-rotation.js`
- Produces: `createLogger({logFilePath, level}): pino.Logger` — standard pino instance with `.info()`/`.warn()`/`.error()`/`.debug()`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/logger.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '../../../src/server/logger.js'

describe('createLogger', () => {
  let dir
  let logFilePath

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
    logFilePath = path.join(dir, 'server.log')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes JSON lines with the message and level', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.info({ requestId: 'abc123' }, 'server started')
    const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n')
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe('server started')
    expect(entry.requestId).toBe('abc123')
    expect(entry.level).toBe(30)
  })

  it('redacts the token field instead of logging it in plain text', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.info({ token: '1234' }, 'auth attempt')
    const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n')
    const entry = JSON.parse(lines[0])
    expect(entry.token).toBe('***')
  })

  it('does not write debug logs when level is info', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.debug('should not appear')
    const content = fs.readFileSync(logFilePath, 'utf8')
    expect(content).toBe('')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/logger.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/logger.js'`

- [ ] **Step 3: 實作**

`src/server/logger.js`:

```js
import pino from 'pino'
import { createRotatingStream } from './log-rotation.js'

export function createLogger({ logFilePath, level = 'info' }) {
  const stream = createRotatingStream(logFilePath)
  return pino(
    {
      level,
      redact: {
        paths: ['token'],
        censor: '***',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream
  )
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/logger.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/logger.js tests/unit/server/logger.test.js
git commit -m "$(cat <<'EOF'
Add pino-based structured logger with token redaction

Why: The design spec requires JSON-lines logging in English with
tokens never written in plaintext, backed by rotation instead of an
unbounded file.
What: createLogger({logFilePath, level}) wiring pino to the rotating
stream from log-rotation.js, with a redact rule that censors any
`token` field to "***".
How: pino accepts any object with a write(chunk) method as its
destination (not just its own SonicBoom), so the custom rotation
stream plugs in directly without an adapter.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 5: Config 管理

**Files:**
- Create: `src/server/config.js`
- Test: `tests/unit/server/config.test.js`

**Interfaces:**
- Produces: `generateToken(): string`, `getConfigPath(configDir): string`, `readConfig(configDir): object|null`, `loadOrCreateConfig(configDir, {roots, port}): {token, port, roots}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/config.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateToken,
  getConfigPath,
  readConfig,
  loadOrCreateConfig,
} from '../../../src/server/config.js'

describe('generateToken', () => {
  it('generates a 4-digit numeric string', () => {
    const token = generateToken()
    expect(token).toMatch(/^\d{4}$/)
  })
})

describe('config file management', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when config does not exist yet', () => {
    expect(readConfig(dir)).toBeNull()
  })

  it('creates a new config with a generated token on first call', () => {
    const config = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    expect(config.token).toMatch(/^\d{4}$/)
    expect(config.port).toBe(4173)
    expect(config.roots).toEqual(['/tmp/a'])
    expect(fs.existsSync(getConfigPath(dir))).toBe(true)
  })

  it('reuses the existing token on subsequent calls', () => {
    const first = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/b'], port: 4173 })
    expect(second.token).toBe(first.token)
  })

  it('updates roots on every call', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/b', '/tmp/c'], port: 4173 })
    expect(second.roots).toEqual(['/tmp/b', '/tmp/c'])
  })

  it('keeps the previous port when no new port is given', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 5000 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/a'] })
    expect(second.port).toBe(5000)
  })

  it('updates the port when a new one is explicitly given', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 5000 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 6000 })
    expect(second.port).toBe(6000)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/config.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/config.js'`

- [ ] **Step 3: 實作**

`src/server/config.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function generateToken() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0')
}

export function getConfigPath(configDir) {
  return path.join(configDir, 'config.json')
}

export function readConfig(configDir) {
  const configPath = getConfigPath(configDir)
  if (!fs.existsSync(configPath)) return null
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

export function loadOrCreateConfig(configDir, { roots, port }) {
  fs.mkdirSync(configDir, { recursive: true })
  const existing = readConfig(configDir)

  const config = {
    token: existing?.token ?? generateToken(),
    port: port ?? existing?.port ?? 4173,
    roots,
  }

  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(config, null, 2))
  return config
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/config.test.js`
Expected: PASS（7 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/config.js tests/unit/server/config.test.js
git commit -m "$(cat <<'EOF'
Add config.json read/create with stable token, per-start roots

Why: start/status/stop all need a single source of truth for the
daemon's token/port/roots, with the token staying stable across
restarts (per spec) while roots can change every time the daemon is
(re)started with different --root flags.
What: generateToken() (4-digit numeric), readConfig() (null if
missing), loadOrCreateConfig(configDir, {roots, port}) that creates
the file with a fresh token on first call, reuses the token on every
later call, always overwrites roots with the latest call's value, and
only overwrites port when explicitly given.
How: Plain JSON file, no schema library — the shape is small and
entirely internal to this project.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 6: Express App 骨架（health / shutdown）

**Files:**
- Create: `src/server/app.js`
- Test: `tests/unit/server/app.test.js`

**Interfaces:**
- Produces: `createApp({config, logger, getUptimeSeconds, packageVersion, onShutdown}): express.Application`
  - `config`: `{token: string, roots: string[]}`
  - `logger`: object with `.info(obj, msg)` / `.warn(obj, msg)`
  - `getUptimeSeconds`: `() => number`
  - `onShutdown`: `() => void`, called after responding 200 to a valid shutdown request

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/app.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../src/server/app.js'

function buildTestApp(overrides = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const onShutdown = vi.fn()
  const app = createApp({
    config: { token: '1234', roots: ['/tmp/a'] },
    logger,
    getUptimeSeconds: () => 42,
    packageVersion: '0.1.0',
    onShutdown,
    ...overrides,
  })
  return { app, logger, onShutdown }
}

describe('GET /api/health', () => {
  it('returns service info without requiring auth', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      service: 'md-viewer-server',
      version: '0.1.0',
      uptime: 42,
      roots: ['/tmp/a'],
    })
  })
})

describe('POST /api/shutdown', () => {
  it('rejects requests without a valid token', async () => {
    const { app, onShutdown } = buildTestApp()
    const res = await request(app).post('/api/shutdown').set('X-Auth-Token', 'wrong')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ errorCode: 'UNAUTHORIZED' })
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it('triggers onShutdown when the token matches', async () => {
    const { app, onShutdown } = buildTestApp()
    const res = await request(app).post('/api/shutdown').set('X-Auth-Token', '1234')
    expect(res.status).toBe(200)
    expect(onShutdown).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/app.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/app.js'`

- [ ] **Step 3: 實作**

`src/server/app.js`:

```js
import express from 'express'

export function createApp({ config, logger, getUptimeSeconds, packageVersion, onShutdown }) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({
      service: 'md-viewer-server',
      version: packageVersion,
      uptime: getUptimeSeconds(),
      roots: config.roots,
    })
  })

  app.post('/api/shutdown', (req, res) => {
    const token = req.header('X-Auth-Token')
    if (token !== config.token) {
      logger.warn({ auth: 'fail' }, 'rejected shutdown request')
      res.status(401).json({ errorCode: 'UNAUTHORIZED' })
      return
    }
    logger.info({ auth: 'ok' }, 'shutdown requested')
    res.json({ status: 'shutting-down' })
    onShutdown()
  })

  return app
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/app.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/app.js tests/unit/server/app.test.js
git commit -m "$(cat <<'EOF'
Add Express app with /api/health and /api/shutdown

Why: start/status/doctor need an unauthenticated way to confirm this
exact service is listening on a port (not some unrelated process),
and stop needs an authenticated way to trigger shutdown instead of
relying solely on a possibly-stale pid file.
What: createApp() builds an Express app with GET /api/health (no
auth, fixed {service, version, uptime, roots} shape) and POST
/api/shutdown (requires X-Auth-Token to match config.token, calls the
injected onShutdown callback on success).
How: onShutdown is injected rather than calling process.exit()
directly, keeping app.js pure and testable — entry.js (next task)
decides what graceful shutdown actually does.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 7: Server Entry Point

**Files:**
- Create: `src/server/entry.js`
- Test: `tests/integration/entry.test.js`

**Interfaces:**
- Consumes: `getConfigDir`/`getStateDir` (Task 2), `readConfig` (Task 5), `createLogger` (Task 4), `createApp` (Task 6)
- Produces: `startServer({logLevel?}): http.Server` — starts listening, writes `server.pid`, registers SIGTERM handler. Also runnable directly as `node src/server/entry.js`.

- [ ] **Step 1: 寫失敗測試**

`tests/integration/entry.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadOrCreateConfig } from '../../src/server/config.js'
import { startServer } from '../../src/server/entry.js'

describe('server entry', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('starts listening, writes a pid file, and responds to /api/health', async () => {
    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    loadOrCreateConfig(appConfigDir, { roots: ['/tmp/project'], port: 0 })

    const server = startServer({ logLevel: 'error' })
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()

    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    const body = await res.json()
    expect(body.service).toBe('md-viewer-server')
    expect(body.roots).toEqual(['/tmp/project'])

    const pidPath = path.join(stateHome, 'md-viewer-server', 'server.pid')
    expect(fs.existsSync(pidPath)).toBe(true)
    expect(fs.readFileSync(pidPath, 'utf8')).toBe(String(process.pid))

    await new Promise((resolve) => server.close(resolve))
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/integration/entry.test.js`
Expected: FAIL — `Cannot find module '../../src/server/entry.js'`

- [ ] **Step 3: 實作**

`src/server/entry.js`:

```js
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfigDir, getStateDir } from './xdg-paths.js'
import { readConfig } from './config.js'
import { createLogger } from './logger.js'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readPackageVersion() {
  const pkgPath = path.join(__dirname, '..', '..', 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

export function startServer({ logLevel = 'info' } = {}) {
  const configDir = getConfigDir()
  const stateDir = getStateDir()
  fs.mkdirSync(stateDir, { recursive: true })

  const config = readConfig(configDir)
  if (!config) {
    throw new Error(
      'config.json not found; the start command must create it before spawning entry.js'
    )
  }

  const logger = createLogger({
    logFilePath: path.join(stateDir, 'server.log'),
    level: logLevel,
  })

  const startedAt = Date.now()

  function gracefulShutdown(source) {
    logger.info({ source }, 'shutting down')
    server.close(() => {
      logger.info({}, 'server closed')
      process.exit(0)
    })
  }

  const app = createApp({
    config,
    logger,
    getUptimeSeconds: () => Math.floor((Date.now() - startedAt) / 1000),
    packageVersion: readPackageVersion(),
    onShutdown: () => gracefulShutdown('api'),
  })

  const server = http.createServer(app)

  process.on('SIGTERM', () => gracefulShutdown('signal'))

  server.listen(config.port, '0.0.0.0', () => {
    fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid))
    logger.info({ port: server.address().port }, 'server listening')
  })

  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/integration/entry.test.js`
Expected: PASS（1 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/entry.js tests/integration/entry.test.js
git commit -m "$(cat <<'EOF'
Add server entry point that binds, writes pid, and handles SIGTERM

Why: Something has to actually listen on the configured port, wire
the logger/app together, and write server.pid — this is what `start`
spawns as a detached child process.
What: startServer({logLevel}) reads config.json, creates the rotating
logger, builds the Express app with a gracefulShutdown callback wired
to both /api/shutdown and SIGTERM, binds to 0.0.0.0 (LAN-reachable,
per spec), and writes server.pid. Runnable standalone via `node
src/server/entry.js` (the import.meta.url check at the bottom) or
imported for tests.
How: pid file is written only as a stop fallback (see design spec) —
health-check-based detection is primary, so a stale/missing pid file
never blocks start or status from working correctly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 8: Daemon 探活與候選 IP 偵測

**Files:**
- Create: `src/server/daemon-utils.js`
- Test: `tests/unit/server/daemon-utils.test.js`

**Interfaces:**
- Produces: `checkHealth(port, {timeoutMs?}): Promise<{service, version, uptime, roots}|null>`, `listCandidateIPs(): string[]`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/daemon-utils.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { checkHealth, listCandidateIPs } from '../../../src/server/daemon-utils.js'

describe('checkHealth', () => {
  let server

  afterEach(() => {
    if (server) server.close()
  })

  it('returns the health payload when the service responds correctly', async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 5, roots: [] })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await checkHealth(port)
    expect(result).toEqual({ service: 'md-viewer-server', version: '0.1.0', uptime: 5, roots: [] })
  })

  it('returns null when nothing is listening on the port', async () => {
    const result = await checkHealth(65534, { timeoutMs: 200 })
    expect(result).toBeNull()
  })

  it('returns null when a different service responds on the port', async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ service: 'some-other-app' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await checkHealth(port)
    expect(result).toBeNull()
  })
})

describe('listCandidateIPs', () => {
  it('returns an array of IPv4 addresses', () => {
    const result = listCandidateIPs()
    expect(Array.isArray(result)).toBe(true)
    for (const ip of result) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    }
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/daemon-utils.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/daemon-utils.js'`

- [ ] **Step 3: 實作**

`src/server/daemon-utils.js`:

```js
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/daemon-utils.test.js`
Expected: PASS（4 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/daemon-utils.js tests/unit/server/daemon-utils.test.js
git commit -m "$(cat <<'EOF'
Add health-check probing and LAN IP detection for CLI commands

Why: start/status/stop/doctor all need to answer "is our daemon
actually running on this port" without trusting a pid file, and start
needs to print a real LAN address the user can click instead of a
bare localhost link that won't work from their Windows browser.
What: checkHealth(port, {timeoutMs}) fetches /api/health with a
timeout and verifies the `service` field before trusting the
response (so an unrelated process on the same port doesn't look like
a match); listCandidateIPs() returns non-internal IPv4 addresses from
all network interfaces.
How: AbortController-based timeout on fetch so a hung/firewalled port
doesn't block start/status for the default fetch timeout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 9: CLI 參數解析

**Files:**
- Create: `src/server/commands/cli-args.js`
- Test: `tests/unit/server/cli-args.test.js`

**Interfaces:**
- Produces: `parseArgs(argv: string[]): {command: string, roots: string[], port: number|undefined, debug: boolean}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/cli-args.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../../src/server/commands/cli-args.js'

describe('parseArgs', () => {
  it('parses the command name', () => {
    expect(parseArgs(['status']).command).toBe('status')
  })

  it('collects repeated --root flags', () => {
    const result = parseArgs(['start', '--root', '/a', '--root', '/b'])
    expect(result.roots).toEqual(['/a', '/b'])
  })

  it('parses --port as a number', () => {
    const result = parseArgs(['start', '--root', '/a', '--port', '5000'])
    expect(result.port).toBe(5000)
  })

  it('leaves port undefined when not given', () => {
    const result = parseArgs(['start', '--root', '/a'])
    expect(result.port).toBeUndefined()
  })

  it('parses --debug as a boolean flag', () => {
    expect(parseArgs(['start', '--root', '/a', '--debug']).debug).toBe(true)
    expect(parseArgs(['start', '--root', '/a']).debug).toBe(false)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/cli-args.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/commands/cli-args.js'`

- [ ] **Step 3: 實作**

`src/server/commands/cli-args.js`:

```js
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const roots = []
  let port
  let debug = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--root') {
      roots.push(rest[++i])
    } else if (arg === '--port') {
      port = Number(rest[++i])
    } else if (arg === '--debug') {
      debug = true
    }
  }

  return { command, roots, port, debug }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/cli-args.test.js`
Expected: PASS（5 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/commands/cli-args.js tests/unit/server/cli-args.test.js
git commit -m "$(cat <<'EOF'
Add CLI argv parser supporting repeated --root

Why: bin/cli.js needs to turn `start --root a --root b --port 5000`
into structured input for runStart(), and the design spec requires
--root to be repeatable for multi-root support.
What: parseArgs(argv) returning {command, roots, port, debug} — no
external arg-parsing library, since the surface is 4 subcommands with
a handful of flags each.
How: Plain index-based loop rather than a library, keeping the
dependency count down per the offline-install constraint.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 10: CLI - `start` 指令

**Files:**
- Create: `src/server/commands/start.js`
- Test: `tests/unit/server/start.test.js`

**Interfaces:**
- Consumes: `getConfigDir`/`getStateDir` (Task 2), `loadOrCreateConfig` (Task 5), `checkHealth`/`listCandidateIPs` (Task 8)
- Produces: `runStart({roots, port, debug}): Promise<Result>` where `Result` is one of:
  - `{outcome: 'no-valid-roots', skippedRoots: string[]}`
  - `{outcome: 'already-running', port, token, uptime, roots, ips, skippedRoots}`
  - `{outcome: 'start-failed', port, skippedRoots}`
  - `{outcome: 'started', port, token, ips, roots, skippedRoots}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/start.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStart } from '../../../src/server/commands/start.js'

describe('runStart', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'start-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'start-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('skips roots that do not exist and reports no-valid-roots if none are valid', async () => {
    const result = await runStart({ roots: ['/does/not/exist'], port: 5999 })
    expect(result.outcome).toBe('no-valid-roots')
    expect(result.skippedRoots).toEqual(['/does/not/exist'])
  })

  it('detects an already-running server via health check instead of spawning a new one', async () => {
    const validRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'start-root-'))
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          service: 'md-viewer-server',
          version: '0.1.0',
          uptime: 99,
          roots: [validRoot],
        })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await runStart({ roots: [validRoot], port })
    expect(result.outcome).toBe('already-running')
    expect(result.uptime).toBe(99)

    server.close()
    fs.rmSync(validRoot, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/start.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/commands/start.js'`

- [ ] **Step 3: 實作**

`src/server/commands/start.js`:

```js
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfigDir, getStateDir } from '../xdg-paths.js'
import { loadOrCreateConfig } from '../config.js'
import { checkHealth, listCandidateIPs } from '../daemon-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..')
const DEV_ENTRY_PATH = path.join(PROJECT_ROOT, 'src', 'server', 'entry.js')
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'bundle.js')

function resolveEntryPath() {
  // Prefer the source entry when this repo has one (development), so a
  // stale build never shadows the code actually being tested. A published
  // offline tarball ships dist/ without src/, so it falls back to the bundle.
  return fs.existsSync(DEV_ENTRY_PATH) ? DEV_ENTRY_PATH : BUNDLE_PATH
}

export async function runStart({ roots, port, debug = false }) {
  const validRoots = []
  const skippedRoots = []
  for (const root of roots) {
    try {
      fs.accessSync(root, fs.constants.R_OK)
      validRoots.push(path.resolve(root))
    } catch {
      skippedRoots.push(root)
    }
  }

  if (validRoots.length === 0) {
    return { outcome: 'no-valid-roots', skippedRoots }
  }

  const configDir = getConfigDir()
  const config = loadOrCreateConfig(configDir, { roots: validRoots, port })

  const existingHealth = await checkHealth(config.port)
  if (existingHealth) {
    return {
      outcome: 'already-running',
      port: config.port,
      token: config.token,
      uptime: existingHealth.uptime,
      roots: existingHealth.roots,
      ips: listCandidateIPs(),
      skippedRoots,
    }
  }

  const stateDir = getStateDir()
  fs.mkdirSync(stateDir, { recursive: true })

  const child = spawn(
    process.execPath,
    [resolveEntryPath(), ...(debug ? ['--debug'] : [])],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()

  const started = await waitForHealth(config.port)
  if (!started) {
    return { outcome: 'start-failed', port: config.port, skippedRoots }
  }

  return {
    outcome: 'started',
    port: config.port,
    token: config.token,
    ips: listCandidateIPs(),
    roots: validRoots,
    skippedRoots,
  }
}

async function waitForHealth(port, { retries = 20, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const health = await checkHealth(port, { timeoutMs: 300 })
    if (health) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/start.test.js`
Expected: PASS（2 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/commands/start.js tests/unit/server/start.test.js
git commit -m "$(cat <<'EOF'
Add `start` command logic: root validation, spawn, health polling

Why: This is the core of the CLI — validate --root paths, avoid
double-spawning when already running, and only report success once
the spawned process is actually answering health checks (not just
"the spawn call didn't throw").
What: runStart({roots, port, debug}) returns a discriminated result
object (no-valid-roots / already-running / start-failed / started)
that bin/cli.js will translate into console output in a later task.
Invalid/unreadable --root paths are skipped with a warning rather than
aborting the whole command, as long as at least one root is valid.
How: resolveEntryPath() prefers src/server/entry.js when present
(dev checkout) and falls back to dist/bundle.js (published tarball
with no src/) — this is exercised for real once the build script
exists (final task of this plan). waitForHealth() polls up to 2s
before declaring start-failed, since spawn() returning doesn't mean
the HTTP server has bound the port yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 11: CLI - `status` 指令

**Files:**
- Create: `src/server/commands/status.js`
- Test: `tests/unit/server/status.test.js`

**Interfaces:**
- Consumes: `getConfigDir` (Task 2), `readConfig` (Task 5), `checkHealth`/`listCandidateIPs` (Task 8)
- Produces: `runStatus(): Promise<Result>` where `Result` is one of:
  - `{outcome: 'not-configured'}`
  - `{outcome: 'not-running', port}`
  - `{outcome: 'running', port, token, uptime, roots, ips}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/status.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStatus } from '../../../src/server/commands/status.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runStatus', () => {
  let configHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'status-config-'))
    process.env.XDG_CONFIG_HOME = configHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runStatus()
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when config exists but health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5998 })
    const result = await runStatus()
    expect(result.outcome).toBe('not-running')
    expect(result.port).toBe(5998)
  })

  it('reports running with uptime and roots when health check succeeds', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          service: 'md-viewer-server',
          version: '0.1.0',
          uptime: 42,
          roots: ['/tmp/a'],
        })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runStatus()
    expect(result.outcome).toBe('running')
    expect(result.uptime).toBe(42)

    server.close()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/status.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/commands/status.js'`

- [ ] **Step 3: 實作**

`src/server/commands/status.js`:

```js
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/status.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/commands/status.js tests/unit/server/status.test.js
git commit -m "$(cat <<'EOF'
Add `status` command: config + health check, no pid file read

Why: The user needs a way to re-print the connection link if they
forgot it, and to see whether the daemon they configured is actually
alive right now.
What: runStatus() returns not-configured (no config.json yet),
not-running (config exists but /api/health didn't respond), or
running (with uptime/roots/candidate IPs from a live health check).
How: Reuses checkHealth/listCandidateIPs from daemon-utils.js — no
new detection logic, this command is purely config + health check
composed together.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 12: CLI - `stop` 指令

**Files:**
- Create: `src/server/commands/stop.js`
- Test: `tests/unit/server/stop.test.js`

**Interfaces:**
- Consumes: `getConfigDir`/`getStateDir` (Task 2), `readConfig` (Task 5), `checkHealth` (Task 8)
- Produces: `runStop(): Promise<Result>` where `Result` is one of:
  - `{outcome: 'not-configured'}`
  - `{outcome: 'not-running'}`
  - `{outcome: 'stopped', via: 'api'|'signal'}`
  - `{outcome: 'stop-failed'}`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/server/stop.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStop } from '../../../src/server/commands/stop.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runStop', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runStop()
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5997 })
    const result = await runStop()
    expect(result.outcome).toBe('not-running')
  })

  it('stops via the shutdown API when the server responds to health checks', async () => {
    let shutdownCalled = false
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        if (shutdownCalled) {
          res.statusCode = 503
          res.end()
        } else {
          res.end(
            JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
          )
        }
      } else if (req.url === '/api/shutdown' && req.method === 'POST') {
        shutdownCalled = true
        res.end(JSON.stringify({ status: 'shutting-down' }))
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runStop()
    expect(result.outcome).toBe('stopped')
    expect(result.via).toBe('api')

    server.close()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/unit/server/stop.test.js`
Expected: FAIL — `Cannot find module '../../../src/server/commands/stop.js'`

- [ ] **Step 3: 實作**

`src/server/commands/stop.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { getConfigDir, getStateDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'

export async function runStop() {
  const config = readConfig(getConfigDir())
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running' }
  }

  const stateDir = getStateDir()
  const pidPath = path.join(stateDir, 'server.pid')

  let apiCallSucceeded = false
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/shutdown`, {
      method: 'POST',
      headers: { 'X-Auth-Token': config.token },
    })
    apiCallSucceeded = res.ok
  } catch {
    apiCallSucceeded = false
  }

  if (apiCallSucceeded) {
    await waitUntilStopped(config.port)
    cleanupPidFile(pidPath)
    return { outcome: 'stopped', via: 'api' }
  }

  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim())
    try {
      process.kill(pid, 'SIGTERM')
      await waitUntilStopped(config.port)
      cleanupPidFile(pidPath)
      return { outcome: 'stopped', via: 'signal' }
    } catch {
      return { outcome: 'stop-failed' }
    }
  }

  return { outcome: 'stop-failed' }
}

function cleanupPidFile(pidPath) {
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath)
}

async function waitUntilStopped(port, { retries = 30, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const health = await checkHealth(port, { timeoutMs: 300 })
    if (!health) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/unit/server/stop.test.js`
Expected: PASS（3 個測試）

- [ ] **Step 5: Commit**

```bash
git add src/server/commands/stop.js tests/unit/server/stop.test.js
git commit -m "$(cat <<'EOF'
Add `stop` command: shutdown API primary, pid+SIGTERM as fallback

Why: Per the design spec, stop should prefer the authenticated
/api/shutdown endpoint for a clean graceful shutdown, and only fall
back to killing the pid when the server isn't responding (e.g. hung).
What: runStop() returns not-configured / not-running / stopped (via
'api' or 'signal') / stop-failed. Cleans up server.pid after a
confirmed stop either way.
How: Tries the API call first regardless of whether a pid file
exists; only reads/kills the pid if the API call didn't return ok
(covers both network failure and a non-2xx response).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 13: CLI 入口組裝

**Files:**
- Create: `bin/cli.js`

**Interfaces:**
- Consumes: `parseArgs` (Task 9), `runStart` (Task 10), `runStatus` (Task 11), `runStop` (Task 12)
- Produces: executable CLI, `md-viewer-server <start|status|stop> [options]`

- [ ] **Step 1: 實作**

`bin/cli.js`:

```js
#!/usr/bin/env node
import { parseArgs } from '../src/server/commands/cli-args.js'
import { runStart } from '../src/server/commands/start.js'
import { runStatus } from '../src/server/commands/status.js'
import { runStop } from '../src/server/commands/stop.js'

function printLinks(ips, port, token) {
  const targets = ips.length > 0 ? ips : ['127.0.0.1']
  for (const ip of targets) {
    console.log(`  http://${ip}:${port}?token=${token}`)
  }
}

function printStartResult(result) {
  for (const root of result.skippedRoots ?? []) {
    console.warn(`Skipped root (not found or not readable): ${root}`)
  }

  if (result.outcome === 'no-valid-roots') {
    console.error('No valid roots to serve. Aborting.')
    process.exitCode = 1
  } else if (result.outcome === 'already-running') {
    console.log(`Already running on port ${result.port} (uptime ${result.uptime}s).`)
    printLinks(result.ips, result.port, result.token)
  } else if (result.outcome === 'start-failed') {
    console.error('Server did not become healthy after starting. Check server.log.')
    process.exitCode = 1
  } else if (result.outcome === 'started') {
    console.log('Started.')
    printLinks(result.ips, result.port, result.token)
  }
}

function printStatusResult(result) {
  if (result.outcome === 'not-configured') {
    console.log('Not configured yet. Run `md-viewer-server start --root <path>` first.')
  } else if (result.outcome === 'not-running') {
    console.log(`Not running (configured port: ${result.port}).`)
  } else if (result.outcome === 'running') {
    console.log(`Running on port ${result.port}, uptime ${result.uptime}s.`)
    console.log(`Roots: ${result.roots.join(', ')}`)
    printLinks(result.ips, result.port, result.token)
  }
}

function printStopResult(result) {
  if (result.outcome === 'not-configured') {
    console.log('Not configured; nothing to stop.')
  } else if (result.outcome === 'not-running') {
    console.log('Not running.')
  } else if (result.outcome === 'stopped') {
    console.log(`Stopped (via ${result.via}).`)
  } else if (result.outcome === 'stop-failed') {
    console.error('Failed to stop the server.')
    process.exitCode = 1
  }
}

async function main() {
  const { command, roots, port, debug } = parseArgs(process.argv.slice(2))

  if (command === 'start') {
    printStartResult(await runStart({ roots, port, debug }))
  } else if (command === 'status') {
    printStatusResult(await runStatus())
  } else if (command === 'stop') {
    printStopResult(await runStop())
  } else {
    console.error(`Unknown command: ${command}\nUsage: md-viewer-server <start|stop|status> [options]`)
    process.exitCode = 1
  }
}

main()
```

- [ ] **Step 2: 手動驗證（尚無真正的 root 可用，先驗證錯誤路徑）**

Run: `node bin/cli.js start --root /does/not/exist`
Expected: 印出 `Skipped root (not found or not readable): /does/not/exist` 與 `No valid roots to serve. Aborting.`，exit code 1

Run: `node bin/cli.js status`

Run: `echo $?`
Expected: 前一行印出 `Not configured yet...`（因為上面的 start 從未真的建立 config），`echo $?` 顯示 `0`

- [ ] **Step 3: Commit**

```bash
git add bin/cli.js
git commit -m "$(cat <<'EOF'
Wire CLI entry point: argv -> command functions -> console output

Why: parseArgs/runStart/runStatus/runStop each exist as testable pure
functions, but nothing yet turns `md-viewer-server start --root X`
typed in a terminal into an actual call plus human-readable output.
What: bin/cli.js dispatches on the parsed command, calls the
corresponding run* function, and prints results (including candidate
LAN links with the token). Exits non-zero on no-valid-roots,
start-failed, and stop-failed.
How: Kept thin on purpose — all decision logic already lives in the
tested command modules, this file only formats their output.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 14: esbuild 打包腳本

**Files:**
- Create: `scripts/build.js`

**Interfaces:**
- Produces: `dist/bundle.js` — single-file bundle of `src/server/entry.js` and all its dependencies

- [ ] **Step 1: 實作**

`scripts/build.js`:

```js
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

await build({
  entryPoints: [path.join(root, 'src', 'server', 'entry.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: path.join(root, 'dist', 'bundle.js'),
  banner: { js: '#!/usr/bin/env node' },
})

console.log('Built dist/bundle.js')
```

- [ ] **Step 2: 執行並驗證產物**

Run: `npm run build`
Expected: 印出 `Built dist/bundle.js`

Run: `ls -la dist/bundle.js`
Expected: 檔案存在，大小 > 0

- [ ] **Step 3: Commit**

```bash
git add scripts/build.js
git commit -m "$(cat <<'EOF'
Add esbuild bundling script producing dist/bundle.js

Why: The offline-install target (no npm install on the destination
machine) requires a single self-contained JS file with all
dependencies inlined, per the design spec.
What: scripts/build.js bundles src/server/entry.js (and everything it
imports — express, pino, our own modules) into dist/bundle.js via
esbuild, targeting node18, ESM format.
How: express/pino are pure JS with no native bindings, so a
straightforward esbuild bundle works without special-casing any
dependency as external.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

### Task 15: Integration Test — 完整 CLI 生命週期與 Bundle 驗證

**Files:**
- Create: `tests/integration/cli-lifecycle.test.js`

**Interfaces:**
- Consumes: `bin/cli.js` (Task 13, spawned as a real child process), `dist/bundle.js` (Task 14)

- [ ] **Step 1: 寫測試**

`tests/integration/cli-lifecycle.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'cli.js')
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'bundle.js')

// Spread test ports across a range keyed on pid so parallel CI runs don't collide.
const TEST_PORT = 20000 + (process.pid % 10000)

describe('CLI lifecycle: start -> status -> stop', () => {
  let configHome
  let stateHome
  let testRoot
  let env

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-root-'))
    env = {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      XDG_STATE_HOME: stateHome,
    }
  })

  afterEach(async () => {
    try {
      await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env })
    } catch {
      // already stopped, ignore
    }
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('starts, reports running status, then stops cleanly', async () => {
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    expect(startOut).toContain('Started.')

    const { stdout: statusOut } = await execFileAsync(process.execPath, [CLI_PATH, 'status'], {
      env,
    })
    expect(statusOut).toContain('Running on port')

    const { stdout: stopOut } = await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env })
    expect(stopOut).toContain('Stopped')

    const { stdout: statusAfterStop } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'status'],
      { env }
    )
    expect(statusAfterStop).toContain('Not running')
  })

  it('running start twice does not spawn a second process', async () => {
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    expect(stdout).toContain('Already running')
  })
})

describe('dist/bundle.js (built artifact)', () => {
  let configHome
  let stateHome
  let child

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-state-'))
  })

  afterEach(() => {
    if (child) child.kill('SIGTERM')
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('serves /api/health when run directly (no src/ involved)', async () => {
    expect(fs.existsSync(BUNDLE_PATH)).toBe(true)

    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    fs.writeFileSync(
      path.join(appConfigDir, 'config.json'),
      JSON.stringify({ token: '1234', port: TEST_PORT + 1, roots: ['/tmp/project'] })
    )

    child = spawn(process.execPath, [BUNDLE_PATH], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        XDG_STATE_HOME: stateHome,
      },
      stdio: 'ignore',
    })

    const health = await waitForHealth(TEST_PORT + 1)
    expect(health.service).toBe('md-viewer-server')
    expect(health.roots).toEqual(['/tmp/project'])
  })
})

async function waitForHealth(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return res.json()
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server on port ${port} never became healthy`)
}
```

- [ ] **Step 2: 執行完整流程並確認全部通過**

Run: `npm run build && npm run test:integration`
Expected: 所有 integration 測試（`entry.test.js`、`cli-lifecycle.test.js`）PASS

- [ ] **Step 3: 執行完整 unit + integration 測試與 lint 做最終驗證**

Run: `npm run lint && npm run test:unit && npm run build && npm run test:integration`
Expected: 全部通過，exit code 0

- [ ] **Step 4: Commit**

```bash
git add tests/integration/cli-lifecycle.test.js
git commit -m "$(cat <<'EOF'
Add end-to-end CLI lifecycle test and bundle smoke test

Why: Every prior task tested its own module in isolation with mocked
health servers; nothing yet exercised the real `md-viewer-server
start/status/stop` commands as a user would run them, or confirmed
the esbuild bundle produced in the previous task actually runs
standalone.
What: cli-lifecycle.test.js spawns bin/cli.js as a real child process
through start -> status -> stop and asserts on stdout; a second test
spawns dist/bundle.js directly (bypassing bin/cli.js's dev-vs-bundle
resolution) with a hand-written config.json and confirms it answers
/api/health correctly.
How: Test port is derived from process.pid to reduce collisions when
tests run in parallel across CI jobs, since the design spec forbids
auto-selecting a different port on conflict (so tests can't rely on
port 0 auto-assignment the way entry.test.js does).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KCkr3UUhi36YHAEiAAhp5L
EOF
)"
```

---

## Definition of Done

- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes (all modules in `src/server/`)
- [ ] `npm run build` produces `dist/bundle.js`
- [ ] `npm run test:integration` passes (real process spawning, both dev entry and bundle)
- [ ] `node bin/cli.js start --root <valid-dir>` prints a clickable LAN link with token; running it twice reports "Already running" instead of spawning a duplicate
- [ ] `node bin/cli.js status` reflects real state without ever reading `server.pid` as its primary signal
- [ ] `node bin/cli.js stop` shuts the server down via the API and cleans up `server.pid`
