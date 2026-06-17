import type { LottieLayer } from '../types/lottie'
import { getValue } from './props'

// ---------------------------------------------------------------------------
// Bone-rig math for cutout (AE/DUIK-style) character rigs.
//
// A "bone" is simply a parent→child link between layers: the bone runs from
// the parent's pivot (anchor point) to the child's pivot. Posing rotates the
// layers around their anchors; export stays plain Lottie keyframes.
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180

export function parentOf(layers: LottieLayer[], l: LottieLayer): LottieLayer | undefined {
  return l.parent != null ? layers.find((x) => x.ind === l.parent) : undefined
}

/** Map a point from `l`'s layer space into its parent's space at `frame`. */
function toParentSpace(
  l: LottieLayer,
  pt: { x: number; y: number },
  frame: number,
): { x: number; y: number } {
  const a = getValue(l.ks?.a, frame)
  const p = getValue(l.ks?.p, frame)
  const r = (getValue(l.ks?.r, frame)[0] ?? 0) * D2R
  const s = getValue(l.ks?.s, frame)
  const sx = (s[0] ?? 100) / 100
  const sy = (s[1] ?? s[0] ?? 100) / 100
  const x = (pt.x - (a[0] ?? 0)) * sx
  const y = (pt.y - (a[1] ?? 0)) * sy
  const c = Math.cos(r)
  const si = Math.sin(r)
  return { x: (p[0] ?? 0) + x * c - y * si, y: (p[1] ?? 0) + x * si + y * c }
}

/** Point in `l`'s layer space → composition space, composing the chain. */
export function worldPoint(
  layers: LottieLayer[],
  l: LottieLayer,
  pt: { x: number; y: number },
  frame: number,
): { x: number; y: number } {
  let cur: LottieLayer | undefined = l
  let q = pt
  const seen = new Set<number>()
  while (cur && !seen.has(cur.ind)) {
    seen.add(cur.ind)
    q = toParentSpace(cur, q, frame)
    cur = parentOf(layers, cur)
  }
  return q
}

/** Composition-space position of the layer's pivot (anchor point). */
export function pivotWorld(
  layers: LottieLayer[],
  l: LottieLayer,
  frame: number,
): { x: number; y: number } {
  const a = getValue(l.ks?.a, frame)
  return worldPoint(layers, l, { x: a[0] ?? 0, y: a[1] ?? 0 }, frame)
}

/** Accumulated rotation (degrees) of the chain, including `l`'s own. */
export function chainRot(layers: LottieLayer[], l: LottieLayer, frame: number): number {
  let total = 0
  let cur: LottieLayer | undefined = l
  const seen = new Set<number>()
  while (cur && !seen.has(cur.ind)) {
    seen.add(cur.ind)
    total += getValue(cur.ks?.r, frame)[0] ?? 0
    cur = parentOf(layers, cur)
  }
  return total
}

/** Pivot math assumes ~100% scale along the chain (like the path editor). */
export function chainScaleOK(layers: LottieLayer[], l: LottieLayer, frame: number): boolean {
  let cur: LottieLayer | undefined = l
  const seen = new Set<number>()
  while (cur && !seen.has(cur.ind)) {
    seen.add(cur.ind)
    const s = getValue(cur.ks?.s, frame)
    if (Math.abs((s[0] ?? 100) - 100) > 1 || Math.abs((s[1] ?? s[0] ?? 100) - 100) > 1) return false
    cur = parentOf(layers, cur)
  }
  return true
}

export interface IKSolution {
  rootInd: number
  midInd: number
  /** New absolute rotation values (degrees) for the two bones. */
  rootR: number
  midR: number
}

/**
 * Analytic 2-bone IK: rotate `sel`'s parent (mid) and grandparent (root) so
 * that `sel`'s pivot reaches the composition-space target. Of the two
 * geometric solutions, the one preserving the current bend direction wins.
 */
export function solveTwoBoneIK(
  layers: LottieLayer[],
  sel: LottieLayer,
  frame: number,
  tx: number,
  ty: number,
): IKSolution | null {
  const mid = parentOf(layers, sel)
  if (!mid) return null
  const root = parentOf(layers, mid)
  if (!root) return null
  if (!chainScaleOK(layers, sel, frame)) return null

  const S = pivotWorld(layers, root, frame)
  const M = pivotWorld(layers, mid, frame)
  const C = pivotWorld(layers, sel, frame)
  const L1 = Math.hypot(M.x - S.x, M.y - S.y)
  const L2 = Math.hypot(C.x - M.x, C.y - M.y)
  if (L1 < 1 || L2 < 1) return null

  const cur1 = Math.atan2(M.y - S.y, M.x - S.x)
  const cur2 = Math.atan2(C.y - M.y, C.x - M.x)
  const bend = Math.sign((M.x - S.x) * (C.y - M.y) - (M.y - S.y) * (C.x - M.x)) || 1

  let d = Math.hypot(tx - S.x, ty - S.y)
  d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(d, L1 + L2 - 0.01))
  const base = Math.atan2(ty - S.y, tx - S.x)
  const off = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))

  // Choose the elbow branch matching the current bend direction.
  let alpha = base + off
  let E = { x: S.x + L1 * Math.cos(alpha), y: S.y + L1 * Math.sin(alpha) }
  const sign1 = Math.sign((E.x - S.x) * (ty - E.y) - (E.y - S.y) * (tx - E.x)) || 1
  if (sign1 !== bend) {
    alpha = base - off
    E = { x: S.x + L1 * Math.cos(alpha), y: S.y + L1 * Math.sin(alpha) }
  }
  const beta = Math.atan2(ty - E.y, tx - E.x)

  const d1 = (alpha - cur1) / D2R
  const d2 = (beta - cur2) / D2R - d1
  return {
    rootInd: root.ind,
    midInd: mid.ind,
    rootR: (getValue(root.ks?.r, frame)[0] ?? 0) + d1,
    midR: (getValue(mid.ks?.r, frame)[0] ?? 0) + d2,
  }
}
