# Contributing to Tacet

Thanks for considering a contribution. This is a small, opinionated project — clarity and simplicity are the bar.

## Quick links

- [Open an issue](../../issues/new/choose) for bugs or feature requests.
- Read [README.md](README.md) for setup and architecture.
- Read [docs/PHASE_TRACKER.md](docs/PHASE_TRACKER.md) for what's planned.

## Development setup

```bash
git clone <your-fork>
cd tacet
npm install
cp .env.example .env       # only needed for Online mode if you skip the in-app settings flow
npm run dev                # web at http://localhost:3000
```

For the desktop shell:

```bash
npm run desktop
```

For offline-mode work, the model downloads on first use (~660 MB). See README for storage paths.

## Conventions

### Code style

- Plain ES modules, no bundler. The browser loads `public/*.js` directly.
- 2-space indent, double quotes, semicolons (matches `.editorconfig`).
- Prefer editing existing files over creating new ones.
- Default to no comments; only add one when the **why** is non-obvious.
- Avoid premature abstractions. Three similar lines beat a generic helper.

### Architecture rules

- Both transcribers (`transcribers/deepgram.js`, `transcribers/offline-nemotron.js`) emit the same normalized message shape:
  ```js
  { type: "transcript", text, isFinal, speechFinal, timestamp }
  ```
  If you add a new engine, conform to that shape — don't make the renderer engine-aware.
- The renderer never talks to engines directly. Audio + control go over the local WebSocket; sessions and model-status go over HTTP.
- Settings live in `localStorage` keyed by `tacet.settings.v1`. Bump the suffix if you change the schema in a non-additive way.

### Testing

There are no unit tests yet. Before opening a PR:

```bash
npm run check
```

This runs `node --check` on every JS module. If you change the renderer or any UI flow, smoke-test the welcome wizard, online streaming, offline streaming, history modal, and settings modal in a real browser.

## Commit + PR flow

1. Branch from `main`: `git checkout -b feature/short-description`.
2. Keep commits focused. A good commit message is one sentence about *why*, not *what*.
3. Run `npm run check` before pushing.
4. Open a PR using the template. Include a screenshot or short clip if the change is user-visible.
5. CI runs `npm run check` on push and PR — make sure it's green.

## Things this project intentionally avoids

- TypeScript, build tools, frameworks. The project is small enough not to need them.
- Cloud-only features in Offline mode. Offline must work fully air-gapped.
- Logging API keys, transcripts, or any user content to stdout/files.

## Reporting a security issue

Please **do not** open a public issue for security reports. Email the maintainer directly. We'll acknowledge within 72 hours.
