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

type PathK = { i: number[][]; o: number[][]; v: number[][]; c: boolean }

/** Static layer offset, or null unless the transform is identity beyond
 *  translation — overlay math can't represent rotation/scale/anchor, so
 *  editing is disabled for transformed layers to avoid corrupting paths. */
function staticOffset(layer: LottieLayer): { px: number; py: number } | null {
  const p = layer.ks?.p
  if (!p || p.a === 1 || (p as any).s === true) return null
  const t = layer.ks
  const rv = t.r && t.r.a !== 1 ? toArray(t.r.k)[0] : NaN
  const sv = t.s && t.s.a !== 1 ? toArray(t.s.k) : [NaN]
  const av = t.a && t.a.a !== 1 ? toArray(t.a.k) : [NaN]
  if (rv !== 0) return null
  if (Math.round(sv[0] ?? NaN) !== 100 || Math.round(sv[1] ?? sv[0] ?? NaN) !== 100) return null
  if ((av[0] ?? NaN) !== 0 || (av[1] ?? 0) !== 0) return null
  const pos = toArray(p.k)
  return { px: pos[0] ?? 0, py: pos[1] ?? 0 }
}

/** Guards shared by getPathVertices/moveVertex: first shape is a static path
 *  and the layer position is static + joint. Returns the pieces or null. */
function staticPathParts(layer: LottieLayer): { k: PathK; px: number; py: number } | null {
  const shape = layer.shapes?.[0]
  if (!shape || shape.ty !== 'sh') return null
  const ks = shape.ks
  if (!ks || ks.a !== 0) return null
  const k = ks.k
  if (!k || !Array.isArray(k.v)) return null
  const off = staticOffset(layer)
  if (!off) return null
  return { k, ...off }
}

/** Same guards for a mask path (masksProperties[mi].pt). */
function staticMaskParts(
  layer: LottieLayer,
  mi: number,
): { k: PathK; px: number; py: number } | null {
  const mask = layer.masksProperties?.[mi]
  if (!mask?.pt || mask.pt.a !== 0) return null
  const k = mask.pt.k
  if (!k || !Array.isArray(k.v)) return null
  const off = staticOffset(layer)
  if (!off) return null
  return { k, ...off }
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

export interface PathGeometry {
  verts: { x: number; y: number }[]
  /** Absolute composition coordinates of the in/out handle tips. */
  ins: { x: number; y: number }[]
  outs: { x: number; y: number }[]
  closed: boolean
}

function geometryOf(parts: { k: PathK; px: number; py: number }): PathGeometry {
  const { k, px, py } = parts
  const verts = k.v.map((v) => ({ x: (v?.[0] ?? 0) + px, y: (v?.[1] ?? 0) + py }))
  const ins = verts.map((v, i) => ({
    x: v.x + (k.i?.[i]?.[0] ?? 0),
    y: v.y + (k.i?.[i]?.[1] ?? 0),
  }))
  const outs = verts.map((v, i) => ({
    x: v.x + (k.o?.[i]?.[0] ?? 0),
    y: v.y + (k.o?.[i]?.[1] ?? 0),
  }))
  return { verts, ins, outs, closed: !!k.c }
}

/** Full editable geometry in composition coordinates, or null if the layer
 *  fails the static-path guards. */
export function getPathGeometry(layer: LottieLayer): PathGeometry | null {
  const parts = staticPathParts(layer)
  return parts ? geometryOf(parts) : null
}

/** Editable geometry of mask `mi`, in composition coordinates. */
export function getMaskGeometry(layer: LottieLayer, mi: number): PathGeometry | null {
  const parts = staticMaskParts(layer, mi)
  return parts ? geometryOf(parts) : null
}

function ensureTangentArrays(k: { i: number[][]; o: number[][]; v: number[][] }): void {
  if (!Array.isArray(k.i)) (k as any).i = []
  if (!Array.isArray(k.o)) (k as any).o = []
  while (k.i.length < k.v.length) k.i.push([0, 0])
  while (k.o.length < k.v.length) k.o.push([0, 0])
}

/** Point a tangent handle at composition coordinates (x, y). With `mirror`
 *  the opposite handle is set to the negation (smooth point). */
export function moveTangent(
  layer: LottieLayer,
  index: number,
  which: 'in' | 'out',
  x: number,
  y: number,
  mirror: boolean,
): boolean {
  return moveTangentCore(staticPathParts(layer), index, which, x, y, mirror)
}

export function moveMaskTangent(
  layer: LottieLayer,
  mi: number,
  index: number,
  which: 'in' | 'out',
  x: number,
  y: number,
  mirror: boolean,
): boolean {
  return moveTangentCore(staticMaskParts(layer, mi), index, which, x, y, mirror)
}

function moveTangentCore(
  parts: { k: PathK; px: number; py: number } | null,
  index: number,
  which: 'in' | 'out',
  x: number,
  y: number,
  mirror: boolean,
): boolean {
  if (!parts) return false
  const { k, px, py } = parts
  if (index < 0 || index >= k.v.length) return false
  ensureTangentArrays(k)
  const tx = x - px - (k.v[index]?.[0] ?? 0)
  const ty = y - py - (k.v[index]?.[1] ?? 0)
  if (which === 'in') {
    k.i[index] = [tx, ty]
    if (mirror) k.o[index] = [-tx, -ty]
  } else {
    k.o[index] = [tx, ty]
    if (mirror) k.i[index] = [-tx, -ty]
  }
  return true
}

/** Insert a corner vertex after `segIndex` (the segment from vertex
 *  segIndex to the next one; for closed paths the last segment wraps). */
export function insertVertex(layer: LottieLayer, segIndex: number, x: number, y: number): boolean {
  return insertVertexCore(staticPathParts(layer), segIndex, x, y)
}

export function insertMaskVertex(
  layer: LottieLayer,
  mi: number,
  segIndex: number,
  x: number,
  y: number,
): boolean {
  return insertVertexCore(staticMaskParts(layer, mi), segIndex, x, y)
}

function insertVertexCore(
  parts: { k: PathK; px: number; py: number } | null,
  segIndex: number,
  x: number,
  y: number,
): boolean {
  if (!parts) return false
  const { k, px, py } = parts
  if (segIndex < 0 || segIndex >= k.v.length) return false
  ensureTangentArrays(k)
  const at = segIndex + 1
  k.v.splice(at, 0, [x - px, y - py])
  k.i.splice(at, 0, [0, 0])
  k.o.splice(at, 0, [0, 0])
  return true
}

/** Delete a vertex, keeping at least 3 points on closed paths and 2 on
 *  open ones. */
export function deleteVertex(layer: LottieLayer, index: number): boolean {
  return deleteVertexCore(staticPathParts(layer), index)
}

export function deleteMaskVertex(layer: LottieLayer, mi: number, index: number): boolean {
  return deleteVertexCore(staticMaskParts(layer, mi), index)
}

export function moveMaskVertex(
  layer: LottieLayer,
  mi: number,
  index: number,
  x: number,
  y: number,
): boolean {
  const parts = staticMaskParts(layer, mi)
  if (!parts) return false
  if (index < 0 || index >= parts.k.v.length) return false
  parts.k.v[index] = [x - parts.px, y - parts.py]
  return true
}

/** Bezier ellipse path (circle approximation, c ≈ 0.5523) in layer space. */
export function makeEllipsePathK(cx: number, cy: number, rx: number, ry: number): PathK {
  const c = 0.5523
  return {
    v: [
      [cx, cy - ry],
      [cx + rx, cy],
      [cx, cy + ry],
      [cx - rx, cy],
    ],
    i: [
      [-rx * c, 0],
      [0, -ry * c],
      [rx * c, 0],
      [0, ry * c],
    ],
    o: [
      [rx * c, 0],
      [0, ry * c],
      [-rx * c, 0],
      [0, -ry * c],
    ],
    c: true,
  }
}

function deleteVertexCore(
  parts: { k: PathK; px: number; py: number } | null,
  index: number,
): boolean {
  if (!parts) return false
  const k = parts.k
  const min = k.c ? 3 : 2
  if (k.v.length <= min) return false
  if (index < 0 || index >= k.v.length) return false
  k.v.splice(index, 1)
  if (Array.isArray(k.i)) k.i.splice(index, 1)
  if (Array.isArray(k.o)) k.o.splice(index, 1)
  return true
}
