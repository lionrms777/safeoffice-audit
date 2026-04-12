import { 
  ref, 
  uploadBytesResumable,
  getDownloadURL, 
  deleteObject,
  getBytes,
} from 'firebase/storage';
import { storage } from './firebase';
import { Audit } from '../types';

export interface UploadedPhotoMeta {
  downloadURL: string;
  storagePath: string;
}

const MAX_UPLOAD_ATTEMPTS = 2;
const STALL_TIMEOUT_MS = 45000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const getStorageErrorMessage = (error: unknown, stalled: boolean) => {
  if (stalled) {
    return 'Upload stalled due to a slow or unstable network. Please retry.';
  }

  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';

  switch (code) {
    case 'storage/unauthorized':
      return 'You do not have permission to upload photos. Please sign in again.';
    case 'storage/canceled':
      return 'Upload was canceled. Please try again.';
    case 'storage/quota-exceeded':
      return 'Storage quota has been exceeded. Contact your administrator.';
    case 'storage/retry-limit-exceeded':
      return 'Upload retry limit exceeded. Please check your connection and retry.';
    default:
      return error instanceof Error ? error.message : 'Unknown storage upload error';
  }
};

const uploadAuditPhotoOnce = async (
  auditId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadedPhotoMeta> => {
  const safeName = sanitizeFileName(file.name || 'photo.jpg');
  const storagePath = `audits/${auditId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  return new Promise<UploadedPhotoMeta>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'image/jpeg',
    });

    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        task.cancel();
      }, STALL_TIMEOUT_MS);
    };

    resetStallTimer();

    task.on(
      'state_changed',
      (snapshot) => {
        resetStallTimer();
        if (onProgress) {
          const progress = snapshot.totalBytes > 0
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          onProgress(progress);
        }
      },
      (error) => {
        if (stallTimer) clearTimeout(stallTimer);
        reject(new Error(getStorageErrorMessage(error, stalled)));
      },
      async () => {
        try {
          if (stallTimer) clearTimeout(stallTimer);
          const downloadURL = await getDownloadURL(task.snapshot.ref);
          resolve({ downloadURL, storagePath });
        } catch (error) {
          reject(new Error(getStorageErrorMessage(error, false)));
        }
      }
    );
  });
};

export const uploadAuditPhotoWithMeta = async (
  auditId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadedPhotoMeta> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const uploaded = await uploadAuditPhotoOnce(auditId, file, onProgress);
      console.log('✅ Photo uploaded to Storage:', uploaded.downloadURL);
      return uploaded;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Upload attempt ${attempt} failed:`, error);
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await sleep(700 * attempt);
      }
    }
  }

  console.error('❌ Error uploading photo after retries:', lastError);
  throw lastError instanceof Error ? lastError : new Error('Photo upload failed after retries');
};

export const uploadAuditPhoto = async (auditId: string, file: File): Promise<string> => {
  const uploaded = await uploadAuditPhotoWithMeta(auditId, file);
  return uploaded.downloadURL;
};

const isLikelyDownloadUrl = (value: string) => /^https?:\/\//i.test(value);

export const resolvePhotoDownloadUrl = async (photoPathOrUrl?: string): Promise<string | null> => {
  const raw = (photoPathOrUrl || '').trim();
  if (!raw) return null;
  try {
    if (isLikelyDownloadUrl(raw)) return raw;
    const photoRef = ref(storage, raw);
    return await getDownloadURL(photoRef);
  } catch (error) {
    console.warn('⚠️ Failed to resolve photo download URL:', raw, error);
    return null;
  }
};

/** Download raw bytes for a Firebase Storage path using the SDK (bypasses CORS). */
export const getPhotoBytes = async (photoPathOrUrl: string): Promise<Uint8Array | null> => {
  try {
    const storageRef = ref(storage, photoPathOrUrl);
    const buffer = await getBytes(storageRef);
    return new Uint8Array(buffer);
  } catch (error) {
    console.warn('⚠️ getBytes failed for:', photoPathOrUrl, error);
    return null;
  }
};

/** Download raw bytes via a plain fetch — works reliably for Firebase download URLs. */
const getPhotoBytesViaFetch = async (downloadUrl: string): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      console.warn('⚠️ fetch failed for photo URL, status:', response.status);
      return null;
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.warn('⚠️ fetch failed for photo URL:', downloadUrl, error);
    return null;
  }
};

export const getPhotoBytesByPreference = async (photoPath?: string, photoUrl?: string): Promise<Uint8Array | null> => {
  const path = (photoPath || '').trim();
  const url = (photoUrl || '').trim();

  // Try storage SDK path first (most reliable, auth-aware)
  if (path) {
    const bytesFromPath = await getPhotoBytes(path);
    if (bytesFromPath) return bytesFromPath;
  }

  // Fallback: fetch the download URL directly
  if (url) {
    const bytesFromFetch = await getPhotoBytesViaFetch(url);
    if (bytesFromFetch) return bytesFromFetch;
    // Last resort: try SDK with the URL itself
    return await getPhotoBytes(url);
  }

  return null;
};

export const deletePhoto = async (photoPathOrUrl: string) => {
  try {
    const photoRef = ref(storage, photoPathOrUrl);
    await deleteObject(photoRef);
    console.log('✅ Photo deleted from Storage');
  } catch (error) {
    console.error('❌ Error deleting photo:', error);
    throw error;
  }
};

export const getChecklistPhotoUrls = (audit: Audit): string[] => {
  const urls = new Set<string>();
  audit.sections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.photoUrl?.trim()) urls.add(item.photoUrl.trim());
      if (item.photoPath?.trim()) urls.add(item.photoPath.trim());
    });
  });
  return [...urls];
};

export const getAllAuditAttachmentUrls = (audit: Audit): string[] => {
  const urls = new Set<string>(getChecklistPhotoUrls(audit));
  if (audit.siteLogoUrl?.trim()) urls.add(audit.siteLogoUrl.trim());
  if (audit.siteLogoPath?.trim()) urls.add(audit.siteLogoPath.trim());
  if (audit.siteBuildingPhotoUrl?.trim()) urls.add(audit.siteBuildingPhotoUrl.trim());
  if (audit.siteBuildingPhotoPath?.trim()) urls.add(audit.siteBuildingPhotoPath.trim());
  return [...urls];
};

export const deletePhotosSafely = async (photoUrls: string[]) => {
  const unique = [...new Set(photoUrls.filter(Boolean))];
  if (unique.length === 0) return;

  await Promise.all(unique.map(async (url) => {
    try {
      await deletePhoto(url);
    } catch (error) {
      console.warn('⚠️ Failed to delete attachment, continuing:', url, error);
    }
  }));
};
