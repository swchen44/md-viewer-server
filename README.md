# MD Viewer Server

[繁體中文](README.zh-TW.md)

> **Status: early implementation (0.1.0).** The daemon and browser UI are implemented and can be run from this repository. npm and offline release artifacts are not published yet, so the source checkout quick start below is the current installation path.

A background daemon that serves a browser UI for viewing, searching, and editing Markdown/HTML files over your LAN. It is intended for the workflow where you SSH into a Linux machine, have an AI agent write Markdown/HTML there, and want to see the rendered result immediately from another browser.

## Features

- **CLI daemon**: `start`, `stop`, `status`, `doctor`, `add-root`, `open`, `close`, and `tabs`
- **Live reload**: file changes are broadcast to connected browsers over WebSocket
- **View, search, edit**: view/edit/split modes for text documents, filename/content/both search, regex search, open-tab search, and an outline panel with title/content/both filtering
- **Markdown and diagrams**: Markdown extensions, GFM, Mermaid code blocks, `.mmd`, `.puml`, and `.plantuml`
- **Multi-root support**: configure roots at startup and add another root while the daemon is running
- **Conflict protection**: optimistic-lock checks prevent an edit from silently overwriting a newer file; optional `.bak` backups are available
- **Safety controls**: path traversal checks, sandboxed HTML rendering, privacy mode, and server-side PlantUML permission enforcement
- **Customizable UI**: light/dark/system themes, accent color, editor settings, custom CSS slots, and five UI languages (`en`, `zh-TW`, `zh-CN`, `ja`, `ko`)

## Requirements

- Node.js `>=18.0.0` (`.nvmrc` and CI use Node 20)
- A readable directory to serve
- A browser on the same network when connecting from another machine

## Quick start from source

```bash
git clone <repository-url>
cd md-viewer-server
npm ci
npm run build
node bin/cli.js start --root /path/to/your/markdown
```

`start` prints one or more browser URLs containing the authentication token. Open the URL for the machine you are using. The default port is `4173`; omit `--root` to serve the command's current working directory.

The daemon binds to `0.0.0.0` so other devices on the LAN can connect. The token in the printed URL grants access to the configured roots. Treat the URL as a secret and do not paste it into public logs or issue reports. The daemon does not provide HTTPS; use it on a trusted network or put it behind an appropriate TLS reverse proxy.

## CLI reference

```text
md-viewer-server start [--root <path> ...] [--port <port>] [--debug] [--rotate-token]
md-viewer-server stop
md-viewer-server status
md-viewer-server doctor
md-viewer-server add-root <path>
md-viewer-server open <path>
md-viewer-server close <path>
md-viewer-server tabs
```

- `start` skips roots that do not exist or are not readable and reports them. If no valid root remains, it aborts.
- `--debug` is accepted as a reserved flag, but it does not change daemon runtime logging yet.
- `add-root` requires a running daemon, persists the new root, and starts watching it immediately.
- `open` never adds a root implicitly. If the path is outside configured roots, run `add-root <folder>` first.
- `close` accepts a full path or a filename. If a filename matches more than one open tab, retry with a full path.
- `--rotate-token` generates a new token and restarts the daemon when needed. Existing browser sessions using the old token must reconnect with the new URL.

## Privacy and file limits

- Privacy mode forces remote content blocking, PlantUML sending off, and HTML scripts off, including for direct API calls.
- PlantUML sending is disabled by default. Enabling it sends diagram source to the configured PlantUML server.
- `.html` files are rendered in a sandboxed iframe. Script execution is off by default.
- Files larger than 5 MiB are not fully read, rendered, or edited.
- Files detected as non-UTF-8 are view-only.
- This is not a multi-user collaborative editor. File edits use conflict detection rather than CRDT/OT.

## Configuration and logs

The daemon follows XDG directories:

- Config: `$XDG_CONFIG_HOME/md-viewer-server/config.json`, or `~/.config/md-viewer-server/config.json`
- State: `$XDG_STATE_HOME/md-viewer-server/server.pid` and `server.log`, or `~/.local/state/md-viewer-server/`

Run `md-viewer-server doctor` when startup, permissions, port, or watcher checks need diagnosis.

## Tests

```bash
npm run test:e2e
```

The Playwright E2E suite builds the application and starts an isolated test server. For local browser setup and failure diagnostics, see the [Developer Guide](docs/DEVELOPER.md#buildtestlint).

## Release status

`npm run build` creates `dist/frontend/`, `dist/bundle.js`, and `dist/regex-worker.js`. A self-contained offline tarball and the published `npx md-viewer-server` flow are planned release artifacts, not current installation methods. Do not document a release URL or use `npx` until that package/version has been published.

## Reporting issues

Please use the issue template (bug report) and include:

- Steps to reproduce
- What you expected to happen
- What actually happened
- Your environment: server OS, Node.js version, browser + version, and release tag or commit
- Relevant output from `md-viewer-server doctor` and `server.log` when applicable
