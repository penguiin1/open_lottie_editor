import type { LottieDoc } from '../types/lottie'
import { getValue } from './props'

// ---------------------------------------------------------------------------
// One-time normalization applied to every document entering the editor
// (imports, samples). Converts the format variants real-world files use into
// the single canonical shape the editing code assumes, so edits can never
// corrupt a file the editor merely *displays* correctly.
// ---------------------------------------------------------------------------

/** True for `{ a: 1, k: [{t, ...}, ...] }` animated property nodes. */
function isKeyframedProp(node: any): boolean {
  return (
    node != null &&
    typeof node === 'object' &&
    node.a === 1 &&
    Array.isArray(node.k) &&
    node.k.length > 0 &&
    typeof node.k[0] === 'object' &&
    node.k[0] !== null &&
    't' in node.k[0]
  )
}

/** Legacy (pre-Bodymovin 5.5) keyframes are {t,s,e} segment pairs whose final
 *  keyframe is a bare {t} with no value. Materialize the final value from the
 *  previous keyframe's `e`, then drop all `e` fields so later edits/deletions
 *  can't resurrect stale end values. */
function normalizeLegacyKeyframes(prop: any): void {
  const kfs = prop.k
  const last = kfs[kfs.length - 1]
  if (last && last.s == null) {
    const prev = kfs[kfs.length - 2]
    const v = prev?.e ?? prev?.s
    if (v != null) last.s = Array.isArray(v) ? v.slice() : [v]
  }
  for (const kf of kfs) {
    if ('e' in kf) delete kf.e
    // Some exporters write bezier handles as bare numbers; the editor (and
    // the curve editor in particular) expects arrays.
    for (const hk of ['i', 'o'] as const) {
      const h = kf[hk]
      if (h && typeof h === 'object') {
        if (typeof h.x === 'number') h.x = [h.x]
        if (typeof h.y === 'number') h.y = [h.y]
      }
    }
  }
}

/** Recursively walk any JSON subtree and normalize every keyframed property
 *  (transforms, shape paths, fills, trims — everywhere). */
function walk(node: any): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item)
    return
  }
  if (isKeyframedProp(node)) normalizeLegacyKeyframes(node)
  for (const key of Object.keys(node)) walk(node[key])
}

/** Collapse AE "separate dimensions" positions ({s:true, x, y}) into a joint
 *  property. Static channels collapse losslessly; animated channels are
 *  resampled at the union of their keyframe times (bezier shaping between
 *  samples becomes linear — timing and values are preserved). */
function collapseSplitPosition(ks: any): void {
  const p = ks?.p
  if (!p || p.s !== true) return
  const x = p.x ?? { a: 0, k: 0 }
  const y = p.y ?? { a: 0, k: 0 }
  const xAnim = x.a === 1 && Array.isArray(x.k)
  const yAnim = y.a === 1 && Array.isArray(y.k)
  if (!xAnim && !yAnim) {
    ks.p = { a: 0, k: [getValue(x, 0)[0], getValue(y, 0)[0], 0] }
    return
  }
  const times = new Set<number>()
  if (xAnim) for (const kf of x.k) times.add(Math.round(kf.t))
  if (yAnim) for (const kf of y.k) times.add(Math.round(kf.t))
  const sorted = [...times].sort((a, b) => a - b)
  ks.p = {
    a: 1,
    k: sorted.map((t) => ({
      t,
      s: [getValue(x, t)[0], getValue(y, t)[0], 0],
      o: { x: [0.167], y: [0.167] },
      i: { x: [0.833], y: [0.833] },
    })),
  }
}

function normalizeLayers(layers: any[], docIp: number, docOp: number): void {
  for (const l of layers) {
    if (l == null || typeof l !== 'object') continue
    if (l.ks == null || typeof l.ks !== 'object') l.ks = {}
    // The Lottie spec marks transform sub-props optional (players default
    // them); the editor reads them unconditionally, so default them here.
    l.ks.o ??= { a: 0, k: 100 }
    l.ks.r ??= { a: 0, k: 0 }
    l.ks.p ??= { a: 0, k: [0, 0, 0] }
    l.ks.a ??= { a: 0, k: [0, 0, 0] }
    l.ks.s ??= { a: 0, k: [100, 100, 100] }
    if (typeof l.ip !== 'number' || !Number.isFinite(l.ip)) l.ip = docIp
    if (typeof l.op !== 'number' || !Number.isFinite(l.op)) l.op = docOp
    if (typeof l.st !== 'number' || !Number.isFinite(l.st)) l.st = 0
    collapseSplitPosition(l.ks)
  }
}

/** Normalize a freshly parsed/created document in place and return it. */
export function normalizeDoc(doc: LottieDoc): LottieDoc {
  if (!Number.isFinite(doc.fr) || doc.fr <= 0) doc.fr = 30
  if (!Number.isFinite(doc.ip)) doc.ip = 0
  if (!Number.isFinite(doc.op) || doc.op <= doc.ip) doc.op = doc.ip + 1
  if (!Array.isArray(doc.assets)) doc.assets = []
  if (!Array.isArray(doc.layers)) doc.layers = []

  // Fix legacy {t,s,e} keyframes everywhere BEFORE resampling split
  // positions, so getValue reads clean values during the resample.
  walk(doc)

  normalizeLayers(doc.layers, doc.ip, doc.op)
  for (const asset of doc.assets) {
    if (asset && Array.isArray(asset.layers)) normalizeLayers(asset.layers, doc.ip, doc.op)
  }
  return doc
}
