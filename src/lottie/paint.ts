import type { LottieLayer } from '../types/lottie'
import { getValue } from './props'

// ---------------------------------------------------------------------------
// Solid + gradient fill handling.
//
// A solid fill item:    { ty: 'fl', c: {a,k:[r,g,b,a]}, o, r, bm, nm }
// A gradient fill item: { ty: 'gf', t: 1|2 (1 linear, 2 radial),
//                         g: { p: stopCount, k: {a:0, k:[pos,r,g,b, ...]} },
//                         s: {a:0,k:[x,y]}, e: {a:0,k:[x,y]}, o, r, bm, nm }
// Coordinates are in shape space (our shapes are centered on [0,0]).
// ---------------------------------------------------------------------------

export interface GradientStop {
  pos: number
  color: [number, number, number]
}

export interface PaintInfo {
  kind: 'solid' | 'linear' | 'radial'
  /** For gradients this is the first stop's color. */
  color: [number, number, number]
  /** Empty for solid fills. */
  stops: GradientStop[]
  /** Degrees in [0, 360); 0 for solid fills. */
  angle: number
  /** Trailing [pos, alpha] pairs past the RGB stops, preserved on rebuild. */
  alphaTail?: number[]
}

/** Gradients whose stop data or endpoints are keyframed can't round-trip
 *  through PaintInfo — editing them would destroy the animation. */
export function isAnimatedGradient(paint: any): boolean {
  return (
    paint?.ty === 'gf' &&
    (paint.g?.k?.a === 1 || paint.s?.a === 1 || paint.e?.a === 1)
  )
}

const GEOMETRY_TYPES = ['sh', 'rc', 'el', 'sr']

function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback
}

/** Locate the first item matching `types` in layer.shapes, searching the
 *  top level first and then one 'gr' group deep. Returns the containing
 *  array and index so callers can replace in place. */
function findItem(
  layer: LottieLayer,
  types: string[],
): { arr: any[]; idx: number } | undefined {
  const shapes = layer.shapes
  if (!Array.isArray(shapes)) return undefined
  for (let i = 0; i < shapes.length; i++) {
    if (types.includes(shapes[i]?.ty)) return { arr: shapes, idx: i }
  }
  for (const item of shapes) {
    if (item?.ty === 'gr' && Array.isArray(item.it)) {
      for (let i = 0; i < item.it.length; i++) {
        if (types.includes(item.it[i]?.ty)) return { arr: item.it, idx: i }
      }
    }
  }
  return undefined
}

/** First fill ('fl') or gradient fill ('gf') item on the layer, searching
 *  top-level shapes then one group deep. */
export function findPaint(layer: LottieLayer): any | undefined {
  const loc = findItem(layer, ['fl', 'gf'])
  return loc ? loc.arr[loc.idx] : undefined
}

/** First stroke ('st') item on the layer, same search as findPaint. */
export function findStroke(layer: LottieLayer): any | undefined {
  const loc = findItem(layer, ['st'])
  return loc ? loc.arr[loc.idx] : undefined
}

/** Normalized description of a fill item (solid or gradient). */
export function getPaintInfo(paint: any): PaintInfo {
  if (paint?.ty === 'gf') {
    const kind: PaintInfo['kind'] = paint.t === 2 ? 'radial' : 'linear'

    // Stop data: flat [pos, r, g, b, ...] array. Files exported with alpha
    // stops append [pos, a] pairs past 4*p entries — ignore those.
    const stopCount = Math.max(0, Math.floor(Number(paint.g?.p)) || 0)
    const flat: number[] = paint.g?.k ? getValue(paint.g.k, 0) : []
    const stops: GradientStop[] = []
    for (let i = 0; i < stopCount; i++) {
      const base = i * 4
      if (base + 3 >= flat.length) break
      stops.push({
        pos: finiteOr(Number(flat[base]), 0),
        color: [
          finiteOr(Number(flat[base + 1]), 0),
          finiteOr(Number(flat[base + 2]), 0),
          finiteOr(Number(flat[base + 3]), 0),
        ],
      })
    }

    const s = getValue(paint.s, 0)
    const e = getValue(paint.e, 0)
    const sx = finiteOr(s[0] ?? 0, 0)
    const sy = finiteOr(s[1] ?? 0, 0)
    const ex = finiteOr(e[0] ?? 0, 0)
    const ey = finiteOr(e[1] ?? 0, 0)
    let angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI
    angle = ((angle % 360) + 360) % 360

    const color: [number, number, number] =
      stops.length > 0 ? [...stops[0].color] : [0, 0, 0]
    const alphaTail = flat.length > stopCount * 4 ? flat.slice(stopCount * 4) : undefined
    return { kind, color, stops, angle, alphaTail }
  }

  // Solid fill ('fl').
  const c = paint?.c ? getValue(paint.c, 0) : [0, 0, 0]
  const color: [number, number, number] = [
    finiteOr(c[0] ?? 0, 0),
    finiteOr(c[1] ?? 0, 0),
    finiteOr(c[2] ?? 0, 0),
  ]
  return { kind: 'solid', color, stops: [], angle: 0 }
}

/** Standard solid fill item. */
export function makeSolidFill(color: [number, number, number]): any {
  return {
    ty: 'fl',
    c: { a: 0, k: [color[0], color[1], color[2], 1] },
    o: { a: 0, k: 100 },
    r: 1,
    bm: 0,
    nm: 'Fill',
    hd: false,
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Gradient fill item. `extent` is the half-size of the shape so the
 *  gradient spans it edge to edge; coordinates are in shape space
 *  (shapes are centered on [0,0]). */
export function makeGradientFill(
  kind: 'linear' | 'radial',
  stops: GradientStop[],
  angleDeg: number,
  extent: number,
  alphaTail?: number[],
): any {
  const sorted = stops
    .slice()
    .sort((a, b) => a.pos - b.pos)
  const flat: number[] = []
  for (const stop of sorted) {
    flat.push(
      finiteOr(stop.pos, 0),
      finiteOr(stop.color[0], 0),
      finiteOr(stop.color[1], 0),
      finiteOr(stop.color[2], 0),
    )
  }
  if (alphaTail) flat.push(...alphaTail.map((n) => finiteOr(n, 1)))
  const ext = finiteOr(extent, 100)
  const rad = (finiteOr(angleDeg, 0) * Math.PI) / 180
  const dx = round4(ext * Math.cos(rad))
  const dy = round4(ext * Math.sin(rad))
  const s = kind === 'radial' ? [0, 0] : [-dx, -dy]
  const e = [dx, dy]
  return {
    ty: 'gf',
    t: kind === 'radial' ? 2 : 1,
    g: { p: sorted.length, k: { a: 0, k: flat } },
    s: { a: 0, k: s },
    e: { a: 0, k: e },
    o: { a: 0, k: 100 },
    r: 1,
    bm: 0,
    nm: 'Gradient Fill',
    hd: false,
  }
}

/** Replace the layer's existing fill/gradient-fill item in place (same
 *  search as findPaint, including one group deep). If none exists, insert
 *  into layer.shapes after the last geometry item. Returns true if placed. */
export function setPaint(layer: LottieLayer, paint: any): boolean {
  const loc = findItem(layer, ['fl', 'gf'])
  if (loc) {
    loc.arr.splice(loc.idx, 1, paint)
    return true
  }
  if (!Array.isArray(layer.shapes)) layer.shapes = []
  const shapes = layer.shapes
  let lastGeom = -1
  for (let i = 0; i < shapes.length; i++) {
    if (GEOMETRY_TYPES.includes(shapes[i]?.ty)) lastGeom = i
  }
  if (lastGeom >= 0) shapes.splice(lastGeom + 1, 0, paint)
  else shapes.push(paint)
  return true
}

/** Half of the max dimension of the layer's first geometry item, used to
 *  size gradients. Falls back to 100 when nothing measurable is found. */
export function shapeExtent(layer: LottieLayer): number {
  const loc = findItem(layer, GEOMETRY_TYPES)
  const shape = loc ? loc.arr[loc.idx] : undefined
  let extent = NaN
  if (shape) {
    if (shape.ty === 'rc' || shape.ty === 'el') {
      const size = getValue(shape.s, 0)
      extent = Math.max(...size.map((n) => finiteOr(n, 0))) / 2
    } else if (shape.ty === 'sr') {
      extent = getValue(shape.or, 0)[0]
    } else if (shape.ty === 'sh') {
      // Path: ks.k is { v: [[x,y],...] } when static, Keyframe[] when
      // animated (first keyframe's s[0] holds the path).
      const k = shape.ks?.k
      const path = Array.isArray(k) ? k[0]?.s?.[0] : k
      const verts: any[] = Array.isArray(path?.v) ? path.v : []
      if (verts.length > 0) {
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        for (const v of verts) {
          const x = Number(v?.[0])
          const y = Number(v?.[1])
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        if (maxX >= minX && maxY >= minY) {
          extent = Math.max(maxX - minX, maxY - minY) / 2
        }
      }
    }
  }
  return Number.isFinite(extent) && extent > 0 ? extent : 100
}
