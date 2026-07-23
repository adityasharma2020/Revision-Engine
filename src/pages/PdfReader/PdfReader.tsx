import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Icon } from '../../components/common';
import { usePdfWorkspace } from '../../context/PdfWorkspaceContext';
import { useLibrary } from '../../hooks/useChapters';
import { PdfCanvasViewer } from '../../components/study/PdfCanvasViewer';
import styles from './PdfReader.module.css';
import { PDF_SOFT_LIMIT_BYTES } from '../../services/pdf/PdfCloudStore';
import { useAuth } from '../../context/AuthContext';

const cloudDecisionKey = (id: string) => `revision-engine:pdf-cloud-decision:${id}`;

export function PdfReader() {
  const workspace = usePdfWorkspace();
  const { status: authStatus } = useAuth();
  const library = useLibrary();
  const viewerRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [documentBrowserOpen, setDocumentBrowserOpen] = useState(false);
  const [chapterLinksOpen, setChapterLinksOpen] = useState(false);
  const [documentQuery, setDocumentQuery] = useState('');
  const [chapterQuery, setChapterQuery] = useState('');
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [cloudPromptOpen, setCloudPromptOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const active = workspace.document;
  const visibleDocuments = useMemo(() => {
    const query = documentQuery.trim().toLocaleLowerCase();
    return query ? workspace.documents.filter((item) => item.name.toLocaleLowerCase().includes(query)) : workspace.documents;
  }, [documentQuery, workspace.documents]);
  const visibleChapters = useMemo(() => {
    if (library.status !== 'success' || !active) return [];
    const query = chapterQuery.trim().toLocaleLowerCase();
    return library.data
      .filter((chapter) => !linkedOnly || active.linkedChapterIds.includes(chapter.id))
      .filter((chapter) => !query || `${chapter.title} ${chapter.subject} ${chapter.chapterNumber}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => Number(active.linkedChapterIds.includes(right.id)) - Number(active.linkedChapterIds.includes(left.id)) || left.title.localeCompare(right.title));
  }, [active, chapterQuery, library, linkedOnly]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !active?.local || active.cloud || localStorage.getItem(cloudDecisionKey(active.id))) return;
    setCloudError(''); setCloudPromptOpen(true);
  }, [active, authStatus]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
    else await viewerRef.current?.requestFullscreen();
  };
  const openDocumentBrowser = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setDocumentBrowserOpen(true);
  };
  const openChapterManager = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    setChapterLinksOpen(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.reader}>
        <header className={styles.workspaceHeader} data-tour="pdf-reader">
          <div>
            <Icon name="book" size={18} />
            <span><strong>PDF Reader</strong><small>Local files stay on this device</small></span>
          </div>
          <div className={styles.workspaceActions}>
            <Button variant="secondary" size="sm" onClick={() => void openDocumentBrowser()}>
              <Icon name="book" size={15} /><span>Documents</span><small>{workspace.documents.length}</small>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => workspace.chooseDocument()}><Icon name="plus" size={15} />Add PDF</Button>
          </div>
        </header>

        {workspace.documents.length === 0 ? (
          <EmptyState
            icon="book"
            title="No PDFs open"
            description="Choose a local PDF or direct web link. Local files remain only in this browser session and are never uploaded."
            action={<Button variant="primary" onClick={() => workspace.chooseDocument()}>Open a PDF</Button>}
          />
        ) : (
          <div className={styles.readerLayout}>
            {active && (
              <section ref={viewerRef} className={styles.viewer} aria-label={`PDF viewer: ${active.name}`}>
                <header>
                  <button type="button" className={styles.activeDocument} onClick={() => void openDocumentBrowser()} title="Switch PDF">
                    <Icon name="book" size={16} /><strong title={active.name}>{active.name}</strong>{active.local && <span>On this device</span>}<Icon name="chevronDown" size={13} />
                  </button>
                  <div className={styles.viewerActions}>
                    <button type="button" onClick={() => { setCloudError(''); setCloudPromptOpen(true); }} title={active.cloud ? 'Synced privately across devices' : 'Save PDF to cloud'} aria-label={active.cloud ? 'PDF cloud sync active' : 'Save PDF to cloud'}>
                      <Icon name="sync" size={15} /><span>{active.cloud ? 'Cloud' : 'Sync'}</span>
                    </button>
                    <button type="button" onClick={() => void openChapterManager()} title="Manage linked chapters" aria-label="Manage linked chapters">
                      <Icon name="settings" size={15} />
                      <span>Chapters</span>
                      {active.linkedChapterIds.length > 0 && <b>{active.linkedChapterIds.length}</b>}
                    </button>
                    <button type="button" onClick={() => workspace.chooseDocument()} title="Open another PDF" aria-label="Open another PDF">
                      <Icon name="plus" size={15} />
                      <span>Open</span>
                    </button>
                    <button type="button" onClick={() => void toggleFullscreen()} title={fullscreen ? 'Exit PDF only view' : 'PDF only view'} aria-label={fullscreen ? 'Exit PDF only view' : 'PDF only view'}>
                      <Icon name={fullscreen ? 'minimize' : 'expand'} size={15} />
                      <span>{fullscreen ? 'Exit focus' : 'PDF only'}</span>
                    </button>
                  </div>
                </header>
                <PdfCanvasViewer controlsInHeader className={styles.documentFrame} url={active.url} name={active.name} fileHandle={active.fileHandle} cloudAnnotations={active.cloud?.annotations} onCloudAnnotationsChange={active.cloud ? (annotations) => workspace.syncCloudAnnotations(active.id, annotations) : undefined} />
              </section>
            )}
            {!active && <section className={styles.noSelection}><Icon name="book" size={24} /><strong>Select a PDF to continue</strong><Button variant="primary" onClick={() => void openDocumentBrowser()}>Browse documents</Button></section>}
          </div>
        )}
      </div>

      {documentBrowserOpen && <div className={styles.managerBackdrop} onPointerDown={() => setDocumentBrowserOpen(false)}>
        <section className={styles.manager} role="dialog" aria-modal="true" aria-labelledby="document-manager-title" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><strong id="document-manager-title">Your PDFs</strong><small>{workspace.documents.length} open this session</small></div><button type="button" onClick={() => setDocumentBrowserOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
          <label className={styles.managerSearch}><Icon name="search" size={15} /><input autoFocus type="search" value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Search PDFs…" /><span>{visibleDocuments.length}</span></label>
          <div className={styles.managedList}>
            {visibleDocuments.map((item) => <article key={item.id} className={item.id === active?.id ? styles.managedActive : ''}>
              <button type="button" onClick={() => { workspace.openDocument(item.id); setDocumentBrowserOpen(false); }}>
                <span className={styles.documentIcon}><Icon name="book" size={16} /></span><span><strong>{item.name}</strong><small>{item.local ? 'On this device' : 'Web PDF'} · {item.linkedChapterIds.length} linked</small></span>{item.id === active?.id && <Icon name="check" size={15} />}
              </button>
              <button type="button" onClick={() => workspace.removeDocument(item.id)} aria-label={`Remove ${item.name} from this session`} title="Remove from session"><Icon name="close" size={14} /></button>
            </article>)}
            {!visibleDocuments.length && <div className={styles.managerEmpty}>No PDFs match “{documentQuery}”.</div>}
            {workspace.cloudDocuments.filter((cloud) => !workspace.documents.some((item) => item.id === cloud.id) && (!documentQuery.trim() || cloud.name.toLocaleLowerCase().includes(documentQuery.trim().toLocaleLowerCase()))).map((cloud) => <article key={cloud.id} className={styles.cloudDocument}>
              <button type="button" onClick={() => { setCloudError(''); void workspace.openCloudDocument(cloud.id).then(() => setDocumentBrowserOpen(false)).catch((reason) => setCloudError(reason instanceof Error ? reason.message : 'Could not open cloud PDF.')); }}>
                <span className={styles.documentIcon}><Icon name="sync" size={16} /></span><span><strong>{cloud.name}</strong><small>Cloud · {(cloud.sizeBytes / 1024 / 1024).toFixed(1)} MB · revision {cloud.revision}</small></span><Icon name="chevronRight" size={15} />
              </button>
            </article>)}
            {cloudError && <div className={styles.cloudError} role="alert">{cloudError}</div>}
          </div>
          <footer><Button variant="primary" size="sm" onClick={() => { setDocumentBrowserOpen(false); workspace.chooseDocument(); }}><Icon name="plus" size={15} /> Add PDF</Button></footer>
        </section>
      </div>}

      {cloudPromptOpen && active && <div className={styles.managerBackdrop} onPointerDown={() => !cloudBusy && setCloudPromptOpen(false)}>
        <section className={`${styles.manager} ${styles.cloudPrompt}`} role="dialog" aria-modal="true" aria-labelledby="cloud-pdf-title" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><strong id="cloud-pdf-title">{active.cloud ? 'Cloud sync is active' : 'Keep this PDF across devices?'}</strong><small>{active.name}</small></div><button type="button" disabled={cloudBusy} onClick={() => setCloudPromptOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
          <div className={styles.cloudPromptBody}>
            <span className={styles.cloudMark}><Icon name="sync" size={22} /></span>
            {active.cloud ? <><strong>Saved privately to your account</strong><p>The PDF is uploaded once. Future pen, highlighter and eraser changes sync as small annotation updates—not another full PDF.</p></> : <><strong>Upload once, annotate everywhere</strong><p>The source PDF stays private. Annotation changes are version checked, so another device cannot silently overwrite this one.</p>{(active.sizeBytes ?? 0) > PDF_SOFT_LIMIT_BYTES && <p className={styles.sizeWarning}><strong>Large PDF · {((active.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB</strong><br />This exceeds the recommended 10 MB cloud size. Upload only if you need it across devices.</p>}</>}
            {cloudError && <p className={styles.cloudError} role="alert">{cloudError}</p>}
          </div>
          <footer><Button variant="secondary" size="sm" disabled={cloudBusy} onClick={() => { if (!active.cloud) localStorage.setItem(cloudDecisionKey(active.id), 'local'); setCloudPromptOpen(false); }}>{active.cloud ? 'Done' : 'Keep local only'}</Button>{!active.cloud && <Button variant="primary" size="sm" disabled={cloudBusy} onClick={() => { setCloudBusy(true); setCloudError(''); void workspace.uploadDocumentToCloud(active.id).then(() => { localStorage.setItem(cloudDecisionKey(active.id), 'cloud'); setCloudPromptOpen(false); }).catch((reason) => setCloudError(reason instanceof Error ? reason.message : 'Upload failed.')).finally(() => setCloudBusy(false)); }}>{cloudBusy ? 'Uploading…' : 'Upload privately'}</Button>}</footer>
        </section>
      </div>}

      {chapterLinksOpen && active && <div className={styles.managerBackdrop} onPointerDown={() => setChapterLinksOpen(false)}>
        <section className={`${styles.manager} ${styles.chapterManager}`} role="dialog" aria-modal="true" aria-labelledby="chapter-manager-title" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><strong id="chapter-manager-title">Linked chapters</strong><small>{active.linkedChapterIds.length} linked to {active.name}</small></div><button type="button" onClick={() => setChapterLinksOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
          <label className={styles.managerSearch}><Icon name="search" size={15} /><input autoFocus type="search" value={chapterQuery} onChange={(event) => setChapterQuery(event.target.value)} placeholder="Search chapters or subjects…" /><span>{visibleChapters.length}</span></label>
          <div className={styles.linkFilters}><button type="button" className={!linkedOnly ? styles.filterActive : ''} onClick={() => setLinkedOnly(false)}>All chapters</button><button type="button" className={linkedOnly ? styles.filterActive : ''} onClick={() => setLinkedOnly(true)}>Linked only <span>{active.linkedChapterIds.length}</span></button></div>
          <div className={styles.managedList}>
            {library.status === 'loading' && <div className={styles.managerEmpty}>Loading chapters…</div>}
            {library.status === 'error' && <div className={styles.managerEmpty}>Chapter links are temporarily unavailable.</div>}
            {visibleChapters.map((chapter) => {
              const linked = active.linkedChapterIds.includes(chapter.id);
              return <label key={chapter.id} className={linked ? styles.chapterLinked : ''}><input type="checkbox" checked={linked} onChange={() => workspace.toggleChapterLink(active.id, chapter.id)} /><span><strong>{chapter.title}</strong><small>{chapter.subject} · Chapter {chapter.chapterNumber}</small></span><i>{linked ? 'Linked' : 'Link'}</i></label>;
            })}
            {library.status === 'success' && !visibleChapters.length && <div className={styles.managerEmpty}>{linkedOnly ? 'No linked chapters match this search.' : 'No chapters match this search.'}</div>}
          </div>
          <footer><span>Changes apply immediately</span><Button variant="primary" size="sm" onClick={() => setChapterLinksOpen(false)}>Done</Button></footer>
        </section>
      </div>}
    </div>
  );
}
