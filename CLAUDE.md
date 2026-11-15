# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build, lint, package manager, or test setup. The app is static files: `index.html`, `app.js`, `style.css`. To try a change, open `index.html` in a browser (or serve the directory with any static file server) and reload. Nothing is compiled or bundled.

## Architecture

BoolWiz is a single-page truth-table and Karnaugh-map (K-map) tool in vanilla JS with no dependencies.

- **`index.html`** holds all markup: the variable-count segmented buttons, the variable-name inputs, the truth table and K-map containers, the saved-tables panel, and an `<dialog id="export-dlg">` with a canvas. The DOM is mostly empty shells that `app.js` fills in at runtime.
- **`app.js`** is one IIFE with all state and logic. Key pieces:
  - **Single source of truth:** `n` (variable count, 2–5), `names` (variable names), `outNames` (one name per output bit), and `outputs` (`outputs[b][i]`: an array of `outputs.length` = output width columns, each of length `2^n`, entries `null` | `0` | `1` | `'X'`, indexed by minterm). Width is `outputs.length`, 1–`MAX_W` (8). Both views are derived from `outputs`.
  - **Two synchronized views:** `buildTable()` and `buildKmap()` create the DOM. `ttEls[b][i]` maps output bit and minterm to button; `kEls[i]` maps minterm to K-map button and exists only when width is 1. `setOutput(i, v, b)` updates `outputs[b]`, repaints the cell via `paintCell`, and refreshes the stats line. Any new edit path should go through `setOutput`, not write `outputs` directly.
  - **Output width:** `setW(newW)` keeps existing bit columns and adds or drops trailing ones. The K-map panel and its export section are hidden or left out when width is greater than 1 (`syncKmapVisibility`, `renderExport`), and `buildKmap` returns early in that case.
  - **Rebuild vs. repaint:** Changing the variable count (`setN`) or loading a record (`loadRecord`) resets state and calls `rebuildAll()`. Renaming a variable only refreshes headers, rebuilds the K-map, and repaints.
  - **Bit ordering:** The first variable is the most significant bit of the minterm index. K-map rows and columns use Gray code (`gray()`). Keep `buildKmap` and `drawKmap` on the same index formula, `(((rc << c) | cc) << extra) | p`, or the on-screen map and the export will disagree.
  - **Layout for 2–5 variables:** `layoutFor(count)` gives the K-map row and column variable counts. A fifth variable adds a second map panel, one per value of `E`, instead of a larger grid.
  - **Export:** `renderExport()` draws the truth table and K-map onto a canvas using fixed metrics in the `EX` object, then `downloadExport()` saves it as a PNG. It is drawn separately from the DOM, so visual changes to the screen usually need matching changes in the `draw*` functions. For 4 or more variables, the truth table is split into two side-by-side halves. Each output bit is its own column; the K-map is left out when there is more than one.
  - **Persistence:** Saved tables go in `localStorage` under `boolwiz.tables.v1` as an array of records `{name, savedAt, n, names, outNames, outCols}`, where `outCols` is `outputs`. Older records hold a single column in `outputs` and an `outName`. `recordCols()` reads both shapes, and `readStore()` and `isValidRecord()` filter out malformed entries. Every storage call is wrapped in try/catch. Legacy records load without a storage-key bump, so keep `recordCols()` working when changing the shape again.
  - **Input rules:** Variable names must match `NAME_RE` (a letter, optionally `_` followed by 1–2 digits, max 4 characters) and be unique case-insensitively. Output names follow the same rules and must differ from the active variable names and from each other. `fixOutNames()` repairs them on count or width change and on load. `NAME_RE`, `NAME_MAX`, and the help text in `index.html` must agree.
- **`style.css`** is strictly black and white by design (the file's first comment says so). Do not add colors. Buttons, headings, and cell states all use borders, fills, and hatching.

## Conventions

- Keep it dependency-free and plain ES2015+ in a single IIFE, as it is now.
- Cell state classes are `st-blank`, `st-0`, `st-1`, and `st-x`, and the same classes are used on both the truth table and the K-map.
