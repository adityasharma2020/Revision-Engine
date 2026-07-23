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

export interface WorkspacePdf {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly local: boolean;
  readonly linkedChapterIds: readonly string[];
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
  setVisible: (visible: boolean) => void;
  setSplitPercent: (percent: number) => void;
  setMobileView: (view: 'study' | 'document') => void;
  closeDocument: () => void;
}

const PdfWorkspaceContext = createContext<PdfWorkspaceValue | null>(null);

export function PdfWorkspaceProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<WorkspacePdf[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const [splitPercent, setSplitPercent] = useState(52);
  const [mobileView, setMobileView] = useState<'study' | 'document'>('study');
  const localObjectUrls = useRef(new Map<string, string>());

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

  const createDocumentId = () => globalThis.crypto?.randomUUID?.() ?? `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const openFile = (file: File, chapterId?: string) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new Error('Choose a PDF file.');
    const id = createDocumentId();
    const url = URL.createObjectURL(file);
    localObjectUrls.current.set(id, url);
    setDocuments((current) => [...current, {
      id,
      name: file.name,
      url,
      local: true,
      linkedChapterIds: chapterId ? [chapterId] : [],
    }]);
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
      setDocuments((current) => current.map((item) => item.id === existing.id && chapterId && !item.linkedChapterIds.includes(chapterId)
        ? { ...item, linkedChapterIds: [...item.linkedChapterIds, chapterId] }
        : item));
      setActiveDocumentId(existing.id);
      setVisible(true);
      setMobileView('document');
      setPicker(null);
      return;
    }
    const id = createDocumentId();
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'Reference PDF');
    setDocuments((current) => [...current, {
      id,
      name: filename,
      url: parsed.toString(),
      local: false,
      linkedChapterIds: chapterId ? [chapterId] : [],
    }]);
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
    setDocuments((current) => current.map((item) => item.id === documentId && chapterId && !item.linkedChapterIds.includes(chapterId)
      ? { ...item, linkedChapterIds: [...item.linkedChapterIds, chapterId] }
      : item));
    setActiveDocumentId(documentId);
    setVisible(true);
    setMobileView('document');
    setPicker(null);
  }, []);

  const toggleChapterLink = useCallback((documentId: string, chapterId: string) => {
    setDocuments((current) => current.map((item) => item.id !== documentId
      ? item
      : {
          ...item,
          linkedChapterIds: item.linkedChapterIds.includes(chapterId)
            ? item.linkedChapterIds.filter((id) => id !== chapterId)
            : [...item.linkedChapterIds, chapterId],
        }));
  }, []);

  const removeDocument = useCallback((documentId: string) => {
    releaseLocalFile(documentId);
    setDocuments((current) => current.filter((item) => item.id !== documentId));
    setActiveDocumentId((current) => current === documentId ? null : current);
    if (activeDocumentId === documentId) {
      setVisible(false);
      setMobileView('study');
    }
  }, [activeDocumentId, releaseLocalFile]);

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
    setVisible,
    setSplitPercent: (percent) => setSplitPercent(Math.min(68, Math.max(32, percent))),
    setMobileView,
    closeDocument,
  }), [closeDocument, document, documents, mobileView, openDocument, removeDocument, splitPercent, toggleChapterLink, visible]);

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
  onFile: (file: File, chapterId?: string) => void;
  onUrl: (url: string, chapterId?: string) => void;
  documents: readonly WorkspacePdf[];
  onExisting: (documentId: string, chapterId?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

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
        <Button autoFocus variant='primary' onClick={() => inputRef.current?.click()}>
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
