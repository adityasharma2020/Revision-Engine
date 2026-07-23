import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cx } from '../../../utils/cx';
import { Icon } from '../../common';
import styles from './PdfCanvasViewer.module.css';

interface PdfCanvasViewerProps {
  readonly url: string;
  readonly name: string;
  readonly className?: string;
}

/** PDF.js-backed reader that also works for local blob URLs on iOS. */
export function PdfCanvasViewer({ url, name, className }: PdfCanvasViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setError('');
    setDocument(null);
    setPageNumber(1);
    setZoom(1);
    void import('pdfjs-dist').then((pdfjs) => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      task = pdfjs.getDocument({ url });
      return task.promise;
    }).then((loaded) => {
      if (!loaded || cancelled) return;
      setDocument(loaded);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError('This PDF could not be displayed inside the app.');
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || width <= 0) return;
    let disposed = false;
    renderTaskRef.current?.cancel();
    void document.getPage(pageNumber).then((page) => {
      if (disposed) return;
      const natural = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(240, width - 24);
      const scale = (availableWidth / natural.width) * zoom;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      renderTaskRef.current = renderTask;
      return renderTask.promise;
    }).catch((reason: unknown) => {
      if (!disposed && reason instanceof Error && reason.name !== 'RenderingCancelledException') {
        setError('This page could not be rendered.');
      }
    });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, pageNumber, width, zoom]);

  const pages = document?.numPages ?? 0;
  const goTo = (page: number) => setPageNumber(Math.min(pages, Math.max(1, page)));

  return (
    <div className={cx(styles.reader, className)} data-pdf-canvas-reader>
      {document && (
        <div className={styles.controls} aria-label="PDF controls">
          <button type="button" disabled={pageNumber <= 1} onClick={() => goTo(pageNumber - 1)} aria-label="Previous page"><Icon name="arrowLeft" size={16} /></button>
          <label aria-label="Current PDF page"><input type="number" min={1} max={pages} value={pageNumber} onChange={(event) => goTo(Number(event.target.value) || 1)} /><span>/ {pages}</span></label>
          <button type="button" disabled={pageNumber >= pages} onClick={() => goTo(pageNumber + 1)} aria-label="Next page" className={styles.next}><Icon name="arrowLeft" size={16} /></button>
          <span className={styles.divider} />
          <button type="button" disabled={zoom <= .6} onClick={() => setZoom((value) => Math.max(.6, value - .2))} aria-label="Zoom out">−</button>
          <button type="button" className={styles.zoom} onClick={() => setZoom(1)} aria-label="Fit page width">{Math.round(zoom * 100)}%</button>
          <button type="button" disabled={zoom >= 2.4} onClick={() => setZoom((value) => Math.min(2.4, value + .2))} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
        </div>
      )}
      <div ref={viewportRef} className={styles.viewport}>
        {loading && <div className={styles.status}><span className={styles.spinner} /><strong>Opening PDF…</strong><small>{name}</small></div>}
        {error && <div className={styles.status}><Icon name="book" size={24} /><strong>Unable to open PDF</strong><small>{error}</small><a href={url} target="_blank" rel="noreferrer">Open in browser</a></div>}
        {!error && <canvas ref={canvasRef} aria-label={`${name}, page ${pageNumber} of ${pages || 1}`} />}
      </div>
    </div>
  );
}
