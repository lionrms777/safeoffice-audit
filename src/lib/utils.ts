import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Compress an image file on the client before uploading.
 * Resizes to maxWidth (preserving aspect ratio) and re-encodes as JPEG.
 * Falls back to the original file if the browser doesn't support canvas.
 * Times out after 10s to prevent indefinite hangs.
 */
export function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.78,
): Promise<File> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    
    // Set a 10 second timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('⏱️ Image compression timed out, using original file');
        reject(new Error('Image compression timeout'));
      }
    }, 10000);

    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      try {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve(file);
          }
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout);
            if (resolved) return;
            resolved = true;
            
            if (!blob || blob.size >= file.size) {
              resolve(file);
            } else {
              resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            }
          },
          'image/jpeg',
          quality,
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.error('❌ Error during image compression:', error);
          reject(error);
        }
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.warn('⚠️ Failed to load image, using original file');
        resolve(file);
      }
    };
    
    img.src = url;
  });
}

/**
 * Attempts to compress an image under a target size using progressive quality and width reductions.
 */
export async function compressImageUnderSize(
  file: File,
  maxBytes = 5 * 1024 * 1024,
): Promise<File> {
  if (file.size <= maxBytes) return file;

  const attempts: Array<{ maxWidth: number; quality: number }> = [
    { maxWidth: 1600, quality: 0.82 },
    { maxWidth: 1400, quality: 0.76 },
    { maxWidth: 1200, quality: 0.7 },
    { maxWidth: 1000, quality: 0.64 },
    { maxWidth: 900, quality: 0.58 },
  ];

  let best = file;

  for (const attempt of attempts) {
    try {
      const compressed = await compressImage(best, attempt.maxWidth, attempt.quality);
      if (compressed.size < best.size) best = compressed;
      if (best.size <= maxBytes) return best;
    } catch {
      // Ignore compression errors and continue with the best candidate.
    }
  }

  return best;
}

/**
 * Wraps a promise with a timeout to prevent indefinite hangs.
 * Rejects if the promise doesn't resolve within the specified time.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}
