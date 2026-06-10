import type { LottieDoc, LottieLayer } from '../types/lottie'

export const APP_GENERATOR = 'OpenLottie Studio 0.1'

export function createEmptyDoc(w = 512, h = 512, fr = 30, op = 90): LottieDoc {
  return {
    v: '5.7.4',
    meta: { g: APP_GENERATOR },
    fr,
    ip: 0,
    op,
    w,
    h,
    nm: 'Untitled',
    ddd: 0,
    assets: [],
    layers: [],
  }
}

// Pleasant default palette cycled as layers are added (RGB 0-1).
const PALETTE: [number, number, number][] = [
  [0.345, 0.337, 0.839], // indigo
  [0.945, 0.353, 0.486], // pink
  [0.13, 0.773, 0.616], // teal
  [0.992, 0.726, 0.075], // amber
  [0.243, 0.565, 0.969], // blue
  [0.937, 0.424, 0.262], // orange
]

export function paletteColor(i: number): [number, number, number] {
  return PALETTE[i % PALETTE.length]
}

function makeFill(color: [number, number, number]) {
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

function baseLayer(doc: LottieDoc, ind: number, nm: string): LottieLayer {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [doc.w / 2, doc.h / 2, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes: [],
    ip: doc.ip,
    op: doc.op,
    st: 0,
    bm: 0,
  }
}

export type ShapeKind = 'rect' | 'ellipse' | 'star'

export function createShapeLayer(
  doc: LottieDoc,
  kind: ShapeKind,
  ind: number,
  colorIndex: number,
): LottieLayer {
  const color = paletteColor(colorIndex)
  const size = Math.round(Math.min(doc.w, doc.h) * 0.3)
  const names: Record<ShapeKind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', star: 'Star' }
  const layer = baseLayer(doc, ind, `${names[kind]} ${ind}`)

  let shape: any
  if (kind === 'rect') {
    shape = {
      ty: 'rc',
      d: 1,
      s: { a: 0, k: [size, size] },
      p: { a: 0, k: [0, 0] },
      r: { a: 0, k: Math.round(size * 0.08) },
      nm: 'Rect Path',
    }
  } else if (kind === 'ellipse') {
    shape = {
      ty: 'el',
      d: 1,
      s: { a: 0, k: [size, size] },
      p: { a: 0, k: [0, 0] },
      nm: 'Ellipse Path',
    }
  } else {
    shape = {
      ty: 'sr',
      sy: 1,
      d: 1,
      pt: { a: 0, k: 5 },
      p: { a: 0, k: [0, 0] },
      r: { a: 0, k: 0 },
      ir: { a: 0, k: Math.round(size * 0.35) },
      is: { a: 0, k: 0 },
      or: { a: 0, k: Math.round(size * 0.65) },
      os: { a: 0, k: 0 },
      nm: 'Star Path',
    }
  }

  layer.shapes = [shape, makeFill(color)]
  return layer
}

export function nextLayerInd(doc: LottieDoc): number {
  return doc.layers.reduce((m, l) => Math.max(m, l.ind), 0) + 1
}
