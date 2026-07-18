import * as pdfjsLib from 'pdfjs-dist';

// pdfjs-dist v6 requires explicit worker setup in bundlers like Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface UploadedPlan {
  imageData: ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
  sourceType: 'pdf' | 'image';
  pageCount?: number;
}

export async function loadPDFPage(file: File, pageNumber: number = 1, scaleFactor: number = 2.0): Promise<UploadedPlan> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: scaleFactor });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d')!;
  // Render white background first (PDF pages are transparent by default)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport } as any).promise;
  const imageBitmap = await createImageBitmap(canvas);
  return { imageData: imageBitmap, naturalWidth: viewport.width, naturalHeight: viewport.height, sourceType: 'pdf', pageCount: pdf.numPages };
}

export async function loadPDFPages(file: File, scaleFactor: number = 2.0): Promise<UploadedPlan[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: UploadedPlan[] = [];
  const limit = Math.min(pdf.numPages, 10);
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: scaleFactor });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport } as any).promise;
    const imageBitmap = await createImageBitmap(canvas);
    results.push({
      imageData: imageBitmap,
      naturalWidth: viewport.width,
      naturalHeight: viewport.height,
      sourceType: 'pdf',
      pageCount: pdf.numPages
    });
  }
  return results;
}

export async function loadImageFile(file: File): Promise<UploadedPlan> {
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const imageBitmap = await createImageBitmap(blob);
  return { imageData: imageBitmap, naturalWidth: imageBitmap.width, naturalHeight: imageBitmap.height, sourceType: 'image' };
}

export async function loadPlanFile(file: File): Promise<UploadedPlan> {
  if (file.type === 'application/pdf') return loadPDFPage(file);
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff'];
  if (imageTypes.includes(file.type)) return loadImageFile(file);
  throw new Error(`Unsupported file type: ${file.type}`);
}
