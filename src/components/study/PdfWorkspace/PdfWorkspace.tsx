import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePdfWorkspace } from '../../../context/PdfWorkspaceContext';
import { Icon } from '../../common';
import styles from './PdfWorkspace.module.css';

interface PdfWorkspaceProps {
  readonly chapterId: string;
  readonly children: ReactNode;
}

/** Keeps the study surface and a device-local PDF together without persisting the file. */
export function PdfWorkspace({ chapterId, children }: PdfWorkspaceProps) {
  const workspace = usePdfWorkspace();
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const activeDocument = workspace.document?.linkedChapterIds.includes(chapterId)
    ? workspace.document
    : null;
  const split = Boolean(activeDocument && workspace.visible);
  const viewerUrl = activeDocument
    ? `${activeDocument.url}${activeDocument.url.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&scrollbar=1&view=FitH`
    : '';

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
    <div ref={rootRef} className={`${styles.workspace} ${split ? styles.split : ''}`} style={style}>
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
                {activeDocument.local && <small>On this device</small>}
              </div>
              <div className={styles.documentActions}>
                <button type="button" onClick={() => void toggleFocus()} title={focused ? 'Exit focused workspace' : 'Focus study and PDF'} aria-label={focused ? 'Exit focused workspace' : 'Focus study and PDF'}>
                  <Icon name={focused ? 'minimize' : 'expand'} size={15} />
                </button>
                <button type="button" onClick={workspace.closeDocument} title="Close PDF" aria-label="Close PDF">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </header>
            <iframe className={styles.documentFrame} src={viewerUrl} title={`Reference PDF: ${activeDocument.name}`} />
          </aside>
        </>
      )}
    </div>
  );
}
