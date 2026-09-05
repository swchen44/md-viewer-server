# MD Viewer Server

[繁體中文](README.zh-TW.md)

> **Status: design phase.** The design spec is finalized; implementation hasn't started yet. This README describes the planned feature set — check back for install instructions once a release is published, or watch [the design spec](docs/superpowers/specs/2026-09-05-md-viewer-server-design.md) for the source of truth.

A background daemon that runs on Linux and serves a browser UI for viewing, searching, and editing Markdown/HTML files over your LAN — built for the workflow where you SSH into a Linux box, have an AI agent write Markdown/HTML there, and want to see the rendered result immediately from a Windows Chrome browser instead of round-tripping files back to your desktop.

## Features (planned)

- **CLI daemon**: `start` / `stop` / `status` / `doctor`, no root required, works fully offline (no `npm install` needed on the target machine — ships as a self-contained bundle)
- **Live reload**: file changes on disk (from your AI agent, an editor, anything) push to every connected browser over WebSocket
- **View, search, edit**: multi-tab interface (view / edit / split), full-text and filename search with regex support, an outline panel for jumping to headings
- **Multi-root support**: point the daemon at several folders at once
- **Safety by design**: `.html` files render inside a sandboxed iframe (can't read your session token even if you allow script execution), path-traversal-safe file addressing, optimistic-lock conflict detection when a file changes underneath an open edit
- **Customizable**: light/dark themes, accent colors, custom CSS presets (editable, extensible), 5 UI languages (en / zh-TW / zh-CN / ja / ko)
- **Privacy mode**: one switch to block remote images/media and disable PlantUML/script execution

## Installation

Two install paths are planned:

- **Offline / air-gapped**: download `md-viewer-server-<version>.tar.gz` from [Releases](../../releases), extract anywhere in your home directory (no root needed), run `./md-viewer-server start --root <path>`
- **With network access**: `npx md-viewer-server start --root <path>`

Full CLI reference and API docs: see [Developer Guide](docs/DEVELOPER.md).

## Reporting issues

Please use the issue template (bug report) and include:

- Steps to reproduce
- What you expected to happen
- What actually happened
- Your environment: OS, Node.js version, browser + version

Vague reports without repro steps are hard to act on — the template will prompt you for these fields.
