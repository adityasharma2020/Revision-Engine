import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon } from '../components/common';
import styles from '../components/study/PdfWorkspace/PdfWorkspace.module.css';
import { deleteStoredWorkspacePdf, loadStoredWorkspacePdfs, saveStoredWorkspacePdf, type StoredWorkspacePdf } from '../services/pdf/PdfWorkspaceStore';
import { downloadCloudPdf, listCloudPdfs, PdfCloudConflictError, updateCloudAnnotations, uploadCloudPdf, type CloudPdfRecord } from '../services/pdf/PdfCloudStore';
import type { PdfInkAnnotation } from '../services/pdf/PdfAnnotationStore';
import { useAuth } from './AuthContext';

export interface WorkspacePdf {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly local: boolean;
  readonly linkedChapterIds: readonly string[];
  readonly fileHandle?: FileSystemFileHandle;
  readonly cloud?: CloudPdfRecord;
  readonly sizeBytes?: number;
}

interface PickerRequest {
  readonly chapterId?: string;
}

interface PdfWorkspaceValue {
  documents: readonly WorkspacePdf[];
  document: WorkspacePdf | null;
  visible: boolean;
  splitPercent: number;
  mobileView: 'study' | 'document';
  chooseDocument: (chapterId?: string) => void;
  openDocument: (documentId: string, chapterId?: string) => void;
  toggleChapterLink: (documentId: string, chapterId: string) => void;
  removeDocument: (documentId: string) => void;
  cloudDocuments: readonly CloudPdfRecord[];
  cloudStatus: 'unavailable' | 'loading' | 'ready' | 'error';
  uploadDocumentToCloud: (documentId: string) => Promise<void>;
  openCloudDocument: (documentId: string) => Promise<void>;
  syncCloudAnnotations: (documentId: string, annotations: readonly PdfInkAnnotation[]) => Promise<void>;
  setVisible: (visible: boolean) => void;
  setSplitPercent: (percent: number) => void;
  setMobileView: (view: 'study' | 'document') => void;
  closeDocument: () => void;
}

const PdfWorkspaceContext = createContext<PdfWorkspaceValue | null>(null);

export function PdfWorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [documents, setDocuments] = useState<WorkspacePdf[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const [splitPercent, setSplitPercent] = useState(52);
  const [mobileView, setMobileView] = useState<'study' | 'document'>('study');
  const localObjectUrls = useRef(new Map<string, string>());
  const localBlobs = useRef(new Map<string, Blob>());
  const [cloudDocuments, setCloudDocuments] = useState<CloudPdfRecord[]>([]);
  const [cloudStatus, setCloudStatus] = useState<'unavailable' | 'loading' | 'ready' | 'error'>('unavailable');

  const document = documents.find((item) => item.id === activeDocumentId) ?? null;

  const releaseLocalFile = useCallback((documentId: string) => {
    const url = localObjectUrls.current.get(documentId);
    if (!url) return;
    URL.revokeObjectURL(url);
    localObjectUrls.current.delete(documentId);
  }, []);

  useEffect(() => () => {
    for (const url of localObjectUrls.current.values()) URL.revokeObjectURL(url);
    localObjectUrls.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadStoredWorkspacePdfs().then(async (stored) => {
      if (cancelled) return;
      const candidates = await Promise.all(stored.map(async (item): Promise<WorkspacePdf | null> => {
        let blob = item.blob;
        if (item.local && item.fileHandle) blob = await item.fileHandle.getFile().catch(() => blob);
        if (item.local && !blob) return null;
        const url = item.local ? URL.createObjectURL(blob!) : item.sourceUrl;
        if (!url) return null;
        if (item.local) { localObjectUrls.current.set(item.id, url); localBlobs.current.set(item.id, blob!); }
        return { id: item.id, name: item.name, url, local: item.local, linkedChapterIds: item.linkedChapterIds, fileHandle: item.fileHandle, sizeBytes: blob?.size };
      }));
      if (cancelled) return;
      const restored = candidates.filter((item): item is WorkspacePdf => item !== null);
      setDocuments((current) => [...restored.filter((saved) => !current.some((item) => item.id === saved.id)), ...current]);
      setActiveDocumentId((current) => current ?? restored.at(-1)?.id ?? null);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') { setCloudDocuments([]); setCloudStatus('unavailable'); return; }
    let cancelled = false; setCloudStatus('loading');
    void listCloudPdfs().then((items) => { if (!cancelled) {
      setCloudDocuments(items);
      setDocuments((current) => current.map((document) => {
        const cloud = items.find((item) => item.id === document.id);
        return cloud ? { ...document, cloud, linkedChapterIds: cloud.linkedChapterIds } : document;
      }));
      setCloudStatus('ready');
    } }).catch(() => { if (!cancelled) setCloudStatus('error'); });
    return () => { cancelled = true; };
  }, [authStatus]);

  const persistDocument = useCallback((document: WorkspacePdf, blob?: Blob) => {
    const persistedBlob = blob ?? localBlobs.current.get(document.id);
    const stored: StoredWorkspacePdf = {
      id: document.id,
      name: document.name,
      local: document.local,
      linkedChapterIds: document.linkedChapterIds,
      sourceUrl: document.local ? undefined : document.url,
      blob: persistedBlob,
      fileHandle: document.fileHandle,
      openedAt: Date.now(),
    };
    void saveStoredWorkspacePdf(stored).catch(() => {
      // Some browsers cannot structured-clone file handles. The Blob remains
      // sufficient to restore reading and chapter links after refresh.
      if (stored.fileHandle) void saveStoredWorkspacePdf({ ...stored, fileHandle: undefined }).catch(() => undefined);
    });
  }, []);

  const createDocumentId = () => globalThis.crypto?.randomUUID?.() ?? `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const openFile = (file: File, chapterId?: string, fileHandle?: FileSystemFileHandle) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new Error('Choose a PDF file.');
    const id = createDocumentId();
    const url = URL.createObjectURL(file);
    localObjectUrls.current.set(id, url);
    localBlobs.current.set(id, file);
    const next: WorkspacePdf = {
      id,
      name: file.name,
      url,
      local: true,
      fileHandle,
      sizeBytes: file.size,
      linkedChapterIds: chapterId ? [chapterId] : [],
    };
    setDocuments((current) => [...current, next]);
    persistDocument(next, file);
    setActiveDocumentId(id);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
  };

  const openUrl = (rawUrl: string, chapterId?: string) => {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Use a valid http or https PDF URL.');
    }
    const existing = documents.find((item) => !item.local && item.url === parsed.toString());
    if (existing) {
      setDocuments((current) => current.map((item) => {
        if (item.id !== existing.id || !chapterId || item.linkedChapterIds.includes(chapterId)) return item;
        const next = { ...item, linkedChapterIds: [...item.linkedChapterIds, chapterId] };
        persistDocument(next); return next;
      }));
      setActiveDocumentId(existing.id);
      setVisible(true);
      setMobileView('document');
      setPicker(null);
      return;
    }
    const id = createDocumentId();
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'Reference PDF');
    const next: WorkspacePdf = {
      id,
      name: filename,
      url: parsed.toString(),
      local: false,
      linkedChapterIds: chapterId ? [chapterId] : [],
    };
    setDocuments((current) => [...current, next]);
    persistDocument(next);
    setActiveDocumentId(id);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
  };

  const closeDocument = useCallback(() => {
    setVisible(false);
    setMobileView('study');
  }, []);

  const openDocument = useCallback((documentId: string, chapterId?: string) => {
    setDocuments((current) => current.map((item) => {
      if (item.id !== documentId || !chapterId || item.linkedChapterIds.includes(chapterId)) return item;
      const next = { ...item, linkedChapterIds: [...item.linkedChapterIds, chapterId] };
      persistDocument(next); return next;
    }));
    setActiveDocumentId(documentId);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
  }, [persistDocument]);

  const toggleChapterLink = useCallback((documentId: string, chapterId: string) => {
    setDocuments((current) => current.map((item) => {
      if (item.id !== documentId) return item;
      const next = {
          ...item,
          linkedChapterIds: item.linkedChapterIds.includes(chapterId)
            ? item.linkedChapterIds.filter((id) => id !== chapterId)
            : [...item.linkedChapterIds, chapterId],
        };
      persistDocument(next);
      return next;
    }));
  }, [persistDocument]);

  const removeDocument = useCallback((documentId: string) => {
    releaseLocalFile(documentId);
    localBlobs.current.delete(documentId);
    void deleteStoredWorkspacePdf(documentId).catch(() => undefined);
    setDocuments((current) => current.filter((item) => item.id !== documentId));
    setActiveDocumentId((current) => current === documentId ? null : current);
    if (activeDocumentId === documentId) {
      setVisible(false);
      setMobileView('study');
    }
  }, [activeDocumentId, releaseLocalFile]);

  const uploadDocumentToCloud = useCallback(async (documentId: string) => {
    if (!user) throw new Error('Sign in before saving a PDF to the cloud.');
    const item = documents.find((candidate) => candidate.id === documentId);
    if (!item) throw new Error('PDF is unavailable.');
    let blob = localBlobs.current.get(documentId);
    if (!blob && item.fileHandle) blob = await item.fileHandle.getFile();
    if (!blob) { const response = await fetch(item.url); if (!response.ok) throw new Error('This web PDF could not be downloaded for cloud storage.'); blob = await response.blob(); }
    const record = await uploadCloudPdf(user.id, item.id, item.name, blob, item.linkedChapterIds);
    setCloudDocuments((current) => [record, ...current.filter((candidate) => candidate.id !== record.id)]);
    setDocuments((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, cloud: record } : candidate));
  }, [documents, user]);

  const openCloudDocument = useCallback(async (documentId: string) => {
    const existing = documents.find((item) => item.id === documentId);
    if (existing) { openDocument(documentId); return; }
    const record = cloudDocuments.find((item) => item.id === documentId);
    if (!record) throw new Error('Cloud PDF is unavailable.');
    const blob = await downloadCloudPdf(record); const url = URL.createObjectURL(blob);
    localObjectUrls.current.set(record.id, url); localBlobs.current.set(record.id, blob);
    const next: WorkspacePdf = { id: record.id, name: record.name, url, local: true, linkedChapterIds: record.linkedChapterIds, cloud: record, sizeBytes: record.sizeBytes };
    setDocuments((current) => [...current, next]); persistDocument(next, blob);
    setActiveDocumentId(record.id); setVisible(true); setMobileView('document');
  }, [cloudDocuments, documents, openDocument, persistDocument]);

  const syncCloudAnnotations = useCallback(async (documentId: string, annotations: readonly PdfInkAnnotation[]) => {
    const item = documents.find((candidate) => candidate.id === documentId); if (!item?.cloud) return;
    try {
      const record = await updateCloudAnnotations(item.cloud, annotations, item.linkedChapterIds);
      setCloudDocuments((current) => current.map((candidate) => candidate.id === record.id ? record : candidate));
      setDocuments((current) => current.map((candidate) => candidate.id === record.id ? { ...candidate, cloud: record } : candidate));
    } catch (reason) {
      if (reason instanceof PdfCloudConflictError) {
        setCloudStatus('error');
        // Detach this in-memory copy from automatic sync. Its local crash-safe
        // annotations remain intact, while the newer cloud copy is untouched.
        setDocuments((current) => current.map((candidate) => candidate.id === documentId ? { ...candidate, cloud: undefined } : candidate));
        throw reason;
      }
      throw reason;
    }
  }, [documents]);

  const value = useMemo<PdfWorkspaceValue>(() => ({
    documents,
    document,
    visible,
    splitPercent,
    mobileView,
    chooseDocument: (chapterId) => setPicker({ chapterId }),
    openDocument,
    toggleChapterLink,
    removeDocument,
    cloudDocuments,
    cloudStatus,
    uploadDocumentToCloud,
    openCloudDocument,
    syncCloudAnnotations,
    setVisible,
    setSplitPercent: (percent) => setSplitPercent(Math.min(68, Math.max(32, percent))),
    setMobileView,
    closeDocument,
  }), [closeDocument, cloudDocuments, cloudStatus, document, documents, mobileView, openCloudDocument, openDocument, removeDocument, splitPercent, syncCloudAnnotations, toggleChapterLink, uploadDocumentToCloud, visible]);

  const pickerDialog = picker ? (
    <PdfPickerDialog
      request={picker}
      onClose={() => setPicker(null)}
      onFile={openFile}
      onUrl={openUrl}
      documents={documents}
      onExisting={openDocument}
    />
  ) : null;
  const fullscreenHost = typeof globalThis.document === 'undefined'
    ? null
    : globalThis.document?.fullscreenElement ?? null;

  return (
    <PdfWorkspaceContext.Provider value={value}>
      {children}
      {pickerDialog && fullscreenHost
        ? createPortal(pickerDialog, fullscreenHost)
        : pickerDialog}
    </PdfWorkspaceContext.Provider>
  );
}

export function usePdfWorkspace(): PdfWorkspaceValue {
  const value = useContext(PdfWorkspaceContext);
  if (!value) throw new Error('usePdfWorkspace must be used within PdfWorkspaceProvider');
  return value;
}

function PdfPickerDialog({
  request,
  onClose,
  onFile,
  onUrl,
  documents,
  onExisting,
}: {
  request: PickerRequest;
  onClose: () => void;
  onFile: (file: File, chapterId?: string, fileHandle?: FileSystemFileHandle) => void;
  onUrl: (url: string, chapterId?: string) => void;
  documents: readonly WorkspacePdf[];
  onExisting: (documentId: string, chapterId?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const chooseLocalPdf = async () => {
    const picker = (window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
    if (!picker) { inputRef.current?.click(); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] });
      if (!handle) return;
      onFile(await handle.getFile(), request.chapterId, handle);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Could not open this PDF.');
    }
  };

  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      onUrl(url.trim(), request.chapterId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this URL.');
    }
  };

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className={styles.pickerBackdrop} onMouseDown={onClose}>
      <section className={styles.picker} role='dialog' aria-modal='true' aria-labelledby='pdf-picker-title' onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Local document workspace</span><h2 id='pdf-picker-title'>Open a reference PDF</h2></div>
          <button type='button' onClick={onClose} aria-label='Close'><Icon name='close' /></button>
        </header>
        <p className={styles.privacyNote}>
          <Icon name='monitor' size={17} />
          A local file stays on this device. It is displayed through a temporary browser URL and is never uploaded or synced.
        </p>
        {documents.length > 0 && (
          <div className={styles.existingDocuments}>
            <strong>{request.chapterId ? 'Link an open document' : 'Open from this session'}</strong>
            {documents.map((item) => (
              <button type='button' key={item.id} onClick={() => onExisting(item.id, request.chapterId)}>
                <Icon name='book' size={16} />
                <span>{item.name}<small>{item.local ? 'This device' : 'Web link'} · Linked to {item.linkedChapterIds.length} chapter{item.linkedChapterIds.length === 1 ? '' : 's'}</small></span>
                <Icon name='chevronRight' size={15} />
              </button>
            ))}
            <div className={styles.or}><span>or add another PDF</span></div>
          </div>
        )}
        <input
          ref={inputRef}
          className={styles.fileInput}
          type='file'
          accept='application/pdf,.pdf'
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setError('');
            try {
              onFile(file, request.chapterId);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Could not read this file.');
            }
          }}
        />
        <Button autoFocus variant='primary' onClick={() => void chooseLocalPdf()}>
          <Icon name='book' size={16} /> Choose PDF from this device
        </Button>
        <div className={styles.or}><span>or open a direct PDF link</span></div>
        <form onSubmit={submitUrl} className={styles.urlForm}>
          <label>
            PDF URL
            <input type='url' required value={url} onChange={(event) => setUrl(event.target.value)} placeholder='https://example.com/document.pdf' />
          </label>
          <Button type='submit' variant='secondary'>Open URL</Button>
        </form>
        <small>Some websites block embedded documents. If that happens, you can still open the link in a separate browser tab.</small>
        {error && <p className={styles.pickerError} role='alert'>{error}</p>}
      </section>
    </div>
  );
}
