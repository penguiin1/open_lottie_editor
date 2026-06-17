import type { LottieDoc, LottieLayer } from '../types/lottie';

// Easing handle presets (per-keyframe outgoing `o` / incoming `i` bezier handles).
// These are written inline as fresh literals via functions so no object is ever
// shared between two documents.
const easeInOutO = () => ({ x: [0.42], y: [0] });
const easeInOutI = () => ({ x: [0.58], y: [1] });
const easeInO = () => ({ x: [0.42], y: [0] });
const easeInI = () => ({ x: [1], y: [1] });
const easeOutO = () => ({ x: [0], y: [0] });
const easeOutI = () => ({ x: [0.58], y: [1] });

// ---------------------------------------------------------------------------
// 1. Bouncing Ball
// ---------------------------------------------------------------------------

function makeBouncingBall(): LottieDoc {
  const ballLayer: LottieLayer = {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: 'Ball',
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: {
        a: 1,
        k: [
          // top -> bottom: accelerate (ease in)
          { t: 0, s: [256, 120, 0], o: easeInO(), i: easeInI() },
          // bottom -> top: decelerate (ease out)
          { t: 30, s: [256, 400, 0], o: easeOutO(), i: easeOutI() },
          // back at top, identical to first keyframe for a clean loop
          { t: 60, s: [256, 120, 0] },
        ],
      },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: 0, s: [100, 100, 100], o: easeInOutO(), i: easeInOutI() },
          { t: 26, s: [100, 100, 100], o: easeInOutO(), i: easeInOutI() },
          // squash at impact
          { t: 30, s: [125, 75, 100], o: easeInOutO(), i: easeInOutI() },
          { t: 34, s: [100, 100, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: 'el',
        d: 1,
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [120, 120] },
        nm: 'Ellipse',
        hd: false,
      },
      {
        ty: 'fl',
        c: { a: 0, k: [0.345, 0.337, 0.839, 1] }, // indigo #5856D6
        o: { a: 0, k: 100 },
        r: 1,
        bm: 0,
        nm: 'Fill',
        hd: false,
      },
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0,
  };

  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    nm: 'Bouncing Ball',
    ddd: 0,
    assets: [],
    layers: [ballLayer],
  };
}

// ---------------------------------------------------------------------------
// 2. Pulse Loader
// ---------------------------------------------------------------------------

function pulseDot(ind: number, x: number, offset: number): LottieLayer {
  const t0 = offset;
  const t1 = offset + 14;
  const t2 = offset + 28;
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: `Dot ${ind}`,
    sr: 1,
    ks: {
      o: {
        a: 1,
        k: [
          { t: t0, s: [100], o: easeInOutO(), i: easeInOutI() },
          { t: t1, s: [40], o: easeInOutO(), i: easeInOutI() },
          { t: t2, s: [100] },
        ],
      },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [x, 256, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: t0, s: [100, 100, 100], o: easeInOutO(), i: easeInOutI() },
          { t: t1, s: [140, 140, 100], o: easeInOutO(), i: easeInOutI() },
          { t: t2, s: [100, 100, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: 'el',
        d: 1,
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [64, 64] },
        nm: 'Ellipse',
        hd: false,
      },
      {
        ty: 'fl',
        c: { a: 0, k: [0.078, 0.722, 0.651, 1] }, // teal #14B8A6
        o: { a: 0, k: 100 },
        r: 1,
        bm: 0,
        nm: 'Fill',
        hd: false,
      },
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0,
  };
}

function makePulseLoader(): LottieDoc {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    nm: 'Pulse Loader',
    ddd: 0,
    assets: [],
    layers: [pulseDot(1, 156, 0), pulseDot(2, 256, 8), pulseDot(3, 356, 16)],
  };
}

// ---------------------------------------------------------------------------
// 3. Success Check
// ---------------------------------------------------------------------------

function makeSuccessCheck(): LottieDoc {
  // Checkmark layer is first in the array so it renders on top of the circle.
  const checkLayer: LottieLayer = {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: 'Checkmark',
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [256, 256, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes: [
      {
        ty: 'sh',
        d: 1,
        ks: {
          a: 0,
          k: {
            i: [
              [0, 0],
              [0, 0],
              [0, 0],
            ],
            o: [
              [0, 0],
              [0, 0],
              [0, 0],
            ],
            v: [
              [-60, 10],
              [-15, 55],
              [70, -45],
            ],
            c: false,
          },
        },
        nm: 'Check Path',
        hd: false,
      },
      {
        ty: 'st',
        c: { a: 0, k: [1, 1, 1, 1] }, // white
        o: { a: 0, k: 100 },
        w: { a: 0, k: 24 },
        lc: 2,
        lj: 2,
        bm: 0,
        nm: 'Stroke',
      },
      {
        ty: 'tm',
        s: { a: 0, k: 0 },
        e: {
          a: 1,
          k: [
            { t: 12, s: [0], o: easeInOutO(), i: easeInOutI() },
            { t: 30, s: [100] },
          ],
        },
        o: { a: 0, k: 0 },
        m: 1,
        nm: 'Trim',
      },
    ],
    ip: 10,
    op: 45,
    st: 0,
    bm: 0,
  };

  const circleLayer: LottieLayer = {
    ddd: 0,
    ind: 2,
    ty: 4,
    nm: 'Circle',
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [256, 256, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: 0, s: [0, 0, 100], o: easeOutO(), i: easeOutI() },
          // overshoot pop
          { t: 10, s: [110, 110, 100], o: easeInOutO(), i: easeInOutI() },
          { t: 15, s: [100, 100, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: 'el',
        d: 1,
        p: { a: 0, k: [0, 0] },
        s: { a: 0, k: [300, 300] },
        nm: 'Ellipse',
        hd: false,
      },
      {
        ty: 'fl',
        c: { a: 0, k: [0.133, 0.773, 0.369, 1] }, // green #22C55E
        o: { a: 0, k: 100 },
        r: 1,
        bm: 0,
        nm: 'Fill',
        hd: false,
      },
    ],
    ip: 0,
    op: 45,
    st: 0,
    bm: 0,
  };

  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 45,
    w: 512,
    h: 512,
    nm: 'Success Check',
    ddd: 0,
    assets: [],
    layers: [checkLayer, circleLayer],
  };
}

export const SAMPLES: { name: string; make: () => LottieDoc }[] = [
  { name: 'Bouncing Ball', make: makeBouncingBall },
  { name: 'Pulse Loader', make: makePulseLoader },
  { name: 'Success Check', make: makeSuccessCheck },
];
