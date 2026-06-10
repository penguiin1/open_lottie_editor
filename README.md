# OpenLottie Studio

OpenLottie Studio is a free, open, fully client-side Lottie animation editor.
It runs in the browser, exports without watermarks, and does not require an
account or backend service.

Your files stay local: importing, editing, previewing, and exporting all happen
inside the browser.

## Features

- Shape layers: rectangles, ellipses, stars, custom pen paths, fills, strokes,
  size controls, corner radius, and star options.
- Pen and path editing: click to draw, double-click or press Enter to finish,
  drag vertices, drag Bezier handles, insert midpoint vertices, and delete
  points.
- Text layers: edit copy, font, size, color, alignment, line height, and
  tracking.
- Paint controls: solid fills, linear gradients, radial gradients, editable
  stops, gradient angle, stroke color, and stroke width.
- Animation tools: transform keyframes for position, scale, rotation, and
  opacity with easing presets and a cubic-Bezier easing editor.
- Trim paths: add animatable start, end, and offset values for line-drawing
  effects.
- Masks: add layer masks, edit mask paths on the canvas, set add/subtract/
  intersect/none modes, and invert masks.
- Track mattes: use the layer above as an alpha, alpha-inverted, luma, or
  luma-inverted matte.
- Precomps: step into precomp layers with breadcrumb navigation and edit their
  contents directly.
- Timeline: scrub, play, retime layer bars, view aggregate keyframes, expand
  selected properties, drag keyframe diamonds, and Alt-click to delete keys.
- Import: open Lottie JSON and dotLottie files, including bundled image assets.
- Export: save Lottie JSON, dotLottie, GIF, and WebM video from the browser.
- Workflow: undo/redo, sample templates, layer rename, duplicate, reorder, and
  delete.

## Getting Started

```bash
npm install
npm run dev
```

The dev server is configured by Vite. By default it prints a local URL such as
`http://localhost:5173`.

## Build

```bash
npm run build
```

The production build is written to `dist/`. It is a static site and can be
hosted on GitHub Pages, Netlify, Vercel, or any static file host.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Space | Play or pause |
| Left / Right | Step one frame |
| Shift + Left / Right | Step ten frames |
| Ctrl + Z | Undo |
| Ctrl + Shift + Z / Ctrl + Y | Redo |
| Delete / Backspace | Delete selected layer |
| Double-click layer | Rename layer |
| Alt-click keyframe | Delete keyframe |
| Enter in pen mode | Finish open path |
| Esc in pen mode | Cancel path |

## Project Structure

```text
src/
  components/   React UI for the editor panels, canvas, timeline, and export
  io/           Lottie, dotLottie, GIF, WebM, and download helpers
  lottie/       Lottie document, path, paint, text, easing, and prop utilities
  samples/      Built-in sample animations
  store/        Zustand editor state, history, and editing actions
  types/        Lottie type definitions
```

## Stack

- Vite
- React 18
- TypeScript
- Zustand and Immer
- lottie-web
- fflate
- gifenc

No backend, no telemetry, and no paid export gate.
