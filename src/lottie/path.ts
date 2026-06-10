import type { LottieDoc, LottieLayer } from '../types/lottie'
import { paletteColor } from './doc'
import { toArray } from './props'

// ---------------------------------------------------------------------------
// Bezier path shapes for the pen tool.
//
// A Lottie path shape (`ty: 'sh'`) stores its geometry as
// `{ i: number[][], o: number[][], v: number[][], c: boolean }` where `v` are
// vertices in layer space and `i`/`o` are in/out tangents RELATIVE to each
// vertex. The pen tool collects points in composition coordinates; we center
// the layer on the points' bounding box and store vertices relative to that.
// ---------------------------------------------------------------------------

export interface PenPoint {
  x: number
  y: number
  inTan?: [number, number]
  outTan?: [number, number]
}

/** Static shape-path property from pen points, offset into layer space. */
export function buildPathKs(points: PenPoint[], closed: boolean, offset: [number, number]): any {
  return {
    a: 0,
    k: {
      i: points.map((p) => (p.inTan ? [p.inTan[0], p.inTan[1]] : [0, 0])),
      o: points.map((p) => (p.outTan ? [p.outTan[0], p.outTan[1]] : [0, 0])),
      v: points.map((p) => [p.x - offset[0], p.y - offset[1]]),
      c: closed,
    },
  }
}

/** Shape layer containing a single pen path, centered on its bounding box.
 *  Closed paths get a fill + darker stroke; open paths a stroke only. */
export function createPenLayer(
  doc: LottieDoc,
  ind: number,
  points: PenPoint[],
  closed: boolean,
  colorIndex: number,
): LottieLayer {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const cx = points.length > 0 ? (minX + maxX) / 2 : 0
  const cy = points.length > 0 ? (minY + maxY) / 2 : 0

  const [r, g, b] = paletteColor(colorIndex)
  const strokeColor: [number, number, number] = closed ? [r * 0.7, g * 0.7, b * 0.7] : [r, g, b]

  const shapes: any[] = [{ ty: 'sh', d: 1, ks: buildPathKs(points, closed, [cx, cy]), nm: 'Path' }]
  if (closed) {
    shapes.push({
      ty: 'fl',
      c: { a: 0, k: [r, g, b, 1] },
      o: { a: 0, k: 100 },
      r: 1,
      bm: 0,
      nm: 'Fill',
      hd: false,
    })
  }
  shapes.push({
    ty: 'st',
    c: { a: 0, k: [strokeColor[0], strokeColor[1], strokeColor[2], 1] },
    o: { a: 0, k: 100 },
    w: { a: 0, k: 6 },
    lc: 2,
    lj: 2,
    bm: 0,
    nm: 'Stroke',
  })

  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: `Path ${ind}`,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [cx, cy, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes,
    ip: doc.ip,
    op: doc.op,
    st: 0,
    bm: 0,
  }
}

/** Guards shared by getPathVertices/moveVertex: first shape is a static path
 *  and the layer position is static + joint. Returns the pieces or null. */
function staticPathParts(
  layer: LottieLayer,
): { k: { i: number[][]; o: number[][]; v: number[][]; c: boolean }; px: number; py: number } | null {
  const shape = layer.shapes?.[0]
  if (!shape || shape.ty !== 'sh') return null
  const ks = shape.ks
  if (!ks || ks.a !== 0) return null
  const k = ks.k
  if (!k || !Array.isArray(k.v)) return null
  const p = layer.ks?.p
  if (!p || p.a === 1 || (p as any).s === true) return null
  // Vertex overlay math assumes an identity transform beyond translation —
  // bail out for rotated/scaled/anchored layers so drags can't corrupt paths.
  const t = layer.ks
  const rv = t.r && t.r.a !== 1 ? toArray(t.r.k)[0] : NaN
  const sv = t.s && t.s.a !== 1 ? toArray(t.s.k) : [NaN]
  const av = t.a && t.a.a !== 1 ? toArray(t.a.k) : [NaN]
  if (rv !== 0) return null
  if (Math.round(sv[0] ?? NaN) !== 100 || Math.round(sv[1] ?? sv[0] ?? NaN) !== 100) return null
  if ((av[0] ?? NaN) !== 0 || (av[1] ?? 0) !== 0) return null
  const pos = toArray(p.k)
  return { k, px: pos[0] ?? 0, py: pos[1] ?? 0 }
}

/** Path vertices in composition coordinates (vertex + static layer position),
 *  or null if the layer is not a simple static pen path. */
export function getPathVertices(layer: LottieLayer): { x: number; y: number }[] | null {
  const parts = staticPathParts(layer)
  if (!parts) return null
  return parts.k.v.map((vert) => ({
    x: (vert?.[0] ?? 0) + parts.px,
    y: (vert?.[1] ?? 0) + parts.py,
  }))
}

/** Move one vertex to composition coordinates (x, y), preserving tangents.
 *  Returns false if the layer fails the static-path guards or `index` is
 *  out of range. */
export function moveVertex(layer: LottieLayer, index: number, x: number, y: number): boolean {
  const parts = staticPathParts(layer)
  if (!parts) return false
  if (index < 0 || index >= parts.k.v.length) return false
  parts.k.v[index] = [x - parts.px, y - parts.py]
  return true
}
