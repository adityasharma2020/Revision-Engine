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
import { clearStoredWorkspacePdfs } from '../services/pdf/PdfWorkspaceStore';
import { downloadCloudPdf, listCloudPdfs, PdfCloudConflictError, syncCloudPdfUrl, updateCloudAnnotations, uploadCloudPdf, type CloudPdfRecord } from '../services/pdf/PdfCloudStore';
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
  /** Cloud PDF bytes kept only in memory, avoiding fragile blob-URL handoffs. */
  readonly sourceData?: Uint8Array;
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
  cloudError: string;
  refreshCloudDocuments: () => Promise<void>;
  uploadDocumentToCloud: (documentId: string) => Promise<void>;
  openCloudDocument: (documentId: string, chapterId?: string) => Promise<void>;
  syncCloudAnnotations: (documentId: string, annotations: readonly PdfInkAnnotation[]) => Promise<void>;
  setVisible: (visible: boolean) => void;
  setSplitPercent: (percent: number) => void;
  setMobileView: (view: 'study' | 'document') => void;
  closeDocument: () => void;
  deselectDocument: () => void;
}

const PdfWorkspaceContext = createContext<PdfWorkspaceValue | null>(null);
const failureMessage = (reason: unknown, fallback: string) => {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') return reason.message;
  return fallback;
};

const assignChapterToDocument = (documents: readonly WorkspacePdf[], documentId: string, chapterId: string, link: boolean) => documents.map((item) => {
  const linked = item.linkedChapterIds.includes(chapterId);
  if (item.id === documentId) {
    if (linked === link) return item;
    return { ...item, linkedChapterIds: link ? [...item.linkedChapterIds, chapterId] : item.linkedChapterIds.filter((id) => id !== chapterId) };
  }
  if (link && linked) return { ...item, linkedChapterIds: item.linkedChapterIds.filter((id) => id !== chapterId) };
  return item;
});

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
  const [cloudError, setCloudError] = useState('');

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
    // Device files and unsynced public URLs are deliberately session-only.
    // Remove metadata written by older versions so a refresh always starts
    // clean unless the document was explicitly synchronized to Supabase.
    void clearStoredWorkspacePdfs().catch(() => undefined);
  }, []);

  const refreshCloudDocuments = useCallback(async () => {
    if (authStatus !== 'authenticated') { setCloudDocuments([]); setCloudStatus('unavailable'); setCloudError(''); return; }
    setCloudStatus('loading'); setCloudError('');
    try {
      const items = await listCloudPdfs();
      // Older builds allowed the same chapter to appear on multiple PDFs.
      // Keep the most recently updated assignment and repair older records
      // using annotation-only updates, never another PDF upload.
      const claimedChapters = new Set<string>();
      const normalized = items.map((item) => {
        const linkedChapterIds = item.linkedChapterIds.filter((id) => {
          if (claimedChapters.has(id)) return false;
          claimedChapters.add(id); return true;
        });
        return linkedChapterIds.length === item.linkedChapterIds.length ? item : { ...item, linkedChapterIds };
      });
      setCloudDocuments(normalized);
      setCloudStatus('ready');
      for (let index = 0; index < items.length; index += 1) {
        if (items[index] === normalized[index]) continue;
        const repaired = await updateCloudAnnotations(items[index], items[index].annotations, normalized[index].linkedChapterIds);
        setCloudDocuments((current) => current.map((item) => item.id === repaired.id ? repaired : item));
      }
    } catch (reason) {
      setCloudStatus('error');
      setCloudError(failureMessage(reason, 'Could not load PDFs saved to your account.'));
    }
  }, [authStatus]);

  useEffect(() => { void refreshCloudDocuments(); }, [refreshCloudDocuments]);

  // Reconcile an already-open session document with its cloud record without
  // retaining any device-only workspace metadata between page loads.
  useEffect(() => {
    if (cloudStatus !== 'ready') return;
    setDocuments((current) => current.map((item) => {
      const cloud = cloudDocuments.find((candidate) => candidate.id === item.id);
      if (!cloud) return item;
      if (item.cloud === cloud && item.linkedChapterIds === cloud.linkedChapterIds) return item;
      return { ...item, cloud, linkedChapterIds: cloud.linkedChapterIds };
    }));
  }, [cloudDocuments, cloudStatus]);

  const createDocumentId = () => globalThis.crypto?.randomUUID?.() ?? `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const syncExclusiveCloudLink = useCallback(async (documentId: string, chapterId: string, link: boolean) => {
    const affected = cloudDocuments.filter((item) => item.id === documentId
      ? item.linkedChapterIds.includes(chapterId) !== link
      : link && item.linkedChapterIds.includes(chapterId));
    let target = cloudDocuments.find((item) => item.id === documentId);
    for (const item of affected) {
      const shouldContain = item.id === documentId && link;
      const linkedChapterIds = shouldContain
        ? [...item.linkedChapterIds, chapterId]
        : item.linkedChapterIds.filter((id) => id !== chapterId);
      const updated = await updateCloudAnnotations(item, item.annotations, linkedChapterIds);
      if (updated.id === documentId) target = updated;
      setCloudDocuments((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setDocuments((current) => current.map((candidate) => candidate.id === updated.id ? { ...candidate, cloud: updated, linkedChapterIds: updated.linkedChapterIds } : candidate));
    }
    return target;
  }, [cloudDocuments]);

  const updateLocalChapterAssignment = useCallback((documentId: string, chapterId: string, link: boolean) => {
    setDocuments((current) => assignChapterToDocument(current, documentId, chapterId, link));
  }, []);

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
    setDocuments((current) => {
      const unlinked = chapterId ? assignChapterToDocument(current, id, chapterId, true) : current;
      return [...unlinked, next];
    });
    if (chapterId) void syncExclusiveCloudLink(id, chapterId, true).catch(() => undefined);
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
      if (chapterId) {
        updateLocalChapterAssignment(existing.id, chapterId, true);
        void syncExclusiveCloudLink(existing.id, chapterId, true).catch(() => undefined);
      }
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
    setDocuments((current) => {
      const unlinked = chapterId ? assignChapterToDocument(current, id, chapterId, true) : current;
      return [...unlinked, next];
    });
    if (chapterId) void syncExclusiveCloudLink(id, chapterId, true).catch(() => undefined);
    setActiveDocumentId(id);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
    if (user) void syncCloudPdfUrl(user.id, id, next.name, next.url, next.linkedChapterIds).then((cloud) => {
      setCloudDocuments((current) => [cloud, ...current.filter((item) => item.id !== cloud.id)]);
      setDocuments((current) => current.map((item) => item.id === id ? { ...item, cloud } : item));
    }).catch((reason) => {
      setCloudStatus('error');
      setCloudError(failureMessage(reason, 'The public PDF link could not be synced.'));
    });
  };

  const closeDocument = useCallback(() => {
    setVisible(false);
    setMobileView('study');
  }, []);

  const deselectDocument = useCallback(() => {
    setActiveDocumentId(null);
    setVisible(false);
    setMobileView('study');
  }, []);

  const openDocument = useCallback((documentId: string, chapterId?: string) => {
    if (chapterId) {
      updateLocalChapterAssignment(documentId, chapterId, true);
      void syncExclusiveCloudLink(documentId, chapterId, true).catch(() => undefined);
    }
    setActiveDocumentId(documentId);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
  }, [syncExclusiveCloudLink, updateLocalChapterAssignment]);

  const toggleChapterLink = useCallback((documentId: string, chapterId: string) => {
    const link = !documents.find((item) => item.id === documentId)?.linkedChapterIds.includes(chapterId);
    updateLocalChapterAssignment(documentId, chapterId, link);
    void syncExclusiveCloudLink(documentId, chapterId, link).catch((reason) => {
      setCloudStatus('error');
      setCloudError(failureMessage(reason, 'The chapter link could not be synchronized.'));
    });
  }, [documents, syncExclusiveCloudLink, updateLocalChapterAssignment]);

  const removeDocument = useCallback((documentId: string) => {
    releaseLocalFile(documentId);
    localBlobs.current.delete(documentId);
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

  const openCloudDocument = useCallback(async (documentId: string, chapterId?: string) => {
    const existing = documents.find((item) => item.id === documentId);
    let record = cloudDocuments.find((item) => item.id === documentId);
    if (!record) throw new Error('Cloud PDF is unavailable.');
    if (chapterId) record = await syncExclusiveCloudLink(documentId, chapterId, true) ?? record;
    if (chapterId) updateLocalChapterAssignment(documentId, chapterId, true);
    if (record.sourceUrl) {
      const next: WorkspacePdf = { id: record.id, name: record.name, url: record.sourceUrl, local: false, linkedChapterIds: record.linkedChapterIds, cloud: record, sizeBytes: 0 };
      setDocuments((current) => existing ? current.map((item) => item.id === record!.id ? next : item) : [...current, next]);
      setActiveDocumentId(record.id); setVisible(true); setMobileView('document'); setPicker(null);
      return;
    }
    const blob = await downloadCloudPdf(record);
    const sourceData = new Uint8Array(await blob.arrayBuffer());
    const url = URL.createObjectURL(blob);
    const previousUrl = localObjectUrls.current.get(record.id);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    localObjectUrls.current.set(record.id, url); localBlobs.current.set(record.id, blob);
    const baseLinks = existing?.linkedChapterIds ?? record.linkedChapterIds;
    const linkedChapterIds = chapterId && !baseLinks.includes(chapterId) ? [...baseLinks, chapterId] : baseLinks;
    const next: WorkspacePdf = { id: record.id, name: record.name, url, local: true, linkedChapterIds, cloud: record, sizeBytes: record.sizeBytes, sourceData };
    setDocuments((current) => existing
      ? current.map((item) => item.id === record.id ? next : item)
      : [...current, next]);
    setActiveDocumentId(record.id); setVisible(true); setMobileView('document');
    setPicker(null);
  }, [cloudDocuments, documents, syncExclusiveCloudLink, updateLocalChapterAssignment]);

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
    cloudError,
    refreshCloudDocuments,
    uploadDocumentToCloud,
    openCloudDocument,
    syncCloudAnnotations,
    setVisible,
    setSplitPercent: (percent) => setSplitPercent(Math.min(68, Math.max(32, percent))),
    setMobileView,
    closeDocument,
    deselectDocument,
  }), [closeDocument, cloudDocuments, cloudError, cloudStatus, deselectDocument, document, documents, mobileView, openCloudDocument, openDocument, refreshCloudDocuments, removeDocument, splitPercent, syncCloudAnnotations, toggleChapterLink, uploadDocumentToCloud, visible]);

  const pickerDialog = picker ? (
    <PdfPickerDialog
      request={picker}
      onClose={() => setPicker(null)}
      onFile={openFile}
      onUrl={openUrl}
      documents={documents}
      onExisting={openDocument}
      cloudDocuments={cloudDocuments}
      cloudStatus={cloudStatus}
      cloudError={cloudError}
      onRefreshCloud={refreshCloudDocuments}
      onCloud={openCloudDocument}
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
  cloudDocuments,
  cloudStatus,
  cloudError,
  onRefreshCloud,
  onCloud,
}: {
  request: PickerRequest;
  onClose: () => void;
  onFile: (file: File, chapterId?: string, fileHandle?: FileSystemFileHandle) => void;
  onUrl: (url: string, chapterId?: string) => void;
  documents: readonly WorkspacePdf[];
  onExisting: (documentId: string, chapterId?: string) => void;
  cloudDocuments: readonly CloudPdfRecord[];
  cloudStatus: PdfWorkspaceValue['cloudStatus'];
  cloudError: string;
  onRefreshCloud: () => Promise<void>;
  onCloud: (documentId: string, chapterId?: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [replacement, setReplacement] = useState<{ currentName: string; nextName: string; action: () => void | Promise<void> } | null>(null);
  const currentChapterPdf = request.chapterId
    ? [...documents, ...cloudDocuments].find((item) => item.linkedChapterIds.includes(request.chapterId!))
    : undefined;
  const localDocuments = documents.filter((item) => item.local && !item.cloud);
  const publicDocuments = documents.filter((item) => !item.local && !item.cloud);
  const publicCloudDocuments = cloudDocuments.filter((item) => item.sourceUrl);
  const storedCloudDocuments = cloudDocuments.filter((item) => !item.sourceUrl);

  const runOrConfirmReplacement = (nextId: string | undefined, nextName: string, action: () => void | Promise<void>) => {
    if (currentChapterPdf && currentChapterPdf.id !== nextId) {
      setReplacement({ currentName: currentChapterPdf.name, nextName, action });
      return;
    }
    void action();
  };

  const confirmReplacement = () => {
    if (!replacement) return;
    const action = replacement.action;
    setReplacement(null);
    Promise.resolve(action()).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not replace the chapter PDF.'));
  };

  const chooseLocalPdf = async () => {
    const picker = (window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
    if (!picker) { inputRef.current?.click(); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] });
      if (!handle) return;
      const file = await handle.getFile();
      runOrConfirmReplacement(undefined, file.name, () => onFile(file, request.chapterId, handle));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Could not open this PDF.');
    }
  };

  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const parsed = new URL(url.trim());
      const existing = documents.find((item) => !item.local && item.url === parsed.toString());
      const name = decodeURIComponent(parsed.pathname.split('/').pop() || 'Web PDF');
      runOrConfirmReplacement(existing?.id, name, () => onUrl(url.trim(), request.chapterId));
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
          Device files and unsynced public links last only for this session. Refreshing the app removes them.
        </p>
        {localDocuments.length > 0 && (
          <div className={styles.existingDocuments}>
            <strong>Local files · {localDocuments.length}</strong>
            {localDocuments.map((item) => (
              <button type='button' key={item.id} onClick={() => runOrConfirmReplacement(item.id, item.name, () => onExisting(item.id, request.chapterId))}>
                <Icon name='book' size={16} />
                <span>{item.name}<small>Local file · Linked to {item.linkedChapterIds.length} chapter{item.linkedChapterIds.length === 1 ? '' : 's'}</small></span>
                <Icon name='chevronRight' size={15} />
              </button>
            ))}
          </div>
        )}
        {(publicDocuments.length > 0 || publicCloudDocuments.length > 0) && (
          <div className={styles.existingDocuments}>
            <strong>Public PDF links · {publicDocuments.length + publicCloudDocuments.length}</strong>
            {publicDocuments.map((item) => (
              <button type='button' key={item.id} onClick={() => runOrConfirmReplacement(item.id, item.name, () => onExisting(item.id, request.chapterId))}>
                <Icon name='share' size={16} />
                <span>{item.name}<small>Public URL · Linked to {item.linkedChapterIds.length} chapter{item.linkedChapterIds.length === 1 ? '' : 's'}</small></span>
                <Icon name='chevronRight' size={15} />
              </button>
            ))}
            {publicCloudDocuments.map((item) => (
              <button type='button' key={item.id} onClick={() => runOrConfirmReplacement(item.id, item.name, () => {
                setError('');
                return onCloud(item.id, request.chapterId).then(onClose).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open this public PDF.'));
              })}>
                <Icon name='share' size={16} />
                <span>{item.name}<small>Public URL · Synced · Linked to {item.linkedChapterIds.length} chapter{item.linkedChapterIds.length === 1 ? '' : 's'}</small></span>
                <Icon name='chevronRight' size={15} />
              </button>
            ))}
          </div>
        )}
        {cloudStatus !== 'unavailable' && (
          <div className={styles.existingDocuments}>
            <strong>Private cloud files · {storedCloudDocuments.length}</strong>
            {cloudStatus === 'loading' && <small>Loading PDFs saved to your account…</small>}
            {cloudStatus === 'error' && <p className={styles.pickerError} role='alert'>{cloudError || 'Could not load your cloud files.'} <button type='button' onClick={() => void onRefreshCloud()}>Retry</button></p>}
            {cloudStatus === 'ready' && storedCloudDocuments.length === 0 && <small>No complete PDF files are stored in your private cloud.</small>}
            {storedCloudDocuments.map((item) => (
              <button type='button' key={item.id} onClick={() => runOrConfirmReplacement(item.id, item.name, () => {
                setError('');
                return onCloud(item.id, request.chapterId).then(onClose).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open this cloud PDF.'));
              })}>
                <Icon name='cloud' size={16} />
                <span>{item.name}<small>{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB stored · Linked to {item.linkedChapterIds.length} chapter{item.linkedChapterIds.length === 1 ? '' : 's'}</small></span>
                <Icon name='chevronRight' size={15} />
              </button>
            ))}
          </div>
        )}
        {(localDocuments.length > 0 || publicDocuments.length > 0 || cloudDocuments.length > 0) && <div className={styles.or}><span>or add another PDF</span></div>}
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
              runOrConfirmReplacement(undefined, file.name, () => onFile(file, request.chapterId));
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
        {replacement && <div className={styles.replaceBackdrop} role='presentation'>
          <section className={styles.replaceDialog} role='alertdialog' aria-modal='true' aria-labelledby='replace-pdf-title'>
            <span className={styles.replaceIcon}><Icon name='unlink' size={20} /></span>
            <div><strong id='replace-pdf-title'>This chapter already has a PDF</strong><p><b>{replacement.currentName}</b> is currently linked. Replace it with <b>{replacement.nextName}</b>?</p></div>
            <footer><Button variant='secondary' onClick={() => setReplacement(null)}>Keep current</Button><Button variant='primary' onClick={confirmReplacement}>Replace PDF</Button></footer>
          </section>
        </div>}
      </section>
    </div>
  );
}
