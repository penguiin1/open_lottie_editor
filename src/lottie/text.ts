// Lottie text layer (ty 5) support: font registry, layer factory, and
// read/write helpers for the first text-document keyframe's style.

import type { LottieDoc, LottieLayer } from '../types/lottie'
import { paletteColor } from './doc'

export interface FontDef {
  fName: string
  fFamily: string
  fStyle: string
  ascent: number
}

// Web-safe fonts only — players resolve fFamily via CSS, no font assets needed.
export const FONTS: FontDef[] = [
  { fName: 'Arial-Regular', fFamily: 'Arial', fStyle: 'Regular', ascent: 75 },
  { fName: 'Georgia-Regular', fFamily: 'Georgia', fStyle: 'Regular', ascent: 75 },
  { fName: 'TimesNewRoman-Regular', fFamily: 'Times New Roman', fStyle: 'Regular', ascent: 75 },
  { fName: 'CourierNew-Regular', fFamily: 'Courier New', fStyle: 'Regular', ascent: 75 },
  { fName: 'Verdana-Regular', fFamily: 'Verdana', fStyle: 'Regular', ascent: 75 },
  { fName: 'Impact-Regular', fFamily: 'Impact', fStyle: 'Regular', ascent: 75 },
  { fName: 'TrebuchetMS-Regular', fFamily: 'Trebuchet MS', fStyle: 'Regular', ascent: 75 },
  { fName: 'ComicSansMS-Regular', fFamily: 'Comic Sans MS', fStyle: 'Regular', ascent: 75 },
]

// Register a font in doc.fonts.list if not already present.
export function ensureFont(doc: LottieDoc, fName: string): void {
  doc.fonts = doc.fonts ?? { list: [] }
  const list: FontDef[] = (doc.fonts.list = doc.fonts.list ?? [])
  if (list.some((f) => f.fName === fName)) return
  const def = FONTS.find((f) => f.fName === fName)
  list.push(def ? { ...def } : { fName, fFamily: 'Arial', fStyle: 'Regular', ascent: 75 })
}

export interface TextStyle {
  text: string
  font: string
  size: number
  color: [number, number, number]
  justify: 0 | 1 | 2 // 0 left, 1 right, 2 center
  lineHeight: number
  tracking: number
}

export function createTextLayer(doc: LottieDoc, ind: number, colorIndex: number): LottieLayer {
  const color = paletteColor(colorIndex)
  const fName = FONTS[0].fName
  ensureFont(doc, fName)
  return {
    ddd: 0,
    ind,
    ty: 5,
    nm: `Text ${ind}`,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [doc.w / 2, doc.h / 2, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    t: {
      d: {
        k: [
          {
            s: {
              t: 'Your text',
              f: fName,
              s: 64,
              fc: [color[0], color[1], color[2]],
              j: 2,
              tr: 0,
              lh: 76.8,
              ls: 0,
              ca: 0,
            },
            t: 0,
          },
        ],
      },
      p: {},
      m: { g: 1, a: { a: 0, k: [0, 0] } },
      a: [],
    },
    ip: doc.ip,
    op: doc.op,
    st: 0,
    bm: 0,
  }
}

export function getTextStyle(layer: LottieLayer): TextStyle | null {
  const s = layer.t?.d?.k?.[0]?.s
  if (!s) return null
  const size: number = typeof s.s === 'number' ? s.s : 0
  const fc = Array.isArray(s.fc) ? s.fc : [1, 1, 1]
  return {
    text: String(s.t ?? '').replace(/\r/g, '\n'),
    font: String(s.f ?? ''),
    size,
    color: [fc[0] ?? 1, fc[1] ?? 1, fc[2] ?? 1],
    justify: (s.j === 0 || s.j === 1 || s.j === 2 ? s.j : 2) as 0 | 1 | 2,
    lineHeight: typeof s.lh === 'number' ? s.lh : size * 1.2,
    tracking: typeof s.tr === 'number' ? s.tr : 0,
  }
}

// Merge a partial style into the layer's first text keyframe in place.
export function applyTextStyle(doc: LottieDoc, layer: LottieLayer, patch: Partial<TextStyle>): void {
  const s = layer.t?.d?.k?.[0]?.s
  if (!s) return
  if (patch.text !== undefined) s.t = patch.text.replace(/\n/g, '\r')
  if (patch.font !== undefined) {
    s.f = patch.font
    ensureFont(doc, patch.font)
  }
  if (patch.size !== undefined) s.s = patch.size
  if (patch.lineHeight !== undefined) s.lh = patch.lineHeight
  if (patch.color !== undefined) s.fc = [patch.color[0], patch.color[1], patch.color[2]]
  if (patch.justify !== undefined) s.j = patch.justify
  if (patch.tracking !== undefined) s.tr = patch.tracking
}
