import type { EasingName } from '../types/lottie'

// Bezier handle presets, expressed the way Lottie keyframes store them:
// `o` is the outgoing handle of the keyframe the segment starts at,
// `i` is the incoming handle of the segment's end. Single-element arrays
// apply to every dimension of the value.
export const EASINGS: Record<
  EasingName,
  { o: { x: number[]; y: number[] }; i: { x: number[]; y: number[] } }
> = {
  // Points on the diagonal -> constant speed.
  linear: { o: { x: [0.167], y: [0.167] }, i: { x: [0.833], y: [0.833] } },
  easeIn: { o: { x: [0.42], y: [0] }, i: { x: [1], y: [1] } },
  easeOut: { o: { x: [0], y: [0] }, i: { x: [0.58], y: [1] } },
  easeInOut: { o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } },
}

export const EASING_NAMES: EasingName[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']
