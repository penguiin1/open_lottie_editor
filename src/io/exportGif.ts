import lottie from 'lottie-web';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { LottieDoc } from '../types/lottie';

export interface ExportGifOptions {
  scale?: number;
  bg?: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Renders a Lottie document frame-by-frame with lottie-web's canvas renderer
 * and encodes the result into an animated GIF, fully client-side.
 */
export async function exportGif(
  doc: LottieDoc,
  opts: ExportGifOptions = {}
): Promise<Blob> {
  const scale = opts.scale ?? 1;
  const width = Math.round(doc.w * scale);
  const height = Math.round(doc.h * scale);

  // lottie-web mutates the animationData it is given; work on a deep clone.
  const clone: LottieDoc = JSON.parse(JSON.stringify(doc));

  // Hidden off-screen container for the canvas renderer.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const anim = lottie.loadAnimation({
    container,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: clone,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  });

  try {
    // Wait until the renderer is ready (or fall back after 50ms).
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      anim.addEventListener('DOMLoaded', done);
      anim.addEventListener('config_ready', done);
      setTimeout(done, 50);
    });

    anim.resize();

    const lottieCanvas = container.querySelector('canvas');
    if (!lottieCanvas) throw new Error('renderer failed');

    // Offscreen compositing canvas (flattens transparency onto a background).
    const composite = document.createElement('canvas');
    composite.width = width;
    composite.height = height;
    const ctx = composite.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('renderer failed');

    const gif = GIFEncoder();
    const total = Math.max(1, Math.round(doc.op - doc.ip));
    const fps = Number.isFinite(doc.fr) && doc.fr > 0 ? doc.fr : 30;
    const delay = Math.round(1000 / fps);

    for (let f = 0; f < total; f++) {
      if (opts.signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      // goToAndStop(v, true) is relative to the animation's in-point
      // (lottie-web renders v + ip internally), so pass the loop index as-is.
      anim.goToAndStop(f, true);

      ctx.fillStyle = opts.bg ?? '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(lottieCanvas, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const palette = quantize(imageData.data, 256);
      const index = applyPalette(imageData.data, palette);
      gif.writeFrame(index, width, height, { palette, delay });

      opts.onProgress?.(f + 1, total);

      // Yield to the event loop periodically so the UI can repaint.
      if ((f + 1) % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    gif.finish();
    return new Blob([gif.bytesView()], { type: 'image/gif' });
  } finally {
    anim.destroy();
    container.remove();
  }
}
