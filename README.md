# OpenLottie Studio

A free, open, fully client-side Lottie animation editor.

**✓ Unlimited exports · ✓ No watermark · ✓ No account · ✓ Your files never leave your browser**

Every major Lottie tool now paywalls the export button: Rive moved *all* exports to paid plans
(Oct 2025), LottieFiles caps free Creator exports at five, Lottielab embeds a watermark layer
inside free exports. This editor is the opposite: everything runs locally in your browser and
everything you make is yours.

## Features

- **Shape layers** — rectangles, ellipses, stars with fill color, size, corner radius controls
- **Pen tool** — draw free bezier paths on the canvas (click for corners, drag for curves,
  close or leave open), then edit them: drag vertices, drag tangent handles (Alt to break
  symmetry), Alt+drag a corner to make it smooth, Alt+click to delete a point, click a
  segment midpoint to insert one
- **Text layers** — editable content, web-safe fonts, size, color, alignment, line height, tracking
- **Fills** — solid colors and linear/radial gradients with editable stops and angle
- **Keyframe animation** — position, scale, rotation, opacity with easing presets and a
  draggable cubic-bezier curve editor
- **Timeline** — scrubbing, playback, per-property keyframe rows, drag diamonds to retime,
  alt+click to delete keys
- **Canvas editing** — drag the selected layer directly on the canvas
- **Strokes** — add/remove strokes with color and width on any shape layer
- **Import** — Lottie JSON and dotLottie (`.lottie`) files, including bundled images
- **Export** — Lottie JSON, dotLottie, GIF, and WebM video (all rendered in the browser)
- **Undo/redo**, sample templates, layer rename/duplicate/reorder

## Run it

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # production build in dist/
```

`dist/` is fully static — host it anywhere (GitHub Pages, Netlify, a USB stick).

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → (+Shift) | Step 1 (10) frames |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Delete | Delete selected layer |
| Double-click layer | Rename |
| Alt+click keyframe | Delete keyframe |

## Stack

Vite · React 18 · TypeScript · zustand + immer (state/undo) · lottie-web (preview & GIF
rasterizing) · fflate (dotLottie zip) · gifenc (GIF encoding). No backend, no telemetry.
