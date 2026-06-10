import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { LottieDoc } from '../types/lottie';

interface DotLottieManifestAnimation {
  id: string;
  loop?: boolean;
  speed?: number;
  [key: string]: any;
}

interface DotLottieManifest {
  version?: string;
  generator?: string;
  animations?: DotLottieManifestAnimation[];
  [key: string]: any;
}

/**
 * Package a Lottie document as a .lottie (dotLottie) zip archive.
 * Callers are responsible for naming the resulting file `*.lottie`.
 */
export function exportDotLottie(doc: LottieDoc, id?: string): Blob {
  const animId = id ?? 'animation';
  const manifest: DotLottieManifest = {
    version: '1.0',
    generator: 'OpenLottie Studio',
    animations: [{ id: animId, loop: true, speed: 1 }],
  };
  const zipped = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    [`animations/${animId}.json`]: strToU8(JSON.stringify(doc)),
  });
  return new Blob([zipped], { type: 'application/zip' });
}

/**
 * Extract the first animation from a .lottie (dotLottie) zip archive.
 */
export async function importDotLottie(
  data: ArrayBuffer
): Promise<{ doc: LottieDoc; name: string }> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(data));
  } catch {
    throw new Error('Invalid .lottie file: could not read zip archive');
  }

  let animationPath: string | undefined;

  // Prefer the manifest to locate the first animation.
  const manifestBytes = entries['manifest.json'];
  if (manifestBytes) {
    try {
      const manifest = JSON.parse(strFromU8(manifestBytes)) as DotLottieManifest;
      const firstId = manifest.animations?.[0]?.id;
      if (firstId && entries[`animations/${firstId}.json`]) {
        animationPath = `animations/${firstId}.json`;
      }
    } catch {
      // Malformed manifest: fall through to scanning entries.
    }
  }

  // Fallback: first entry that looks like an animation JSON.
  if (!animationPath) {
    animationPath = Object.keys(entries).find((p) => /^animations\/.+\.json$/.test(p));
  }

  if (!animationPath) {
    throw new Error('Invalid .lottie file: no animation JSON found in archive');
  }

  const doc = JSON.parse(strFromU8(entries[animationPath])) as LottieDoc;
  inlineBundledImages(doc, entries);
  const name = animationPath.replace(/^animations\//, '').replace(/\.json$/, '');
  return { doc, name };
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * dotLottie archives bundle raster assets under `images/`; the animation's
 * assets reference them by relative path, which would 404 once detached from
 * the zip. Inline them as data URIs so the doc is self-contained.
 */
function inlineBundledImages(doc: LottieDoc, entries: Record<string, Uint8Array>): void {
  if (!Array.isArray(doc.assets)) return;
  for (const asset of doc.assets) {
    if (!asset || typeof asset.p !== 'string' || Array.isArray(asset.layers)) continue;
    if (asset.p.startsWith('data:')) continue;
    const candidates = [
      `images/${asset.p}`,
      `${String(asset.u ?? '').replace(/^\//, '')}${asset.p}`,
    ];
    const path = candidates.find((c) => entries[c]);
    if (!path) continue;
    const ext = asset.p.split('.').pop()?.toLowerCase() ?? '';
    const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
    asset.p = `data:${mime};base64,${toBase64(entries[path])}`;
    asset.u = '';
    asset.e = 1;
  }
}

function looksLikeLottie(obj: any): obj is LottieDoc {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.w === 'number' &&
    typeof obj.h === 'number' &&
    typeof obj.fr === 'number' &&
    typeof obj.op === 'number' &&
    Array.isArray(obj.layers)
  );
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * Import a Lottie animation from a user-provided file (.json or .lottie).
 * Detects dotLottie archives by extension or zip magic bytes ('PK').
 */
export async function importAnyFile(
  file: File
): Promise<{ doc: LottieDoc; name: string }> {
  const baseName = stripExtension(file.name) || 'animation';
  const lower = file.name.toLowerCase();

  let doc: LottieDoc;
  let name = baseName;

  if (lower.endsWith('.lottie')) {
    const result = await importDotLottie(await file.arrayBuffer());
    doc = result.doc;
    name = baseName;
  } else if (lower.endsWith('.json')) {
    try {
      doc = JSON.parse(await file.text()) as LottieDoc;
    } catch {
      throw new Error('Not a Lottie animation file');
    }
  } else {
    // Unknown extension: sniff for zip magic bytes ('PK').
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const result = await importDotLottie(buffer);
      doc = result.doc;
      name = baseName;
    } else {
      try {
        doc = JSON.parse(strFromU8(bytes)) as LottieDoc;
      } catch {
        throw new Error('Not a Lottie animation file');
      }
    }
  }

  if (!looksLikeLottie(doc)) {
    throw new Error('Not a Lottie animation file');
  }

  // Normalize fields the editor relies on.
  if (!Array.isArray(doc.assets)) {
    doc.assets = [];
  }
  if (typeof doc.ip !== 'number') {
    doc.ip = 0;
  }

  return { doc, name };
}
