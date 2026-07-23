export interface PdfAnnotationPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface PdfInkAnnotation {
  readonly id: string;
  readonly page: number;
  readonly tool: 'pen' | 'highlighter' | 'line';
  readonly color: string;
  readonly size: number;
  readonly opacity?: number;
  readonly straight?: boolean;
  readonly pressureEnabled?: boolean;
  readonly overlapProtected?: boolean;
  readonly points: readonly PdfAnnotationPoint[];
}

const DATABASE = 'revision-engine-pdf-annotations';
const STORE = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadPdfAnnotations(fingerprint: string): Promise<PdfInkAnnotation[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(fingerprint);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as PdfInkAnnotation[] : []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function savePdfAnnotations(fingerprint: string, annotations: readonly PdfInkAnnotation[]): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(annotations, fingerprint);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function deletePdfAnnotations(fingerprint: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(fingerprint);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

/** Remove every crash-recovery/editable annotation record on this device. */
export async function clearAllPdfAnnotations(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}
