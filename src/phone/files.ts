/** Client-side preparation of photos and PDFs before upload. */

/** Vercel functions accept ~4.5 MB bodies: stay under this many base64 characters per request. */
export const SAFE_BODY_B64 = 4_100_000;
/** PDFs up to this size (binary bytes) are sent as-is to the AI; larger ones are sent as text or page images. */
export const DIRECT_PDF_BYTES = 2_900_000;
export const MAX_PHOTOS = 6;

export interface PreparedImage {
  /** base64 without data: prefix */
  data: string;
  /** object URL for thumbnails */
  preview: string;
  width: number;
  height: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through (older Safari, HEIC…) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Draws a (bitmap|image|canvas) into a JPEG no larger than maxSide. */
async function toJpeg(src: CanvasImageSource & { width: number; height: number }, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode photo'))), 'image/jpeg', quality));
  return { blob, w, h };
}

/** Resize a photo to ≤ maxSide px JPEG (default 1600 px, q 0.8). */
export async function prepareImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<PreparedImage> {
  const bmp = await decode(file);
  const { blob, w, h } = await toJpeg(bmp as CanvasImageSource & { width: number; height: number }, maxSide, quality);
  if ('close' in bmp) bmp.close();
  return { data: await blobToBase64(blob), preview: URL.createObjectURL(blob), width: w, height: h };
}

/** Re-encode a set of photos smaller when their total would not fit in one request. */
export async function fitImages(files: Blob[]): Promise<PreparedImage[]> {
  let out = await Promise.all(files.map((f) => prepareImage(f)));
  const total = () => out.reduce((s, i) => s + i.data.length, 0);
  for (const [side, q] of [
    [1400, 0.72],
    [1200, 0.65],
    [1000, 0.6],
  ] as const) {
    if (total() <= SAFE_BODY_B64) break;
    out.forEach((i) => URL.revokeObjectURL(i.preview));
    out = await Promise.all(files.map((f) => prepareImage(f, side, q)));
  }
  return out;
}

export function fileToBase64(file: Blob): Promise<string> {
  return blobToBase64(file);
}

// ─── PDF (pdfjs-dist, lazy) ──────────────────────────────────────────────────

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  return (pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
    return lib;
  }));
}

export interface PdfInfo {
  pages: number;
  /** Text layer (may be empty for scanned PDFs), capped to maxChars. */
  text: string;
  /** Render page `i` (1-based) to a JPEG for the AI when the PDF itself is too big. */
  renderPage(i: number): Promise<PreparedImage>;
}

export async function readPdf(file: Blob, maxChars = 60_000, maxPages = 80): Promise<PdfInfo> {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  let text = '';
  const n = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= n && text.length < maxChars; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let line = '';
    for (const item of tc.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue;
      line += item.str;
      if (item.hasEOL) {
        text += line.trimEnd() + '\n';
        line = '';
      }
    }
    if (line) text += line.trimEnd() + '\n';
    text += '\n';
  }
  return {
    pages: doc.numPages,
    text: text.replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars),
    async renderPage(i: number) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1600 / Math.max(v1.width, v1.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { blob, w, h } = await toJpeg(canvas, 1600, 0.75);
      return { data: await blobToBase64(blob), preview: URL.createObjectURL(blob), width: w, height: h };
    },
  };
}
