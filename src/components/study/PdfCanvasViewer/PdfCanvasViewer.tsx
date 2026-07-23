import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cx } from '../../../utils/cx';
import { Icon } from '../../common';
import styles from './PdfCanvasViewer.module.css';

interface PdfCanvasViewerProps { readonly url: string; readonly name: string; readonly className?: string }

function PdfPage({ document, pageNumber, width, zoom, rotation, register }: { document: PDFDocumentProxy; pageNumber: number; width: number; zoom: number; rotation: number; register: (page: number, node: HTMLElement | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    let disposed = false;
    taskRef.current?.cancel();
    setError(false);
    void document.getPage(pageNumber).then((page) => {
      if (disposed) return;
      const natural = page.getViewport({ scale: 1, rotation });
      const scale = (Math.max(240, width - 24) / natural.width) * zoom;
      const viewport = page.getViewport({ scale, rotation });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      taskRef.current = task;
      return task.promise;
    }).catch((reason: unknown) => {
      if (!disposed && reason instanceof Error && reason.name !== 'RenderingCancelledException') setError(true);
    });
    return () => { disposed = true; taskRef.current?.cancel(); };
  }, [document, pageNumber, rotation, width, zoom]);
  return <section ref={(node) => register(pageNumber, node)} className={styles.page} data-pdf-page={pageNumber} aria-label={`Page ${pageNumber}`}>
    <small>{pageNumber}</small>
    {error ? <span className={styles.pageError}>Page could not be rendered.</span> : <canvas ref={canvasRef} />}
  </section>;
}

/** Continuous PDF.js reader with page jump, swipe navigation, zoom and text search. */
export function PdfCanvasViewer({ url, name, className }: PdfCanvasViewerProps) {
  const readerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pageText, setPageText] = useState<string[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false);
  const resumePageRef = useRef<number | null>(null);
  const positionKey = useMemo(() => {
    let hash = 2166136261;
    for (const character of `${name}|${url}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return `revision-engine:pdf-position:${(hash >>> 0).toString(36)}`;
  }, [name, url]);

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
    let saved: { page?: number; zoom?: number; rotation?: number } = {};
    try { saved = JSON.parse(sessionStorage.getItem(positionKey) ?? '{}') as typeof saved; } catch { /* start fresh */ }
    const savedPage = Math.max(1, Number(saved.page) || 1);
    resumePageRef.current = savedPage;
    setLoading(true); setError(''); setDocument(null); setPageNumber(savedPage); setZoom(Number(saved.zoom) || 1); setRotation(Number(saved.rotation) || 0); setPageText([]); setQuery('');
    void import('pdfjs-dist').then((pdfjs) => {
      if (cancelled) return undefined;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      task = pdfjs.getDocument({ url });
      return task.promise;
    }).then((loaded) => { if (loaded && !cancelled) { setDocument(loaded); setLoading(false); } }).catch(() => { if (!cancelled) { setError('This PDF could not be displayed inside the app.'); setLoading(false); } });
    return () => { cancelled = true; void task?.destroy(); };
  }, [positionKey, url]);

  useEffect(() => {
    if (!document || width <= 0 || resumePageRef.current === null) return;
    const page = Math.min(document.numPages, resumePageRef.current);
    resumePageRef.current = null;
    const frame = window.requestAnimationFrame(() => pageRefs.current.get(page)?.scrollIntoView({ behavior: 'auto', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [document, width]);

  useEffect(() => {
    if (!document) return;
    sessionStorage.setItem(positionKey, JSON.stringify({ page: pageNumber, zoom, rotation }));
  }, [document, pageNumber, positionKey, rotation, zoom]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!document || !root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const page = Number((visible?.target as HTMLElement | undefined)?.dataset.pdfPage);
      if (page) setPageNumber(page);
    }, { root, threshold: [.15, .35, .55, .75] });
    for (const node of pageRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [document, width]);

  useEffect(() => {
    if (!document || !searchOpen || pageText.length === document.numPages) return;
    let cancelled = false;
    setIndexing(true);
    void Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => 'str' in item ? item.str : '').join(' ');
    })).then((text) => { if (!cancelled) setPageText(text); }).finally(() => { if (!cancelled) setIndexing(false); });
    return () => { cancelled = true; };
  }, [document, pageText.length, searchOpen]);

  const pages = document?.numPages ?? 0;
  const goTo = (page: number, behavior: ScrollBehavior = 'smooth') => {
    const next = Math.min(pages, Math.max(1, page));
    setPageNumber(next);
    pageRefs.current.get(next)?.scrollIntoView({ behavior, block: 'start' });
  };
  const results = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return [];
    return pageText.flatMap((text, index) => {
      const lower = text.toLocaleLowerCase();
      const at = lower.indexOf(clean);
      if (at < 0) return [];
      const start = Math.max(0, at - 45); const end = Math.min(text.length, at + clean.length + 70);
      return [{ page: index + 1, excerpt: `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}` }];
    });
  }, [pageText, query]);

  const swipeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    touchRef.current = { x: event.clientX, y: event.clientY };
  };
  const swipeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = touchRef.current; touchRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(pageNumber + (dx < 0 ? 1 : -1));
  };

  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable="true"]') && !(event.ctrlKey || event.metaKey)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); return; }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goTo(pageNumber + 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(pageNumber - 1); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((value) => Math.min(2.4, value + .2)); }
    else if (event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(.6, value - .2)); }
    else if (event.key === 'Escape') { setSearchOpen(false); setDocumentMenuOpen(false); }
  };

  return <div ref={readerRef} className={cx(styles.reader, className)} data-pdf-canvas-reader tabIndex={0} onKeyDown={keyboard}>
    {document && <>
      <div className={styles.controls} aria-label="PDF controls">
        <button type="button" disabled={pageNumber <= 1} onClick={() => goTo(pageNumber - 1)} aria-label="Previous page"><Icon name="arrowLeft" size={16} /></button>
        <label aria-label="Current PDF page"><input type="number" min={1} max={pages} value={pageNumber} onChange={(event) => goTo(Number(event.target.value) || 1)} /><span>/ {pages}</span></label>
        <button type="button" disabled={pageNumber >= pages} onClick={() => goTo(pageNumber + 1)} aria-label="Next page" className={styles.next}><Icon name="arrowLeft" size={16} /></button>
        <span className={styles.divider} />
        <button type="button" disabled={zoom <= .6} onClick={() => setZoom((value) => Math.max(.6, value - .2))} aria-label="Zoom out">−</button>
        <button type="button" className={styles.zoom} onClick={() => setZoom(1)} aria-label="Fit page width">{Math.round(zoom * 100)}%</button>
        <button type="button" disabled={zoom >= 2.4} onClick={() => setZoom((value) => Math.min(2.4, value + .2))} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
        <span className={styles.divider} />
        <button type="button" className={searchOpen ? styles.searchActive : ''} onClick={() => setSearchOpen((open) => !open)} aria-label="Search inside PDF"><Icon name="search" size={16} /></button>
        <div className={styles.documentMenuHost}>
          <button type="button" className={documentMenuOpen ? styles.searchActive : ''} onClick={() => setDocumentMenuOpen((open) => !open)} aria-label="More PDF options" aria-expanded={documentMenuOpen}><Icon name="more" size={16} /></button>
          {documentMenuOpen && <div className={styles.documentMenu}>
            <button type="button" onClick={() => { setRotation((value) => (value + 90) % 360); setDocumentMenuOpen(false); }}><Icon name="sync" size={15} /><span><strong>Rotate clockwise</strong><small>Current: {rotation}°</small></span></button>
            <a href={url} target="_blank" rel="noreferrer"><Icon name="expand" size={15} /><span><strong>Open original</strong><small>New browser tab</small></span></a>
            <a href={url} download={name}><Icon name="share" size={15} /><span><strong>Download PDF</strong><small>{name}</small></span></a>
            <small className={styles.shortcutHint}>←/→ pages · +/− zoom · Ctrl/⌘ F search</small>
          </div>}
        </div>
      </div>
      {searchOpen && <section className={styles.searchPanel} aria-label="Search PDF">
        <label><Icon name="search" size={15} /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this PDF…" /><span>{indexing ? 'Indexing…' : query ? `${results.length} page${results.length === 1 ? '' : 's'}` : ''}</span><button type="button" onClick={() => { setSearchOpen(false); setQuery(''); }} aria-label="Close search"><Icon name="close" size={15} /></button></label>
        {query && !indexing && <div className={styles.searchResults}>{results.length ? results.map((result) => <button type="button" key={result.page} onClick={() => goTo(result.page)}><strong>Page {result.page}</strong><span>{result.excerpt}</span></button>) : <small>No matches in this PDF.</small>}</div>}
      </section>}
    </>}
    <div ref={viewportRef} className={styles.viewport} onPointerDown={swipeStart} onPointerUp={swipeEnd}>
      {loading && <div className={styles.status}><span className={styles.spinner} /><strong>Opening PDF…</strong><small>{name}</small></div>}
      {error && <div className={styles.status}><Icon name="book" size={24} /><strong>Unable to open PDF</strong><small>{error}</small><a href={url} target="_blank" rel="noreferrer">Open in browser</a></div>}
      {!error && document && Array.from({ length: pages }, (_, index) => <PdfPage key={index + 1} document={document} pageNumber={index + 1} width={width} zoom={zoom} rotation={rotation} register={(page, node) => { if (node) pageRefs.current.set(page, node); else pageRefs.current.delete(page); }} />)}
    </div>
  </div>;
}
