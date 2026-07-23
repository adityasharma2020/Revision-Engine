import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePdfWorkspace } from '../../../context/PdfWorkspaceContext';
import { Icon } from '../../common';
import { PdfCanvasViewer } from '../PdfCanvasViewer';
import styles from './PdfWorkspace.module.css';
import { PDF_SOFT_LIMIT_BYTES } from '../../../services/pdf/PdfCloudStore';

interface PdfWorkspaceProps {
  readonly chapterId: string;
  readonly children: ReactNode;
}

/** Keeps the study surface and a device-local PDF together without persisting the file. */
export function PdfWorkspace({ chapterId, children }: PdfWorkspaceProps) {
  const workspace = usePdfWorkspace();
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const activeDocument = workspace.document?.linkedChapterIds.includes(chapterId)
    ? workspace.document
    : null;
  const split = Boolean(activeDocument && workspace.visible);

  useEffect(() => {
    const update = () => setFocused(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggleFocus = async () => {
    if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen();
  };

  const moveDivider = (clientX: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    workspace.setSplitPercent(((clientX - bounds.left) / bounds.width) * 100);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveDivider(event.clientX);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveDivider(event.clientX);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') workspace.setSplitPercent(32);
    else if (event.key === 'End') workspace.setSplitPercent(68);
    else workspace.setSplitPercent(workspace.splitPercent + (event.key === 'ArrowRight' ? 2 : -2));
  };

  const style = { '--study-percent': `${workspace.splitPercent}%` } as CSSProperties;

  return (
    <div ref={rootRef} className={`${styles.workspace} ${split ? styles.split : ''}`} style={style} data-pdf-workspace-split={split}>
      {split && (
        <div className={styles.mobileSwitcher} role="tablist" aria-label="Study workspace view">
          <button
            type="button"
            role="tab"
            aria-selected={workspace.mobileView === 'study'}
            className={workspace.mobileView === 'study' ? styles.mobileActive : ''}
            onClick={() => workspace.setMobileView('study')}
          >
            <Icon name="book" size={15} /> Study
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspace.mobileView === 'document'}
            className={workspace.mobileView === 'document' ? styles.mobileActive : ''}
            onClick={() => workspace.setMobileView('document')}
          >
            <Icon name="monitor" size={15} /> PDF
          </button>
        </div>
      )}

      <main className={`${styles.studyPane} ${split && workspace.mobileView === 'document' ? styles.mobileHidden : ''}`}>
        {children}
      </main>

      {split && activeDocument && (
        <>
          <button
            type="button"
            className={styles.divider}
            role="separator"
            aria-label="Resize PDF and study panes"
            aria-orientation="vertical"
            aria-valuemin={32}
            aria-valuemax={68}
            aria-valuenow={Math.round(workspace.splitPercent)}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onKeyDown={moveWithKeyboard}
          >
            <span />
          </button>
          <aside className={`${styles.documentPane} ${workspace.mobileView === 'study' ? styles.mobileHidden : ''}`} aria-label="Reference PDF">
            <header className={styles.documentToolbar}>
              <div className={styles.documentIdentity}>
                <Icon name="book" size={16} />
                <span title={activeDocument.name}>{activeDocument.name}</span>
                <small>{activeDocument.cloud?.sourceUrl ? 'Public URL · synced' : activeDocument.cloud ? 'Cloud file' : activeDocument.local ? 'Local file' : 'Public URL'}</small>
              </div>
              <div className={styles.documentActions}>
                <button type="button" onClick={() => { setCloudError(''); setCloudDialogOpen(true); }} title={activeDocument.cloud ? 'Synced privately across devices' : 'Save PDF to cloud'} aria-label={activeDocument.cloud ? 'PDF cloud sync active' : 'Save PDF to cloud'}>
                  <Icon name={activeDocument.cloud ? 'cloudCheck' : 'cloudUpload'} size={15} />
                </button>
                <button type="button" onClick={() => void toggleFocus()} title={focused ? 'Exit focused workspace' : 'Focus study and PDF'} aria-label={focused ? 'Exit focused workspace' : 'Focus study and PDF'}>
                  <Icon name={focused ? 'minimize' : 'expand'} size={15} />
                </button>
                <button type="button" onClick={workspace.closeDocument} title="Close PDF" aria-label="Close PDF">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </header>
            <PdfCanvasViewer controlsInHeader className={styles.documentFrame} url={activeDocument.url} sourceData={activeDocument.sourceData} name={activeDocument.name} fileHandle={activeDocument.fileHandle} cloudAnnotations={activeDocument.cloud?.annotations} onCloudAnnotationsChange={activeDocument.cloud ? (annotations) => workspace.syncCloudAnnotations(activeDocument.id, annotations) : undefined} />
            {cloudDialogOpen && <div className={styles.cloudBackdrop} onPointerDown={() => !cloudBusy && setCloudDialogOpen(false)}>
              <section className={styles.cloudDialog} role="dialog" aria-modal="true" aria-labelledby="chapter-cloud-title" onPointerDown={(event) => event.stopPropagation()}>
                <header><span><Icon name={activeDocument.cloud ? 'cloudCheck' : 'cloudUpload'} size={19} /></span><div><strong id="chapter-cloud-title">{activeDocument.cloud?.sourceUrl ? 'Public link is synced' : activeDocument.cloud ? 'Cloud sync is active' : 'Use this PDF across devices?'}</strong><small>{activeDocument.name}</small></div><button type="button" onClick={() => setCloudDialogOpen(false)} aria-label="Close"><Icon name="close" size={15} /></button></header>
                <div className={styles.cloudDialogBody}><p>{activeDocument.cloud?.sourceUrl ? 'Only the public URL, chapter links and annotations sync. No complete PDF file is stored in your private cloud.' : activeDocument.cloud ? 'The source PDF is stored once. Only lightweight annotation changes sync afterward.' : 'Upload the source once, then keep editable annotations synchronized privately across your signed-in devices.'}</p>{!activeDocument.cloud && (activeDocument.sizeBytes ?? 0) > PDF_SOFT_LIMIT_BYTES && <p className={styles.cloudWarning}>Large PDF · {((activeDocument.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB. Upload only if cross-device access is important.</p>}{cloudError && <p className={styles.cloudError} role="alert">{cloudError}</p>}</div>
                <footer><button type="button" onClick={() => setCloudDialogOpen(false)}>{activeDocument.cloud ? 'Done' : 'Keep local'}</button>{!activeDocument.cloud && <button type="button" disabled={cloudBusy} onClick={() => { setCloudBusy(true); setCloudError(''); void workspace.uploadDocumentToCloud(activeDocument.id).then(() => setCloudDialogOpen(false)).catch((reason) => setCloudError(reason instanceof Error ? reason.message : 'Upload failed.')).finally(() => setCloudBusy(false)); }}>{cloudBusy ? 'Uploading…' : 'Upload privately'}</button>}</footer>
              </section>
            </div>}
          </aside>
        </>
      )}
    </div>
  );
}
