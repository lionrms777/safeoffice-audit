export interface PendingPhotoUpload {
  id: string;
  auditId: string;
  sectionId: string;
  itemId: string;
  photoId: string;
  fileName: string;
  fileType: string;
  dataUrl: string;
  createdAt: string;
  lastError?: string;
}

const QUEUE_STORAGE_KEY = 'safeoffice.pendingPhotoUploads.v1';

const readQueue = (): PendingPhotoUpload[] => {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: PendingPhotoUpload[]) => {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

export const getPendingUploads = (): PendingPhotoUpload[] => readQueue();

export const getPendingUploadsForAudit = (auditId: string): PendingPhotoUpload[] =>
  readQueue().filter((item) => item.auditId === auditId);

export const addPendingUpload = (upload: PendingPhotoUpload): PendingPhotoUpload[] => {
  const queue = readQueue();
  const next = [
    ...queue.filter(
      (item) =>
        !(item.auditId === upload.auditId && item.itemId === upload.itemId && item.photoId === upload.photoId),
    ),
    upload,
  ];
  writeQueue(next);
  return next;
};

export const removePendingUpload = (id: string): PendingPhotoUpload[] => {
  const next = readQueue().filter((item) => item.id !== id);
  writeQueue(next);
  return next;
};

export const removePendingUploadsForItem = (auditId: string, itemId: string): PendingPhotoUpload[] => {
  const next = readQueue().filter((item) => !(item.auditId === auditId && item.itemId === itemId));
  writeQueue(next);
  return next;
};

export const removePendingUploadForPhoto = (auditId: string, photoId: string): PendingPhotoUpload[] => {
  const next = readQueue().filter(
    (item) => !(item.auditId === auditId && item.photoId === photoId),
  );
  writeQueue(next);
  return next;
};

export const updatePendingUploadError = (id: string, message: string): PendingPhotoUpload[] => {
  const next = readQueue().map((item) => (item.id === id ? { ...item, lastError: message } : item));
  writeQueue(next);
  return next;
};

export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file for offline queue'));
    reader.readAsDataURL(file);
  });
};

export const dataUrlToFile = (dataUrl: string, fileName: string, fileType = 'image/jpeg'): File => {
  const [meta, base64] = dataUrl.split(',');
  const inferredType = meta?.match(/data:(.*?);base64/)?.[1] || fileType;
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: inferredType });
};
