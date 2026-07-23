import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Icon } from '../../components/common';
import { usePdfWorkspace } from '../../context/PdfWorkspaceContext';
import { useLibrary } from '../../hooks/useChapters';
import styles from './PdfReader.module.css';

export function PdfReader() {
  const workspace = usePdfWorkspace();
  const library = useLibrary();
  const viewerRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileView, setMobileView] = useState<'documents' | 'reader'>(() => workspace.document ? 'reader' : 'documents');
  const active = workspace.document;
  const viewerUrl = active
    ? `${active.url}${active.url.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&scrollbar=1&view=FitH`
    : '';

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!active) setMobileView('documents');
  }, [active]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
    else await viewerRef.current?.requestFullscreen();
  };

  return (
    <div className={styles.page}>
      <div className={styles.reader}>
        <header className={styles.workspaceHeader}>
          <div>
            <Icon name="book" size={18} />
            <span><strong>PDF Reader</strong><small>Local files stay on this device</small></span>
          </div>
          <div className={styles.workspaceActions}>
            {active && (
              <Button
                variant="secondary"
                size="sm"
                className={styles.mobileViewToggle}
                onClick={() => setMobileView((view) => view === 'reader' ? 'documents' : 'reader')}
              >
                <Icon name={mobileView === 'reader' ? 'book' : 'monitor'} size={15} />
                {mobileView === 'reader' ? 'Documents' : 'Reader'}
              </Button>
            )}
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
            <aside className={`${styles.shelf} ${mobileView !== 'documents' ? styles.mobilePaneHidden : ''}`} aria-label="Open PDFs">
              <div className={styles.shelfHead}><strong>Open documents</strong><span>{workspace.documents.length}</span></div>
              <div className={styles.documentList}>
                {workspace.documents.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === active?.id ? styles.documentActive : styles.documentItem}
                    onClick={() => {
                      workspace.openDocument(item.id);
                      setMobileView('reader');
                    }}
                  >
                    <span className={styles.documentIcon}><Icon name="book" size={17} /></span>
                    <span><strong>{item.name}</strong><small>{item.local ? 'Local · this session' : 'Web link'} · {item.linkedChapterIds.length} linked</small></span>
                  </button>
                ))}
              </div>

              {active && (
                <section className={styles.links}>
                  <div><strong>Linked chapters</strong><small>Show this PDF in each selected chapter.</small></div>
                  <div className={styles.chapterLinks}>
                    {library.status === 'loading' && <small>Loading chapters…</small>}
                    {library.status === 'error' && <small>Chapter links are temporarily unavailable.</small>}
                    {library.status === 'success' && library.data.map((chapter) => (
                      <label key={chapter.id}>
                        <input
                          type="checkbox"
                          checked={active.linkedChapterIds.includes(chapter.id)}
                          onChange={() => workspace.toggleChapterLink(active.id, chapter.id)}
                        />
                        <span><strong>{chapter.title}</strong><small>{chapter.subject} · Chapter {chapter.chapterNumber}</small></span>
                      </label>
                    ))}
                  </div>
                  <Button variant="danger" size="sm" onClick={() => workspace.removeDocument(active.id)}>Remove from session</Button>
                </section>
              )}
            </aside>

            {active && (
              <section ref={viewerRef} className={`${styles.viewer} ${mobileView !== 'reader' ? styles.mobilePaneHidden : ''}`} aria-label={`PDF viewer: ${active.name}`}>
                <header>
                  <div><Icon name="book" size={16} /><strong title={active.name}>{active.name}</strong>{active.local && <span>Never uploaded</span>}</div>
                  <div className={styles.viewerActions}>
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
                <iframe src={viewerUrl} title={`PDF: ${active.name}`} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
