// Minimal (intentionally loose) typings for the Lottie JSON format.
// The format is large; we type only what the editor touches and leave the
// rest as index signatures so imported files round-trip untouched.

export interface AnimProp {
  a: 0 | 1
  k: any
  ix?: number
  [key: string]: any
}

export interface LottieKeyframe {
  t: number
  s?: number[]
  i?: { x: number[]; y: number[] }
  o?: { x: number[]; y: number[] }
  h?: 0 | 1
  to?: number[] | null
  ti?: number[] | null
  [key: string]: any
}

export interface LottieTransform {
  o: AnimProp // opacity 0-100
  r: AnimProp // rotation deg
  p: AnimProp // position [x,y,(z)]
  a: AnimProp // anchor [x,y,(z)]
  s: AnimProp // scale [x,y,(z)] (100 = 100%)
  [key: string]: any
}

export interface LottieLayer {
  ddd?: 0 | 1
  ind: number
  ty: number // 4 = shape layer
  nm: string
  sr?: number
  ks: LottieTransform
  ao?: 0 | 1
  shapes?: any[]
  ip: number
  op: number
  st: number
  bm?: number
  hd?: boolean
  [key: string]: any
}

export interface LottieDoc {
  v: string
  fr: number // frame rate
  ip: number // in point (frame)
  op: number // out point (frame)
  w: number
  h: number
  nm?: string
  ddd?: 0 | 1
  assets: any[]
  layers: LottieLayer[]
  [key: string]: any
}

export type TransformKey = 'p' | 'a' | 's' | 'r' | 'o'

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
