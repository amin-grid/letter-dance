# Letter Dance

An interactive text animation where clicking a button triggers a cascading
letter‑jump effect. Type any text, hit **Click Me**, and watch each letter leap
in sequence with real gravity physics.

**[➤ Live demo](https://amin-grid.github.io/letter-dance/)** (via GitHub Pages)

![Letter Dance](https://img.shields.io/badge/HTML-CSS-JS-orange) ![Tests](https://img.shields.io/badge/tests-15%20passing-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## How it works

The app uses **Layer Swapping / Temporal Decoupling**: editing and animation are
separated in *time*, so only one surface is ever active —

```
idle ──(button click)──▶ animating ──(dance resolves)──▶ idle
```

| State | What happens |
|---|---|
| **Idle** (default) | A 100% native `<input>`: OS caret, native selection, native placeholder. The animation stage is dormant and empty — zero per-keystroke work. |
| **Animating** | The input yields visually, an ephemeral stage snapshots the text into `.letter` spans, and a gravity cascade (`vy += g·dt`) jumps them in sequence. |
| **Cleanup** | Once the `Promise.all` cascade resolves, the stage is torn down completely and the input is restored untouched. |

`config.js`, `dance.js`, and `ripple.js` are untouched by the refactor — only the
editing surface and its orchestration were replaced. Full details, antipattern
catalogue, and complete sources: **[REFACTOR.md](REFACTOR.md)**.

## Project structure

```
├── index.html           # Native input + dormant stage + button
├── css/style.css        # Fonts, state-gated stage, button, ripple
├── js/
│   ├── main.js          # idle → animating → idle state machine
│   ├── config.js        # Constants (physics, timing, limits)
│   ├── stage.js         # Ephemeral stage: build on click, teardown after
│   ├── dance.js         # Promise-based physics jumps + cascade
│   ├── ripple.js        # Material-style click ripple
│   └── maxlength.js     # Dynamic maxlength via canvas measurement
├── fonts/               # Local Fredoka .ttf (offline support)
└── tests/               # Playwright specs (15 tests)
```

## Quick start

```bash
# Serve locally → http://127.0.0.1:8080
npm start          # or: python3 -m http.server 8080

# Install deps and run the test suite
npm install
npx playwright install --with-deps chromium
npm test           # 15/15 passing ✅
```

No build step — plain HTML/CSS/JS loaded as native ES modules.

## License

[MIT](LICENSE) © 2026 Amin Mozaffari
