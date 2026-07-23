import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { deletePdfAnnotations, loadPdfAnnotations, savePdfAnnotations, type PdfAnnotationPoint, type PdfInkAnnotation } from '../../../services/pdf';
import { cx } from '../../../utils/cx';
import { Icon } from '../../common';
import styles from './PdfCanvasViewer.module.css';

interface PdfCanvasViewerProps { readonly url: string; readonly name: string; readonly className?: string; readonly fileHandle?: FileSystemFileHandle; readonly controlsInHeader?: boolean; readonly cloudAnnotations?: readonly PdfInkAnnotation[]; readonly onCloudAnnotationsChange?: (annotations: readonly PdfInkAnnotation[]) => Promise<void> }
type ViewMode = 'continuous' | 'page';
type InkTool = 'pen' | 'highlighter' | 'line' | 'eraser';
type DrawableTool = Exclude<InkTool, 'eraser'>;
type PenSmoothing = 'off' | 'balanced' | 'smooth';
type EraserMode = 'stroke' | 'precision';
type PdfSaveMode = 'ask' | 'replace' | 'copy';
interface PdfLinkRegion { readonly id: string; readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly url?: string; readonly dest?: string | readonly unknown[]; readonly action?: string }

const INK_PREFERENCES_KEY = 'revision-engine:pdf-ink-preferences';
const SAVE_MODE_KEY = 'revision-engine:pdf-save-mode';
const AUTOSAVE_DELAY_KEY = 'revision-engine:pdf-autosave-delay';
const TOOLBAR_PINNED_KEY = 'revision-engine:pdf-toolbar-pinned';
const ANNOTATION_FORMAT_KEY = 'revision-engine:pdf-annotation-format';
const EDIT_SAVED_ANNOTATIONS_KEY = 'revision-engine:pdf-edit-saved-annotations';
const COLLAPSED_TOOLBAR_POSITION_KEY = 'revision-engine:pdf-collapsed-toolbar-position';

type ToolSizes = Record<InkTool, number>;
type ToolColors = Record<DrawableTool, string>;
interface ToolPreset { readonly id: string; readonly tool: InkTool; readonly color: string; readonly size: number; readonly label: string; readonly advanced?: Partial<AdvancedToolPreferences> }
interface AdvancedToolPreferences {
  readonly penPressure: boolean;
  readonly penSmoothing: PenSmoothing;
  readonly highlighterOpacity: number;
  readonly highlighterStraight: boolean;
  readonly highlighterOverlap: boolean;
  readonly eraserMode: EraserMode;
}

interface FloatingPosition { readonly x: number; readonly y: number }

function initialCollapsedToolbarPosition(): FloatingPosition {
  try {
    const value = JSON.parse(localStorage.getItem(COLLAPSED_TOOLBAR_POSITION_KEY) ?? '{}') as Partial<FloatingPosition>;
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
      return { x: Math.min(.98, Math.max(.02, value.x!)), y: Math.min(.98, Math.max(.02, value.y!)) };
    }
  } catch { /* use the unobtrusive right-edge default */ }
  return { x: .975, y: .5 };
}

const DEFAULT_ADVANCED: AdvancedToolPreferences = { penPressure: true, penSmoothing: 'balanced', highlighterOpacity: .3, highlighterStraight: false, highlighterOverlap: true, eraserMode: 'stroke' };

function initialInkPreferences(): { tool: InkTool; colors: ToolColors; sizes: ToolSizes; advanced: AdvancedToolPreferences; presets: ToolPreset[] } {
  try {
    const value = JSON.parse(localStorage.getItem(INK_PREFERENCES_KEY) ?? '{}') as { tool?: InkTool; color?: string; colors?: Partial<ToolColors>; size?: number; sizes?: Partial<ToolSizes>; advanced?: Partial<AdvancedToolPreferences>; presets?: ToolPreset[] };
    const legacySize = Math.min(6, Math.max(1, Number(value.size) || 2));
    const size = (tool: InkTool, fallback: number) => Math.min(tool === 'eraser' ? 12 : 6, Math.max(1, Number(value.sizes?.[tool]) || (value.size ? legacySize : fallback)));
    const validColor = (candidate: string | undefined, fallback: string) => /^#[0-9a-f]{6}$/i.test(candidate ?? '') ? candidate! : fallback;
    const legacyColor = validColor(value.color, '#7c83ff');
    const advanced: AdvancedToolPreferences = {
      penPressure: value.advanced?.penPressure ?? true,
      penSmoothing: ['off', 'balanced', 'smooth'].includes(value.advanced?.penSmoothing ?? '') ? value.advanced!.penSmoothing! : 'balanced',
      highlighterOpacity: Math.min(.45, Math.max(.1, Number(value.advanced?.highlighterOpacity) || .22)),
      highlighterStraight: value.advanced?.highlighterStraight ?? false,
      highlighterOverlap: value.advanced?.highlighterOverlap ?? true,
      eraserMode: value.advanced?.eraserMode === 'precision' ? 'precision' : 'stroke',
    };
    return {
      tool: ['pen', 'highlighter', 'eraser'].includes(value.tool ?? '') ? value.tool! : 'pen',
      colors: { pen: validColor(value.colors?.pen, legacyColor), highlighter: validColor(value.colors?.highlighter, '#ffe066'), line: validColor(value.colors?.line, legacyColor) },
      sizes: { pen: size('pen', 2), highlighter: size('highlighter', 4), line: size('line', 2), eraser: size('eraser', 4) },
      advanced,
      presets: Array.isArray(value.presets) ? value.presets.filter((preset) => preset.tool !== 'line').slice(0, 8) : [],
    };
  } catch { return { tool: 'pen', colors: { pen: '#7c83ff', highlighter: '#ffe066', line: '#7c83ff' }, sizes: { pen: 2, highlighter: 4, line: 2, eraser: 4 }, advanced: DEFAULT_ADVANCED, presets: [] }; }
}

function annotationDigest(annotations: readonly PdfInkAnnotation[]) {
  const rows = annotations.map((annotation) => `${annotation.id}:${annotation.page}:${annotation.tool}:${annotation.color}:${Math.round(annotation.size * 100)}:${Math.round((annotation.opacity ?? 1) * 1000)}:${annotation.straight ? 1 : 0}:${annotation.pressureEnabled === false ? 0 : 1}:${annotation.overlapProtected ? 1 : 0}:${annotation.points.map((point) => `${Math.round(point.x * 10000)},${Math.round(point.y * 10000)},${Math.round(point.pressure * 1000)}`).join(';')}`).sort();
  let hash = 2166136261;
  for (const character of rows.join('|')) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function screenPoint(point: PdfAnnotationPoint, rotation: number) {
  if (rotation === 90) return { x: point.y, y: point.x };
  if (rotation === 180) return { x: 1 - point.x, y: point.y };
  if (rotation === 270) return { x: 1 - point.y, y: 1 - point.x };
  return { x: point.x, y: 1 - point.y };
}

function pdfPoint(x: number, y: number, rotation: number): PdfAnnotationPoint {
  if (rotation === 90) return { x: y, y: x, pressure: .5 };
  if (rotation === 180) return { x: 1 - x, y, pressure: .5 };
  if (rotation === 270) return { x: 1 - y, y: 1 - x, pressure: .5 };
  return { x, y: 1 - y, pressure: .5 };
}

function AnnotationLayer({ pageNumber, rotation, annotations, editing, tool, color, size, advanced, onPrepare, onBegin, onExtend, onEnd, onCancel, onPan, onPinch, onTwoFingerTap, onErase }: {
  pageNumber: number; rotation: number; annotations: readonly PdfInkAnnotation[]; editing: boolean; tool: InkTool; color: string; size: number; advanced: AdvancedToolPreferences;
  onPrepare: () => void; onBegin: (annotation: PdfInkAnnotation) => void; onExtend: (id: string, points: readonly PdfAnnotationPoint[]) => void; onEnd: () => void; onCancel: () => void; onPan: (dx: number, dy: number) => void; onPinch: (factor: number, clientX?: number, clientY?: number) => void; onTwoFingerTap: () => void; onErase: (page: number, point: PdfAnnotationPoint, mode: EraserMode) => void;
}) {
  const activeId = useRef<string | null>(null);
  const activePointsRef = useRef<PdfAnnotationPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const eraserCursorRef = useRef<SVGEllipseElement>(null);
  const lastPointRef = useRef<PdfAnnotationPoint | null>(null);
  const pointerModeRef = useRef<'draw' | 'erase' | 'pan' | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const twoFingerGestureRef = useRef<{ startedAt: number; originX: number; originY: number; initialSpan: number; lastSpan: number; moved: boolean } | null>(null);
  const pointsFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    const raw = events.map((item) => {
      const point = pdfPoint(Math.min(1, Math.max(0, (item.clientX - bounds.left) / bounds.width)), Math.min(1, Math.max(0, (item.clientY - bounds.top) / bounds.height)), rotation);
      return { ...point, pressure: tool === 'pen' && advanced.penPressure ? item.pressure || .5 : .5 };
    });
    if (tool !== 'pen' || advanced.penSmoothing === 'off') return raw;
    // Strong low-pass filtering trails visibly behind a stylus. These values
    // remove digitizer jitter without adding the former rubber-band latency.
    const factor = advanced.penSmoothing === 'smooth' ? .58 : .78;
    return raw.map((point) => {
      const previous = lastPointRef.current;
      const smoothed = previous ? { x: previous.x + (point.x - previous.x) * factor, y: previous.y + (point.y - previous.y) * factor, pressure: previous.pressure + (point.pressure - previous.pressure) * factor } : point;
      lastPointRef.current = smoothed; return smoothed;
    });
  };
  const barrelEraser = (event: ReactPointerEvent<SVGSVGElement>) => event.pointerType === 'pen' && (event.button === 2 || (event.buttons & 2) !== 0);
  const drawSegment = useCallback((from: PdfAnnotationPoint, to: PdfAnnotationPoint, annotationTool = tool, annotationColor = color, annotationSize = size, opacity = annotationTool === 'highlighter' ? advanced.highlighterOpacity : .95, pressureEnabled = advanced.penPressure, target = canvasRef.current) => {
    const canvas = target; const context = canvas?.getContext('2d'); if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2); const pixelWidth = Math.max(1, Math.round(bounds.width * ratio)); const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    const fromScreen = screenPoint(from, rotation); const toScreen = screenPoint(to, rotation);
    const start = { x: fromScreen.x * bounds.width, y: fromScreen.y * bounds.height }; const finish = { x: toScreen.x * bounds.width, y: toScreen.y * bounds.height };
    context.save(); context.scale(canvas.width / Math.max(1, bounds.width), canvas.height / Math.max(1, bounds.height));
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(finish.x, finish.y); context.strokeStyle = annotationColor; context.globalAlpha = opacity; if (annotationTool === 'highlighter') context.globalCompositeOperation = 'multiply';
    const pressure = pressureEnabled && annotationTool === 'pen' ? (from.pressure + to.pressure) / 2 : .5;
    context.lineWidth = annotationSize * (annotationTool === 'highlighter' ? 5 : 1.5 + pressure * 1.4); context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke(); context.restore();
  }, [advanced.highlighterOpacity, advanced.penPressure, color, rotation, size, tool]);
  const drawPenCurve = useCallback((canvas: HTMLCanvasElement, points: readonly PdfAnnotationPoint[], annotationColor: string, annotationSize: number, opacity: number, pressureEnabled: boolean, incremental = false) => {
    if (points.length < 2) return;
    const bounds = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2); const pixelWidth = Math.max(1, Math.round(bounds.width * ratio)); const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    const context = canvas.getContext('2d'); if (!context) return;
    const totalPoints = points.length; const visiblePoints = incremental ? points.slice(-3) : points;
    const screen = visiblePoints.map((point) => { const transformed = screenPoint(point, rotation); return { x: transformed.x * bounds.width, y: transformed.y * bounds.height, pressure: point.pressure }; });
    const stroke = (start: { x: number; y: number }, control: { x: number; y: number; pressure: number }, end: { x: number; y: number }) => {
      context.beginPath(); context.moveTo(start.x, start.y); context.quadraticCurveTo(control.x, control.y, end.x, end.y); context.strokeStyle = annotationColor; context.globalAlpha = opacity;
      context.lineWidth = annotationSize * (1.5 + (pressureEnabled ? control.pressure : .5) * 1.4); context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke();
    };
    context.save(); context.scale(canvas.width / Math.max(1, bounds.width), canvas.height / Math.max(1, bounds.height));
    if (screen.length === 2) {
      if (!incremental) { const first = screen[0]!; const last = screen[1]!; stroke(first, first, last); }
    } else if (incremental) {
      const first = screen.at(-3)!; const control = screen.at(-2)!; const last = screen.at(-1)!;
      stroke(totalPoints === 3 ? first : { x: (first.x + control.x) / 2, y: (first.y + control.y) / 2 }, control, { x: (control.x + last.x) / 2, y: (control.y + last.y) / 2 });
    } else {
      for (let index = 1; index < screen.length - 1; index += 1) {
        const previous = screen[index - 1]!; const control = screen[index]!; const next = screen[index + 1]!;
        stroke(index === 1 ? previous : { x: (previous.x + control.x) / 2, y: (previous.y + control.y) / 2 }, control, { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 });
      }
      const beforeLast = screen.at(-2)!; const last = screen.at(-1)!; stroke({ x: (beforeLast.x + last.x) / 2, y: (beforeLast.y + last.y) / 2 }, last, last);
    }
    context.restore();
  }, [rotation]);
  const sizeCanvas = useCallback((canvas: HTMLCanvasElement) => { const bounds = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2); const width = Math.max(1, Math.round(bounds.width * ratio)); const height = Math.max(1, Math.round(bounds.height * ratio)); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; } return bounds; }, []);
  const clearLiveCanvas = () => { const canvas = liveCanvasRef.current; const context = canvas?.getContext('2d'); if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height); };
  const drawHighlighterPath = useCallback((canvas: HTMLCanvasElement, points: readonly PdfAnnotationPoint[], annotationColor: string, annotationSize: number, opacity: number) => {
    if (points.length < 2) return; const bounds = sizeCanvas(canvas); const context = canvas.getContext('2d'); if (!context) return;
    context.save(); context.scale(canvas.width / Math.max(1, bounds.width), canvas.height / Math.max(1, bounds.height)); context.beginPath();
    const screenPoints = points.map((point) => { const screen = screenPoint(point, rotation); return { x: screen.x * bounds.width, y: screen.y * bounds.height }; });
    context.moveTo(screenPoints[0]!.x, screenPoints[0]!.y);
    for (let index = 1; index < screenPoints.length - 1; index += 1) { const point = screenPoints[index]!; const next = screenPoints[index + 1]!; context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2); }
    const last = screenPoints.at(-1)!; context.lineTo(last.x, last.y);
    context.strokeStyle = annotationColor; context.globalAlpha = opacity; context.globalCompositeOperation = 'multiply'; context.lineWidth = annotationSize * 5; context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke(); context.restore();
  }, [rotation, sizeCanvas]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const paint = () => {
      sizeCanvas(canvas);
      const context = canvas.getContext('2d'); context?.clearRect(0, 0, canvas.width, canvas.height);
      for (const annotation of annotations) {
        const points = annotation.tool === 'line' || (annotation.tool === 'highlighter' && annotation.straight)
          ? annotation.points.length > 1 ? [annotation.points[0]!, annotation.points.at(-1)!] : annotation.points
          : annotation.points;
        if (annotation.tool === 'highlighter') drawHighlighterPath(canvas, points, annotation.color, annotation.size, annotation.opacity ?? .22);
        else if (annotation.tool === 'pen') drawPenCurve(canvas, points, annotation.color, annotation.size, .95, annotation.pressureEnabled !== false);
        else for (let index = 1; index < points.length; index += 1) drawSegment(points[index - 1]!, points[index]!, annotation.tool, annotation.color, annotation.size, .95, annotation.pressureEnabled !== false);
      }
    };
    paint(); const observer = new ResizeObserver(paint); observer.observe(canvas); return () => observer.disconnect();
  }, [annotations, drawHighlighterPath, drawPenCurve, drawSegment, rotation, sizeCanvas]);
  const updateEraserCursor = (point: PdfAnnotationPoint | undefined, visible: boolean, host?: SVGSVGElement) => {
    const cursor = eraserCursorRef.current; if (!cursor) return;
    if (!point || !visible) { cursor.style.opacity = '0'; return; }
    const screen = screenPoint(point, rotation); const bounds = host?.getBoundingClientRect(); const radius = Math.max(12, size * 10);
    cursor.setAttribute('cx', String(screen.x * 1000)); cursor.setAttribute('cy', String(screen.y * 1000)); cursor.setAttribute('rx', String(radius)); cursor.setAttribute('ry', String(radius * ((bounds?.width ?? 1) / Math.max(1, bounds?.height ?? 1)))); cursor.style.opacity = '1';
  };
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!editing) return;
    if (event.pointerType === 'touch') {
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointsRef.current.size >= 2) {
        const touches = [...touchPointsRef.current.values()]; const span = Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y);
        twoFingerGestureRef.current = { startedAt: performance.now(), originX: (touches[0]!.x + touches[1]!.x) / 2, originY: (touches[0]!.y + touches[1]!.y) / 2, initialSpan: span, lastSpan: span, moved: false };
        if (activeId.current) onCancel();
        clearLiveCanvas();
        activeId.current = null; activePointsRef.current = []; pointerModeRef.current = 'pan'; lastPointRef.current = null;
        return;
      }
    }
    const temporaryEraser = barrelEraser(event);
    if (event.button > 0 && !temporaryEraser) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointsFromEvent(event)[0];
    if (!point) return;
    if (tool === 'eraser' || temporaryEraser) { onPrepare(); updateEraserCursor(point, true, event.currentTarget); pointerModeRef.current = 'erase'; onErase(pageNumber, point, advanced.eraserMode); return; }
    const id = crypto.randomUUID?.() ?? `ink-${Date.now()}`;
    activeId.current = id; pointerModeRef.current = 'draw'; lastPointRef.current = point;
    activePointsRef.current = [point];
    onBegin({ id, page: pageNumber, tool, color, size, opacity: tool === 'highlighter' ? advanced.highlighterOpacity : undefined, straight: tool === 'highlighter' ? advanced.highlighterStraight : undefined, pressureEnabled: tool === 'pen' ? advanced.penPressure : undefined, overlapProtected: tool === 'highlighter' ? advanced.highlighterOverlap : undefined, points: [point] });
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!editing) return;
    if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
      const before = [...touchPointsRef.current.values()];
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointerModeRef.current === 'pan' || touchPointsRef.current.size >= 2) {
        event.preventDefault();
        const after = [...touchPointsRef.current.values()];
        const center = (items: { x: number; y: number }[]) => ({ x: items.reduce((sum, item) => sum + item.x, 0) / items.length, y: items.reduce((sum, item) => sum + item.y, 0) / items.length });
        const previous = center(before); const current = center(after); const dx = current.x - previous.x; const dy = current.y - previous.y;
        let spanDelta = 0;
        if (twoFingerGestureRef.current && after.length >= 2) {
          const span = Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y);
          spanDelta = Math.abs(span - twoFingerGestureRef.current.lastSpan);
          if (twoFingerGestureRef.current.lastSpan > 0) onPinch(span / twoFingerGestureRef.current.lastSpan, current.x, current.y);
          const midpointX = (after[0]!.x + after[1]!.x) / 2; const midpointY = (after[0]!.y + after[1]!.y) / 2;
          if (Math.hypot(midpointX - twoFingerGestureRef.current.originX, midpointY - twoFingerGestureRef.current.originY) > 18 || Math.abs(span - twoFingerGestureRef.current.initialSpan) > 18) twoFingerGestureRef.current.moved = true;
          twoFingerGestureRef.current.lastSpan = span;
        }
        if (spanDelta < 1) onPan(dx, dy); return;
      }
    }
    const points = pointsFromEvent(event);
    const erasing = pointerModeRef.current === 'erase' || tool === 'eraser' || barrelEraser(event);
    updateEraserCursor(points.at(-1), erasing, event.currentTarget);
    if (erasing) { if (event.buttons || event.pressure) onErase(pageNumber, points.at(-1)!, advanced.eraserMode); return; }
    if (activeId.current) {
      const liveCanvas = liveCanvasRef.current;
      for (const point of points) {
        activePointsRef.current.push(point);
        if (liveCanvas && tool === 'pen') drawPenCurve(liveCanvas, activePointsRef.current, color, size, .95, advanced.penPressure, true);
      }
      if (liveCanvas && tool === 'highlighter') { clearLiveCanvas(); const visible = advanced.highlighterStraight && activePointsRef.current.length > 1 ? [activePointsRef.current[0]!, activePointsRef.current.at(-1)!] : activePointsRef.current; drawHighlighterPath(liveCanvas, visible, color, size, advanced.highlighterOpacity); }
    }
  };
  const end = (event?: ReactPointerEvent<SVGSVGElement>) => {
    if (event?.pointerType === 'touch') touchPointsRef.current.delete(event.pointerId);
    if (pointerModeRef.current === 'pan') {
      if (touchPointsRef.current.size === 0) {
        const gesture = twoFingerGestureRef.current; twoFingerGestureRef.current = null; pointerModeRef.current = null;
        if (gesture && !gesture.moved && performance.now() - gesture.startedAt < 550) onTwoFingerTap();
      }
      return;
    }
    if (activeId.current) { onExtend(activeId.current, activePointsRef.current.slice(1)); onEnd(); requestAnimationFrame(clearLiveCanvas); }
    else if (pointerModeRef.current === 'erase') onEnd();
    activeId.current = null; activePointsRef.current = []; pointerModeRef.current = null; lastPointRef.current = null;
  };
  return <><canvas ref={canvasRef} className={styles.annotationCanvas} aria-hidden="true" /><canvas ref={liveCanvasRef} className={cx(styles.annotationCanvas, styles.annotationLiveCanvas)} aria-hidden="true" /><svg className={cx(styles.annotationLayer, editing && styles.annotationEditing, editing && tool === 'eraser' && styles.eraserActive)} viewBox="0 0 1000 1000" preserveAspectRatio="none" onContextMenu={(event) => editing && event.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={(event) => { updateEraserCursor(undefined, false); if (event.buttons === 0) end(); }}>
    <ellipse ref={eraserCursorRef} className={cx(styles.eraserPreview, advanced.eraserMode === 'precision' && styles.precisionEraserPreview)} />
  </svg></>;
}

function PdfPage({ document, pageNumber, width, zoom, rotation, register, annotations, hideNativeAnnotations, editing, tool, color, inkSize, advanced, onPrepare, onBegin, onExtend, onEnd, onCancel, onPan, onPinch, onTwoFingerTap, onErase, onNavigate }: {
  document: PDFDocumentProxy; pageNumber: number; width: number; zoom: number; rotation: number; register: (page: number, node: HTMLElement | null) => void;
  annotations: readonly PdfInkAnnotation[]; hideNativeAnnotations: boolean; editing: boolean; tool: InkTool; color: string; inkSize: number; advanced: AdvancedToolPreferences;
  onPrepare: () => void; onBegin: (annotation: PdfInkAnnotation) => void; onExtend: (id: string, points: readonly PdfAnnotationPoint[]) => void; onEnd: () => void; onCancel: () => void; onPan: (dx: number, dy: number) => void; onPinch: (factor: number, clientX?: number, clientY?: number) => void; onTwoFingerTap: () => void; onErase: (page: number, point: PdfAnnotationPoint, mode: EraserMode) => void;
  onNavigate: (destination: string | readonly unknown[] | undefined, action?: string) => void;
}) {
  const hostRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [near, setNear] = useState(false);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [ratio, setRatio] = useState(1 / 1.414);
  const [error, setError] = useState(false);
  const [links, setLinks] = useState<PdfLinkRegion[]>([]);
  const displayWidth = Math.max(240, width - 24) * zoom;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), { rootMargin: '1200px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || page) return;
    let cancelled = false;
    void document.getPage(pageNumber).then((loaded) => {
      if (cancelled) return;
      const natural = loaded.getViewport({ scale: 1, rotation });
      setRatio(natural.width / natural.height); setPage(loaded);
    });
    return () => { cancelled = true; };
  }, [document, near, page, pageNumber, rotation]);

  useEffect(() => {
    if (!page) return;
    const natural = page.getViewport({ scale: 1, rotation });
    setRatio(natural.width / natural.height);
    let cancelled = false;
    void page.getAnnotations({ intent: 'display' }).then((items) => {
      if (cancelled) return;
      const regions = items.flatMap((item: Record<string, unknown>, index): PdfLinkRegion[] => {
        const rect = item.rect;
        const hasDestination = typeof item.url === 'string' || typeof item.dest === 'string' || Array.isArray(item.dest) || typeof item.action === 'string';
        if (!hasDestination || !Array.isArray(rect) || rect.length !== 4) return [];
        const first = natural.convertToViewportPoint(Number(rect[0]), Number(rect[1]));
        const second = natural.convertToViewportPoint(Number(rect[2]), Number(rect[3]));
        const box = [first[0], first[1], second[0], second[1]];
        const left = Math.min(box[0]!, box[2]!) / natural.width; const top = Math.min(box[1]!, box[3]!) / natural.height;
        return [{ id: String(item.id ?? `${pageNumber}-${index}`), left, top, width: Math.abs(box[2]! - box[0]!) / natural.width, height: Math.abs(box[3]! - box[1]!) / natural.height, url: typeof item.url === 'string' ? item.url : undefined, dest: typeof item.dest === 'string' || Array.isArray(item.dest) ? item.dest : undefined, action: typeof item.action === 'string' ? item.action : undefined }];
      });
      setLinks(regions);
    }).catch(() => setLinks([]));
    return () => { cancelled = true; };
  }, [page, pageNumber, rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !page || !canvas || width <= 0) return;
    let disposed = false; taskRef.current?.cancel(); setError(false);
    const natural = page.getViewport({ scale: 1, rotation });
    const scale = displayWidth / natural.width;
    const viewport = page.getViewport({ scale, rotation });
    const outputScale = Math.min(window.devicePixelRatio || 1, 1.75);
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`;
    const task = page.render({ canvas, canvasContext: context, viewport, annotationMode: hideNativeAnnotations ? 0 : 1, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
    taskRef.current = task;
    void task.promise.catch((reason: unknown) => { if (!disposed && reason instanceof Error && reason.name !== 'RenderingCancelledException') setError(true); });
    return () => { disposed = true; task.cancel(); canvas.width = 1; canvas.height = 1; };
  }, [displayWidth, hideNativeAnnotations, near, page, rotation, width]);

  useEffect(() => {
    const container = textLayerRef.current;
    if (!near || !page || !container || width <= 0) return;
    let disposed = false;
    let layer: { render: () => Promise<unknown>; cancel: () => void } | null = null;
    container.replaceChildren();
    const natural = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({ scale: displayWidth / natural.width, rotation });
    void import('pdfjs-dist').then((pdfjs) => {
      if (disposed) return;
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true }), container, viewport });
      return layer.render();
    }).catch(() => { if (!disposed) container.replaceChildren(); });
    return () => { disposed = true; layer?.cancel(); container.replaceChildren(); };
  }, [displayWidth, near, page, rotation, width]);

  const pageScale = page ? displayWidth / page.getViewport({ scale: 1, rotation }).width : 1;
  const style = { width: displayWidth, aspectRatio: ratio, '--total-scale-factor': pageScale } as CSSProperties;
  return <section ref={(node) => { hostRef.current = node; register(pageNumber, node); }} style={style} className={styles.page} data-pdf-page={pageNumber} aria-label={`Page ${pageNumber}`}>
    <small>{pageNumber}</small>
    {error ? <span className={styles.pageError}>Page could not be rendered.</span> : near && <canvas ref={canvasRef} />}
    {near && <div ref={textLayerRef} className={cx(styles.textLayer, editing && styles.textLayerDisabled)} />}
    {links.length > 0 && <div className={cx(styles.pdfLinks, editing && styles.pdfLinksDisabled)} aria-label={`Links on page ${pageNumber}`}>
      {links.map((link) => link.url
        ? <a key={link.id} href={link.url} target="_blank" rel="noreferrer" aria-label="Open PDF link" style={{ left: `${link.left * 100}%`, top: `${link.top * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` }} />
        : <button key={link.id} type="button" aria-label="Follow PDF link" style={{ left: `${link.left * 100}%`, top: `${link.top * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` }} onClick={() => onNavigate(link.dest, link.action)} />)}
    </div>}
    {(editing || annotations.length > 0) && <AnnotationLayer pageNumber={pageNumber} rotation={rotation} annotations={annotations} editing={editing} tool={tool} color={color} size={inkSize} advanced={advanced} onPrepare={onPrepare} onBegin={onBegin} onExtend={onExtend} onEnd={onEnd} onCancel={onCancel} onPan={onPan} onPinch={onPinch} onTwoFingerTap={onTwoFingerTap} onErase={onErase} />}
  </section>;
}

/** Virtualized PDF.js reader with stylus annotations and single-page navigation. */
export function PdfCanvasViewer({ url, name, className, fileHandle, controlsInHeader = false, cloudAnnotations, onCloudAnnotationsChange }: PdfCanvasViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentMenuRef = useRef<HTMLDivElement>(null);
  const inkToolbarRef = useRef<HTMLDivElement>(null);
  const toolSettingsRef = useRef<HTMLElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const readerTouchesRef = useRef(new Map<number, { x: number; y: number }>());
  const readerPinchRef = useRef<{ span: number } | null>(null);
  const undoTouchesRef = useRef(new Map<number, { x: number; y: number }>());
  const undoGestureRef = useRef<{ startedAt: number; starts: Map<number, { x: number; y: number }>; moved: boolean } | null>(null);
  const lastGestureUndoRef = useRef(0);
  const pinchFactorRef = useRef(1); const pinchFrameRef = useRef<number | null>(null);
  const pinchAnchorRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const historyRef = useRef<PdfInkAnnotation[][]>([]); const futureRef = useRef<PdfInkAnnotation[][]>([]);
  const drawingSnapshotRef = useRef<PdfInkAnnotation[] | null>(null);
  const dirtyBeforeStrokeRef = useRef(false);
  const pendingInkRef = useRef<{ id: string; points: PdfAnnotationPoint[] } | null>(null);
  const inkFrameRef = useRef<number | null>(null);
  const collapsedToolbarDragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: FloatingPosition; moved: boolean } | null>(null);
  const suppressCollapsedClickRef = useRef(false);
  const currentPageRef = useRef(1);
  const ownedSourceUrlRef = useRef<string | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1); const [zoom, setZoom] = useState(1); const [rotation, setRotation] = useState(0); const [width, setWidth] = useState(0);
  currentPageRef.current = pageNumber;
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(''); const [pageText, setPageText] = useState<string[]>([]); const [indexing, setIndexing] = useState(false);
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false); const [rememberSaveMode, setRememberSaveMode] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [collapsedToolbarPosition, setCollapsedToolbarPosition] = useState(initialCollapsedToolbarPosition);
  const collapsedToolbarPositionRef = useRef(collapsedToolbarPosition);
  const [toolbarPinned, setToolbarPinned] = useState(() => localStorage.getItem(TOOLBAR_PINNED_KEY) === 'true');
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [annotationFormat, setAnnotationFormat] = useState<'editable' | 'flattened'>(() => localStorage.getItem(ANNOTATION_FORMAT_KEY) === 'flattened' ? 'flattened' : 'editable');
  const [editSavedAnnotations, setEditSavedAnnotations] = useState(() => localStorage.getItem(EDIT_SAVED_ANNOTATIONS_KEY) !== 'false');
  const [nativeInkImported, setNativeInkImported] = useState(false);
  const [pdfSaveDirty, setPdfSaveDirty] = useState(false);
  const [saveMode, setSaveMode] = useState<PdfSaveMode>(() => { const value = localStorage.getItem(SAVE_MODE_KEY); return value === 'replace' || value === 'copy' ? value : 'ask'; });
  const [autosaveDelay, setAutosaveDelay] = useState(() => { const value = Number(localStorage.getItem(AUTOSAVE_DELAY_KEY)); return [500, 1000, 2000, 5000].includes(value) ? value : 1000; });
  const inkPreferences = useMemo(initialInkPreferences, []);
  const [editing, setEditing] = useState(false); const [tool, setTool] = useState<InkTool>(inkPreferences.tool); const [toolColors, setToolColors] = useState<ToolColors>(inkPreferences.colors); const [toolSizes, setToolSizes] = useState<ToolSizes>(inkPreferences.sizes); const [advanced, setAdvanced] = useState<AdvancedToolPreferences>(inkPreferences.advanced); const [toolPresets, setToolPresets] = useState<ToolPreset[]>(inkPreferences.presets); const inkSize = toolSizes[tool]; const color = tool === 'eraser' ? toolColors.pen : toolColors[tool];
  const [annotations, setAnnotations] = useState<PdfInkAnnotation[]>([]); const [annotationsReady, setAnnotationsReady] = useState(false); const [exporting, setExporting] = useState(false); const [saving, setSaving] = useState(false); const [saveNotice, setSaveNotice] = useState(''); const [autosaveState, setAutosaveState] = useState<'saved' | 'saving'>('saved');
  const cloudSeededRef = useRef('');
  const lastCloudDigestRef = useRef('');
  const fingerprint = document?.fingerprints[0] ?? '';
  const [sourceUrl, setSourceUrl] = useState(url);
  const positionKey = useMemo(() => { let hash = 2166136261; for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return `revision-engine:pdf-position:${(hash >>> 0).toString(36)}`; }, [name]);
  const savedDigestKey = fingerprint
    ? `revision-engine:pdf-saved-annotation-digest:${fingerprint}`
    : `${positionKey}:saved-annotation-digest`;

  useEffect(() => { const host = viewportRef.current; if (!host) return; const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0)); observer.observe(host); return () => observer.disconnect(); }, []);
  const refreshLocalSource = async (handle: FileSystemFileHandle) => {
    const freshUrl = URL.createObjectURL(await handle.getFile());
    if (ownedSourceUrlRef.current) URL.revokeObjectURL(ownedSourceUrlRef.current);
    ownedSourceUrlRef.current = freshUrl; setSourceUrl(freshUrl);
  };
  useEffect(() => {
    let cancelled = false;
    if (!fileHandle) { setSourceUrl(url); return; }
    void fileHandle.getFile().then((file) => {
      if (cancelled) return;
      const freshUrl = URL.createObjectURL(file);
      if (ownedSourceUrlRef.current) URL.revokeObjectURL(ownedSourceUrlRef.current);
      ownedSourceUrlRef.current = freshUrl; setSourceUrl(freshUrl);
    }).catch(() => { if (!cancelled) setSourceUrl(url); });
    return () => { cancelled = true; };
  }, [fileHandle, url]);
  useEffect(() => () => { if (ownedSourceUrlRef.current) URL.revokeObjectURL(ownedSourceUrlRef.current); }, []);
  useEffect(() => {
    let cancelled = false; let task: PDFDocumentLoadingTask | null = null; let saved: { page?: number; zoom?: number; rotation?: number; viewMode?: ViewMode } = {};
    try { saved = JSON.parse(localStorage.getItem(positionKey) ?? '{}') as typeof saved; } catch { /* use defaults */ }
    setLoading(true); setError(''); setDocument(null); setPageNumber(Math.max(1, Number(saved.page) || 1)); setZoom(Number(saved.zoom) || 1); setRotation(Number(saved.rotation) || 0); setViewMode(saved.viewMode === 'page' ? 'page' : 'continuous'); setPageText([]); setAnnotations([]); setAnnotationsReady(false); setNativeInkImported(false); setPdfSaveDirty(false);
    void import('pdfjs-dist').then((pdfjs) => { if (cancelled) return undefined; pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker; task = pdfjs.getDocument({ url: sourceUrl }); return task.promise; })
      .then((loaded) => { if (loaded && !cancelled) { setDocument(loaded); setPageNumber((value) => Math.min(loaded.numPages, value)); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError('This PDF could not be displayed inside the app.'); setLoading(false); } });
    return () => { cancelled = true; void task?.destroy(); };
  }, [positionKey, sourceUrl]);
  useEffect(() => {
    if (!fingerprint || !document) return; let cancelled = false;
    void loadPdfAnnotations(fingerprint).then((items) => {
      if (cancelled) return;
      const localItems = editSavedAnnotations ? items : items.filter((item) => !item.id.startsWith('pdf-'));
      setAnnotations(localItems); setAnnotationsReady(true); setPdfSaveDirty(localItems.length > 0 && annotationDigest(localItems) !== localStorage.getItem(savedDigestKey)); historyRef.current = []; futureRef.current = [];
      if (!editSavedAnnotations) return;
      void (async () => {
        const imported: PdfInkAnnotation[] = [];
        const preferredPage = Math.min(document.numPages - 1, Math.max(0, currentPageRef.current - 1));
        const pageOrder = [preferredPage, ...Array.from({ length: document.numPages }, (_, index) => index).filter((index) => index !== preferredPage)];
        for (const pageIndex of pageOrder) {
          if (cancelled) return;
          const page = await document.getPage(pageIndex + 1); const view = page.view; const pageWidth = view[2] - view[0]; const pageHeight = view[3] - view[1];
          const native = await page.getAnnotations({ intent: 'any' }) as Array<Record<string, unknown>>;
          for (const item of native) {
            const title = item.titleObj && typeof item.titleObj === 'object' && 'str' in item.titleObj ? String((item.titleObj as { str?: unknown }).str ?? '') : '';
            if (title !== 'Revision Engine' || !Array.isArray(item.inkLists)) continue;
            const contents = item.contentsObj && typeof item.contentsObj === 'object' && 'str' in item.contentsObj ? String((item.contentsObj as { str?: unknown }).str ?? '') : '';
            const colour = item.color instanceof Uint8ClampedArray || item.color instanceof Uint8Array ? `#${[...item.color].slice(0, 3).map((value) => value.toString(16).padStart(2, '0')).join('')}` : '#7c83ff';
            const border = item.borderStyle && typeof item.borderStyle === 'object' && 'width' in item.borderStyle ? Number((item.borderStyle as { width?: unknown }).width) : 2;
            const opacity = Number(item.opacity) || 1; const tool: DrawableTool = contents === 'Highlight' ? 'highlighter' : contents === 'Line' ? 'line' : 'pen';
            for (const [pathIndex, rawPath] of (item.inkLists as unknown[]).entries()) {
              if (!(rawPath instanceof Float32Array) && !Array.isArray(rawPath)) continue; const values = Array.from(rawPath as ArrayLike<number>); const points: PdfAnnotationPoint[] = [];
              for (let index = 0; index + 1 < values.length; index += 2) points.push({ x: (values[index]! - view[0]) / pageWidth, y: (values[index + 1]! - view[1]) / pageHeight, pressure: .5 });
              if (points.length > 1) imported.push({ id: `pdf-${pageIndex + 1}-${String(item.id ?? 'ink')}-${pathIndex}`, page: pageIndex + 1, tool, color: colour, size: tool === 'highlighter' ? Math.max(1, border / 5) : Math.max(1, border / 1.3), opacity: tool === 'highlighter' ? opacity : undefined, straight: tool === 'line', points });
            }
          }
          await new Promise<void>((resolve) => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 120 });
            else globalThis.setTimeout(resolve, 8);
          });
        }
        if (!cancelled && imported.length) {
          setNativeInkImported(true);
          setAnnotations((current) => {
            const sameStroke = (left: PdfInkAnnotation, right: PdfInkAnnotation) => {
              if (left.page !== right.page || left.tool !== right.tool || !left.points.length || !right.points.length) return false;
              const leftFirst = left.points[0]!; const rightFirst = right.points[0]!; const leftLast = left.points.at(-1)!; const rightLast = right.points.at(-1)!;
              return Math.hypot(leftFirst.x - rightFirst.x, leftFirst.y - rightFirst.y) < .008 && Math.hypot(leftLast.x - rightLast.x, leftLast.y - rightLast.y) < .008;
            };
            const missing = imported.filter((saved) => !current.some((local) => sameStroke(saved, local)));
            const reconciled = current.map((local) => imported.find((saved) => sameStroke(saved, local)) ?? local);
            const next = [...missing, ...reconciled];
            // Marks embedded in the opened PDF are the document baseline, not
            // unsaved work. Keeping its digest means removing even the final
            // imported mark is correctly detected as a saveable change.
            if (current.every((local) => imported.some((saved) => sameStroke(saved, local)))) {
              localStorage.setItem(savedDigestKey, annotationDigest(next));
              setPdfSaveDirty(false);
            }
            return next;
          });
        }
      })().catch(() => undefined);
    }).catch(() => setAnnotationsReady(true));
    return () => { cancelled = true; };
  }, [document, editSavedAnnotations, fingerprint, savedDigestKey]);
  useEffect(() => {
    if (!fingerprint || !annotationsReady) return;
    setAutosaveState('saving');
    const timer = window.setTimeout(() => {
      void savePdfAnnotations(fingerprint, annotations).then(() => setAutosaveState('saved')).catch(() => undefined);
    }, autosaveDelay);
    return () => window.clearTimeout(timer);
  }, [annotations, annotationsReady, autosaveDelay, fingerprint]);

  useEffect(() => {
    if (!annotationsReady || !cloudAnnotations || !fingerprint || cloudSeededRef.current === fingerprint) return;
    cloudSeededRef.current = fingerprint;
    lastCloudDigestRef.current = annotationDigest(cloudAnnotations);
    setAnnotations((current) => {
      const ids = new Set(current.map((item) => item.id));
      return [...current, ...cloudAnnotations.filter((item) => !ids.has(item.id))];
    });
  }, [annotationsReady, cloudAnnotations, fingerprint]);

  useEffect(() => {
    if (!annotationsReady || !onCloudAnnotationsChange || cloudSeededRef.current !== fingerprint) return;
    const digest = annotationDigest(annotations);
    if (digest === lastCloudDigestRef.current) return;
    const timer = window.setTimeout(() => {
      setAutosaveState('saving');
      void onCloudAnnotationsChange(annotations).then(() => { lastCloudDigestRef.current = digest; setAutosaveState('saved'); }).catch((reason) => {
        setAutosaveState('saved'); setSaveNotice(reason instanceof Error ? reason.message : 'Cloud sync failed');
      });
    // Cloud sync is deliberately idle-debounced. Pointer movement may produce
    // hundreds of local annotation snapshots, but only the settled stroke is
    // sent to Supabase. IndexedDB remains the immediate crash-safe store.
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [annotations, annotationsReady, fingerprint, onCloudAnnotationsChange]);
  useEffect(() => {
    if (!annotationsReady) return;
    const savedDigest = localStorage.getItem(savedDigestKey);
    if (savedDigest) setPdfSaveDirty(annotationDigest(annotations) !== savedDigest);
  }, [annotations, annotationsReady, savedDigestKey]);
  useEffect(() => {
    if (!fingerprint || !annotationsReady) return;
    const flush = () => { if (globalThis.document.visibilityState === 'hidden') void savePdfAnnotations(fingerprint, annotations).catch(() => undefined); };
    const pageHide = () => { void savePdfAnnotations(fingerprint, annotations).catch(() => undefined); };
    globalThis.document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', pageHide);
    return () => { globalThis.document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', pageHide); };
  }, [annotations, annotationsReady, fingerprint]);
  useEffect(() => {
    if (!documentMenuOpen) return;
    const close = (event: PointerEvent) => { if (!documentMenuRef.current?.contains(event.target as Node)) setDocumentMenuOpen(false); };
    globalThis.document.addEventListener('pointerdown', close);
    return () => globalThis.document.removeEventListener('pointerdown', close);
  }, [documentMenuOpen]);
  useEffect(() => {
    if (!toolSettingsOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!toolSettingsRef.current?.contains(target) && !inkToolbarRef.current?.contains(target)) setToolSettingsOpen(false);
    };
    globalThis.document.addEventListener('pointerdown', close);
    return () => globalThis.document.removeEventListener('pointerdown', close);
  }, [toolSettingsOpen]);
  useEffect(() => { if (!document) return; localStorage.setItem(positionKey, JSON.stringify({ page: pageNumber, zoom, rotation, viewMode })); }, [document, pageNumber, positionKey, rotation, viewMode, zoom]);
  useEffect(() => { localStorage.setItem(INK_PREFERENCES_KEY, JSON.stringify({ tool, colors: toolColors, sizes: toolSizes, advanced, presets: toolPresets })); }, [advanced, tool, toolColors, toolPresets, toolSizes]);
  useEffect(() => {
    const root = viewportRef.current; if (!document || !root || viewMode !== 'continuous') return;
    const observer = new IntersectionObserver((entries) => { const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; const page = Number((visible?.target as HTMLElement | undefined)?.dataset.pdfPage); if (page) setPageNumber(page); }, { root, threshold: [.2, .5, .8] });
    for (const node of pageRefs.current.values()) observer.observe(node); return () => observer.disconnect();
  }, [document, viewMode, width]);
  useEffect(() => {
    if (!document || !searchOpen || pageText.length === document.numPages) return; let cancelled = false; setIndexing(true);
    void (async () => { const text: string[] = []; for (let index = 0; index < document.numPages; index += 1) { const page = await document.getPage(index + 1); const content = await page.getTextContent(); text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' ')); if (index % 4 === 3) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); if (cancelled) return; } setPageText(text); setIndexing(false); })();
    return () => { cancelled = true; };
  }, [document, pageText.length, searchOpen]);

  const pages = document?.numPages ?? 0;
  const goTo = (page: number, behavior: ScrollBehavior = 'smooth') => { const next = Math.min(pages, Math.max(1, page)); setPageNumber(next); if (viewMode === 'continuous') requestAnimationFrame(() => pageRefs.current.get(next)?.scrollIntoView({ behavior, block: 'start' })); };
  const followLink = async (destination: string | readonly unknown[] | undefined, action?: string) => {
    if (action === 'NextPage') { goTo(pageNumber + 1); return; }
    if (action === 'PrevPage') { goTo(pageNumber - 1); return; }
    if (action === 'FirstPage') { goTo(1); return; }
    if (action === 'LastPage') { goTo(pages); return; }
    if (!document || !destination) return;
    const explicit = typeof destination === 'string' ? await document.getDestination(destination) : destination;
    const reference = explicit?.[0];
    if (typeof reference === 'number') goTo(reference + 1);
    else if (reference && typeof reference === 'object' && 'num' in reference && 'gen' in reference) {
      try { goTo((await document.getPageIndex(reference as { num: number; gen: number })) + 1); } catch { /* malformed PDF destination */ }
    }
  };
  const results = useMemo(() => { const clean = query.trim().toLocaleLowerCase(); if (!clean) return []; return pageText.flatMap((text, index) => { const lower = text.toLocaleLowerCase(); const at = lower.indexOf(clean); if (at < 0) return []; const start = Math.max(0, at - 45); const end = Math.min(text.length, at + clean.length + 70); return [{ page: index + 1, excerpt: `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}` }]; }); }, [pageText, query]);
  const commitSnapshot = (snapshot: PdfInkAnnotation[]) => { historyRef.current.push(snapshot); if (historyRef.current.length > 80) historyRef.current.shift(); futureRef.current = []; };
  const prepareStroke = () => { if (!drawingSnapshotRef.current) { drawingSnapshotRef.current = annotations; dirtyBeforeStrokeRef.current = pdfSaveDirty; } };
  const begin = (annotation: PdfInkAnnotation) => { prepareStroke(); setPdfSaveDirty(true); if (!toolbarPinned) setToolbarCollapsed(true); setAnnotations((items) => [...items, annotation]); };
  const flushInk = () => {
    const pending = pendingInkRef.current; pendingInkRef.current = null; inkFrameRef.current = null;
    if (pending) setAnnotations((items) => items.map((item) => item.id === pending.id ? { ...item, points: [...item.points, ...pending.points] } : item));
  };
  const extend = (id: string, points: readonly PdfAnnotationPoint[]) => {
    const pending = pendingInkRef.current;
    pendingInkRef.current = pending?.id === id ? { id, points: [...pending.points, ...points] } : { id, points: [...points] };
    if (inkFrameRef.current === null) inkFrameRef.current = requestAnimationFrame(flushInk);
  };
  const end = () => { if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current); flushInk(); if (drawingSnapshotRef.current) commitSnapshot(drawingSnapshotRef.current); drawingSnapshotRef.current = null; };
  const cancelStroke = () => {
    if (inkFrameRef.current !== null) cancelAnimationFrame(inkFrameRef.current);
    inkFrameRef.current = null; pendingInkRef.current = null;
    if (drawingSnapshotRef.current) setAnnotations(drawingSnapshotRef.current);
    drawingSnapshotRef.current = null; setPdfSaveDirty(dirtyBeforeStrokeRef.current);
  };
  const panAnnotations = (dx: number, dy: number) => viewportRef.current?.scrollBy({ left: -dx, top: -dy, behavior: 'auto' });
  const zoomPdf = useCallback((factor: number, clientX?: number, clientY?: number) => {
    if (!Number.isFinite(factor) || factor <= 0) return; pinchFactorRef.current *= factor;
    if (clientX !== undefined && clientY !== undefined) pinchAnchorRef.current = { clientX, clientY };
    if (pinchFrameRef.current !== null) return;
    pinchFrameRef.current = requestAnimationFrame(() => {
      const nextFactor = pinchFactorRef.current; const anchor = pinchAnchorRef.current; pinchFactorRef.current = 1; pinchAnchorRef.current = null; pinchFrameRef.current = null;
      setZoom((value) => {
        const next = Math.min(2.4, Math.max(.6, value * nextFactor)); const applied = next / value; const viewport = viewportRef.current;
        if (viewport && anchor && applied !== 1) {
          const bounds = viewport.getBoundingClientRect(); const offsetX = anchor.clientX - bounds.left; const offsetY = anchor.clientY - bounds.top; const oldLeft = viewport.scrollLeft; const oldTop = viewport.scrollTop;
          requestAnimationFrame(() => { viewport.scrollLeft = (oldLeft + offsetX) * applied - offsetX; viewport.scrollTop = (oldTop + offsetY) * applied - offsetY; });
        }
        return next;
      });
    });
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current; if (!viewport) return;
    const pinchZoom = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomPdf(Math.exp(-event.deltaY * .012));
    };
    viewport.addEventListener('wheel', pinchZoom, { passive: false });
    return () => viewport.removeEventListener('wheel', pinchZoom);
  }, [zoomPdf]);
  const readerGestureDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editing || event.pointerType !== 'touch') return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    readerTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const touches = [...readerTouchesRef.current.values()];
    if (touches.length >= 2) readerPinchRef.current = { span: Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y) };
  };
  const readerGestureMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editing || event.pointerType !== 'touch') return; const previousPoint = readerTouchesRef.current.get(event.pointerId); if (!previousPoint) return;
    event.preventDefault(); readerTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const touches = [...readerTouchesRef.current.values()];
    if (touches.length >= 2) { const span = Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y); const previousSpan = readerPinchRef.current?.span; if (previousSpan && previousSpan > 0) zoomPdf(span / previousSpan, (touches[0]!.x + touches[1]!.x) / 2, (touches[0]!.y + touches[1]!.y) / 2); readerPinchRef.current = { span }; return; }
    readerPinchRef.current = null; viewportRef.current?.scrollBy({ left: previousPoint.x - event.clientX, top: previousPoint.y - event.clientY, behavior: 'auto' });
  };
  const readerGestureEnd = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.pointerType !== 'touch') return; readerTouchesRef.current.delete(event.pointerId); if (readerTouchesRef.current.size < 2) readerPinchRef.current = null; };
  const erase = (page: number, point: PdfAnnotationPoint, mode: EraserMode) => {
    if (!toolbarPinned) { setToolbarCollapsed(true); setToolSettingsOpen(false); }
    const radius = Math.max(.012, inkSize / 80);
    setAnnotations((items) => {
      if (mode === 'stroke') {
        const target = [...items].reverse().find((item) => item.page === page && item.points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < radius));
        if (!target) return items;
        setPdfSaveDirty(true); commitSnapshot(items); return items.filter((item) => item.id !== target.id);
      }
      let changed = false;
      const next = items.flatMap((item) => {
        if (item.page !== page || item.tool === 'line' || item.straight) return [item];
        const runs: PdfAnnotationPoint[][] = []; let run: PdfAnnotationPoint[] = [];
        for (const candidate of item.points) {
          if (Math.hypot(candidate.x - point.x, candidate.y - point.y) >= radius) run.push(candidate);
          else { changed = true; if (run.length > 1) runs.push(run); run = []; }
        }
        if (run.length > 1) runs.push(run);
        if (!changed || (runs.length === 1 && runs[0]?.length === item.points.length)) return [item];
        return runs.map((points, index) => ({ ...item, id: `${item.id}-part-${Date.now()}-${index}`, points }));
      });
      if (!changed) return items;
      setPdfSaveDirty(true); commitSnapshot(items); return next;
    });
  };
  const undo = () => { const previous = historyRef.current.pop(); if (!previous) return; setPdfSaveDirty(true); futureRef.current.push(annotations); setAnnotations(previous); };
  const redo = () => { const next = futureRef.current.pop(); if (!next) return; setPdfSaveDirty(true); historyRef.current.push(annotations); setAnnotations(next); };
  const gestureUndo = () => { const now = performance.now(); if (now - lastGestureUndoRef.current < 500) return; lastGestureUndoRef.current = now; undo(); };
  const undoGestureDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || event.pointerType !== 'touch') return;
    undoTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (undoTouchesRef.current.size === 2) undoGestureRef.current = { startedAt: performance.now(), starts: new Map(undoTouchesRef.current), moved: false };
    else if (undoTouchesRef.current.size > 2) undoGestureRef.current = null;
  };
  const undoGestureMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || event.pointerType !== 'touch' || !undoTouchesRef.current.has(event.pointerId)) return;
    undoTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = undoGestureRef.current; const start = gesture?.starts.get(event.pointerId);
    if (gesture && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 22) gesture.moved = true;
  };
  const undoGestureEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    undoTouchesRef.current.delete(event.pointerId);
    if (undoTouchesRef.current.size > 0) return;
    const gesture = undoGestureRef.current; undoGestureRef.current = null;
    if (editing && gesture && !gesture.moved && performance.now() - gesture.startedAt < 650) gestureUndo();
  };
  const clearPage = () => { const next = annotations.filter((item) => item.page !== pageNumber); if (next.length !== annotations.length) { setPdfSaveDirty(true); commitSnapshot(annotations); setAnnotations(next); } };
  const createAnnotatedPdf = async (editable: boolean) => {
    if (!document) throw new Error('PDF is unavailable.');
    const [{ createAnnotatedPdf: encode }, bytes] = await Promise.all([import('../../../services/pdf/PdfEditableAnnotationCodec'), document.getData()]);
    return encode(bytes, annotations, editable);
  };
  const downloadBytes = (output: Uint8Array, filename: string) => { const bytes = Uint8Array.from(output); const blob = new Blob([bytes.buffer], { type: 'application/pdf' }); const downloadUrl = URL.createObjectURL(blob); const anchor = globalThis.document.createElement('a'); anchor.href = downloadUrl; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000); };
  const exportPdf = async () => {
    if (!document || annotations.length === 0 || exporting) return; setExporting(true);
    try { downloadBytes(await createAnnotatedPdf(false), `${name.replace(/\.pdf$/i, '')}-flattened.pdf`); } finally { setExporting(false); }
  };
  const savePdf = async (mode: Exclude<PdfSaveMode, 'ask'>) => {
    if (!document || saving || !pdfSaveDirty) return; setSaving(true); setSaveNotice('');
    try {
      const output = await createAnnotatedPdf(annotationFormat === 'editable');
      if (mode === 'copy') { downloadBytes(output, `${name.replace(/\.pdf$/i, '')}-annotated.pdf`); localStorage.setItem(savedDigestKey, annotationDigest(annotations)); setPdfSaveDirty(false); setSaveNotice('Copy downloaded'); return; }
      let handle = fileHandle;
      if (!handle) {
        const picker = (window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
        if (picker) handle = await picker.call(window, { suggestedName: name, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] });
      }
      if (handle) { const writable = await handle.createWritable(); await writable.write(output); await writable.close(); localStorage.setItem(savedDigestKey, annotationDigest(annotations)); setPdfSaveDirty(false); setSaveNotice('Saved to PDF'); await refreshLocalSource(handle); }
      else { downloadBytes(output, name); localStorage.setItem(savedDigestKey, annotationDigest(annotations)); setPdfSaveDirty(false); setSaveNotice('Saved as download'); }
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setSaveNotice('Save failed');
    } finally { setSaving(false); window.setTimeout(() => setSaveNotice(''), 2400); }
  };
  const requestSave = () => { if (saveMode === 'ask' || annotationFormat === 'flattened') setSaveDialogOpen(true); else void savePdf(saveMode); };
  const chooseSaveMode = (mode: Exclude<PdfSaveMode, 'ask'>) => {
    if (rememberSaveMode) { setSaveMode(mode); localStorage.setItem(SAVE_MODE_KEY, mode); }
    setSaveDialogOpen(false); void savePdf(mode);
  };
  const updateSaveMode = (mode: PdfSaveMode) => { setSaveMode(mode); if (mode === 'ask') localStorage.removeItem(SAVE_MODE_KEY); else localStorage.setItem(SAVE_MODE_KEY, mode); };
  const updateAutosaveDelay = (delay: number) => { setAutosaveDelay(delay); localStorage.setItem(AUTOSAVE_DELAY_KEY, String(delay)); };
  const updateAnnotationFormat = (format: 'editable' | 'flattened') => { setAnnotationFormat(format); localStorage.setItem(ANNOTATION_FORMAT_KEY, format); };
  const updateEditSavedAnnotations = (enabled: boolean) => {
    setEditSavedAnnotations(enabled); localStorage.setItem(EDIT_SAVED_ANNOTATIONS_KEY, String(enabled));
    if (!enabled) { setNativeInkImported(false); setAnnotations((items) => items.filter((item) => !item.id.startsWith('pdf-'))); }
  };
  const toggleToolbarPinned = () => setToolbarPinned((current) => { const next = !current; localStorage.setItem(TOOLBAR_PINNED_KEY, String(next)); return next; });
  const beginCollapsedToolbarDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    collapsedToolbarDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: collapsedToolbarPosition, moved: false };
  };
  const moveCollapsedToolbar = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = collapsedToolbarDragRef.current;
    const host = event.currentTarget.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !host) return;
    const bounds = host.getBoundingClientRect();
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
    if (!moved) return;
    event.preventDefault();
    const edgeX = Math.min(.5, 18 / Math.max(1, bounds.width));
    const edgeY = Math.min(.5, 18 / Math.max(1, bounds.height));
    const next = {
      x: Math.min(1 - edgeX, Math.max(edgeX, drag.origin.x + (event.clientX - drag.startX) / bounds.width)),
      y: Math.min(1 - edgeY, Math.max(edgeY, drag.origin.y + (event.clientY - drag.startY) / bounds.height)),
    };
    collapsedToolbarDragRef.current = { ...drag, moved: true };
    collapsedToolbarPositionRef.current = next;
    setCollapsedToolbarPosition(next);
  };
  const endCollapsedToolbarDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = collapsedToolbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    collapsedToolbarDragRef.current = null;
    if (!drag.moved) return;
    suppressCollapsedClickRef.current = true;
    localStorage.setItem(COLLAPSED_TOOLBAR_POSITION_KEY, JSON.stringify(collapsedToolbarPositionRef.current));
    window.setTimeout(() => { suppressCollapsedClickRef.current = false; }, 0);
  };
  const saveToolPreset = () => {
    const id = crypto.randomUUID?.() ?? `preset-${Date.now()}`;
    const label = `${tool[0]!.toUpperCase()}${tool.slice(1)} · ${inkSize}px`;
    const preset: ToolPreset = { id, tool, color, size: inkSize, label, advanced: { ...advanced } };
    setToolPresets((items) => [...items, preset].slice(-8));
  };
  const applyToolPreset = (preset: ToolPreset) => {
    setTool(preset.tool); setToolSizes((items) => ({ ...items, [preset.tool]: preset.size }));
    if (preset.tool !== 'eraser') setToolColors((items) => ({ ...items, [preset.tool]: preset.color }));
    if (preset.advanced) setAdvanced((items) => ({ ...items, ...preset.advanced }));
  };
  const presetDetails = (preset: ToolPreset) => {
    if (preset.tool === 'pen') return `${preset.size}px · ${preset.advanced?.penPressure === false ? 'fixed' : 'pressure'} · ${preset.advanced?.penSmoothing ?? 'balanced'}`;
    if (preset.tool === 'highlighter') return `${preset.size}px · ${Math.round((preset.advanced?.highlighterOpacity ?? .3) * 100)}% · ${preset.advanced?.highlighterStraight ? 'straight' : 'freehand'}`;
    if (preset.tool === 'eraser') return `${preset.size}px · ${preset.advanced?.eraserMode ?? 'stroke'} eraser`;
    return `${preset.size}px · straight line`;
  };
  const discardEditableAnnotations = async () => {
    if (!fingerprint) return;
    setDiscardDialogOpen(false); historyRef.current = []; futureRef.current = []; drawingSnapshotRef.current = null;
    setAnnotations([]); setNativeInkImported(false); setAutosaveState('saved'); setPdfSaveDirty(false);
    localStorage.removeItem(savedDigestKey);
    await deletePdfAnnotations(fingerprint).catch(() => undefined);
    setSaveNotice('Annotations discarded'); window.setTimeout(() => setSaveNotice(''), 2400);
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => { const target = event.target as HTMLElement; if (target.matches('input, textarea, select, [contenteditable="true"]') && !(event.ctrlKey || event.metaKey)) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } else if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goTo(pageNumber + 1); } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(pageNumber - 1); } else if (event.key === 'Escape') { setEditing(false); setSearchOpen(false); setDocumentMenuOpen(false); setToolSettingsOpen(false); } };
  const visiblePages = document ? (viewMode === 'page' ? [pageNumber] : Array.from({ length: pages }, (_, index) => index + 1)) : [];
  const annotationsByPage = useMemo(() => {
    const grouped = new Map<number, PdfInkAnnotation[]>();
    for (const annotation of annotations) grouped.set(annotation.page, [...(grouped.get(annotation.page) ?? []), annotation]);
    return grouped;
  }, [annotations]);

  return <div className={cx(styles.reader, controlsInHeader && styles.controlsInHeader, className)} data-pdf-canvas-reader tabIndex={0} onKeyDown={keyboard}>
    {document && <>
      <div className={styles.controls} aria-label="PDF controls">
        <button type="button" disabled={pageNumber <= 1} onClick={() => goTo(pageNumber - 1)} aria-label="Previous page"><Icon name="arrowLeft" size={16} /></button>
        <label aria-label="Current PDF page"><input type="number" min={1} max={pages} value={pageNumber} onChange={(event) => goTo(Number(event.target.value) || 1)} /><span>/ {pages}</span></label>
        <button type="button" disabled={pageNumber >= pages} onClick={() => goTo(pageNumber + 1)} aria-label="Next page" className={styles.next}><Icon name="arrowLeft" size={16} /></button>
        <span className={styles.divider} />
        <button type="button" className={styles.zoomAdjust} disabled={zoom <= .6} onClick={() => setZoom((value) => Math.max(.6, value - .2))} aria-label="Zoom out">−</button>
        <button type="button" className={styles.zoom} onClick={() => setZoom(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className={styles.zoomAdjust} disabled={zoom >= 2.4} onClick={() => setZoom((value) => Math.min(2.4, value + .2))} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
        <span className={styles.divider} />
        <button type="button" className={cx(styles.saveAction, pdfSaveDirty && styles.saveDirty, pdfSaveDirty && annotationFormat === 'flattened' && styles.flattenSaveAction)} disabled={saving || !pdfSaveDirty} onClick={requestSave} aria-label={pdfSaveDirty ? 'Save annotation changes to PDF' : 'Annotations already saved to PDF'} title={pdfSaveDirty ? annotationFormat === 'flattened' ? 'Flatten and save — marks cannot be edited afterward' : fileHandle ? 'Save editable changes to this PDF' : 'Save editable annotated PDF' : 'No unsaved PDF changes'}><Icon name="save" size={16} /></button>
        <button type="button" className={editing ? styles.inkActive : ''} onClick={() => { setEditing((value) => !value); setToolbarCollapsed(false); setSearchOpen(false); }} aria-pressed={editing} aria-label={editing ? 'Editing mode active — switch to reading mode' : 'Reading mode active — switch to editing mode'} title={editing ? 'Editing mode · switch to reading' : 'Reading mode · switch to editing'}><Icon name={editing ? 'pencil' : 'handPointer'} size={17} /></button>
        <button type="button" className={searchOpen ? styles.searchActive : ''} onClick={() => { setSearchOpen((open) => !open); setEditing(false); }} aria-label="Search inside PDF"><Icon name="search" size={16} /></button>
        <button type="button" className={styles.discardAction} disabled={!annotations.length && !pdfSaveDirty} onClick={() => { setDiscardDialogOpen(true); setDocumentMenuOpen(false); }} aria-label="Discard editable annotation changes" title={annotations.length ? `Discard all ${annotations.length} editable annotation${annotations.length === 1 ? '' : 's'}` : pdfSaveDirty ? 'Discard unsaved annotation changes' : 'No editable annotation changes to discard'}><Icon name="trash" size={16} /></button>
        <div ref={documentMenuRef} className={styles.documentMenuHost}><button type="button" className={documentMenuOpen ? styles.searchActive : ''} onClick={() => setDocumentMenuOpen((open) => { const next = !open; if (next) setToolbarCollapsed(true); return next; })} aria-label="More PDF options"><Icon name="more" size={16} /></button>{documentMenuOpen && <div className={styles.documentMenu}>
          <button type="button" onClick={() => { setViewMode((value) => value === 'continuous' ? 'page' : 'continuous'); setDocumentMenuOpen(false); }}><Icon name="monitor" size={15} /><span><strong>{viewMode === 'continuous' ? 'Single-page view' : 'Continuous scroll'}</strong><small>{viewMode === 'continuous' ? 'Render one page at a time' : 'Scroll through virtualized pages'}</small></span></button>
          <button type="button" onClick={() => { setRotation((value) => (value + 90) % 360); setDocumentMenuOpen(false); }}><Icon name="sync" size={15} /><span><strong>Rotate clockwise</strong><small>Current: {rotation}°</small></span></button>
          <button type="button" disabled={!annotations.length || exporting} onClick={() => { void exportPdf(); setDocumentMenuOpen(false); }}><Icon name="share" size={15} /><span><strong>{exporting ? 'Preparing copy…' : 'Export flattened copy'}</strong><small>Permanent compatibility copy · {annotations.length} mark{annotations.length === 1 ? '' : 's'}</small></span></button>
          <a href={sourceUrl} download={name}><Icon name="share" size={15} /><span><strong>Download original</strong><small>{name}</small></span></a>
          <button type="button" onClick={() => { setPreferencesOpen(true); setDocumentMenuOpen(false); }}><Icon name="settings" size={15} /><span><strong>Annotation preferences</strong><small>{autosaveDelay / 1000}s autosave · {saveMode === 'replace' ? 'update file' : saveMode === 'copy' ? 'save copy' : 'ask on save'}</small></span></button>
        </div>}</div>
      </div>
      {editing && toolbarCollapsed && <button type="button" className={styles.collapsedInkToolbar} style={{ left: `${collapsedToolbarPosition.x * 100}%`, top: `${collapsedToolbarPosition.y * 100}%` }} onPointerDown={beginCollapsedToolbarDrag} onPointerMove={moveCollapsedToolbar} onPointerUp={endCollapsedToolbarDrag} onPointerCancel={endCollapsedToolbarDrag} onClick={() => { if (!suppressCollapsedClickRef.current) setToolbarCollapsed(false); }} aria-label="Expand or move annotation tools" title="Drag to move · Click to show annotation tools"><Icon name={tool === 'pen' ? 'pencil' : tool === 'highlighter' ? 'highlighter' : tool === 'line' ? 'line' : 'eraser'} size={16} /><span className={autosaveState === 'saving' ? styles.savingDot : ''} /></button>}
      {editing && !toolbarCollapsed && <div ref={inkToolbarRef} className={styles.inkToolbar} aria-label="Annotation tools">
        {(['pen', 'highlighter', 'eraser'] as const).map((value) => <button type="button" key={value} className={tool === value ? styles.toolActive : ''} onClick={() => { if (tool === value) setToolSettingsOpen((open) => !open); else { setTool(value); setToolSettingsOpen(false); } }} onDoubleClick={() => setToolSettingsOpen(true)} aria-label={value} title={tool === value ? 'Click again for tool settings' : value}><Icon name={value === 'pen' ? 'pencil' : value === 'highlighter' ? 'highlighter' : 'eraser'} size={17} /></button>)}
        <span className={styles.inkDivider} /><input type="color" value={color} onChange={(event) => { if (tool !== 'eraser') setToolColors((current) => ({ ...current, [tool]: event.target.value })); }} aria-label="Ink colour" disabled={tool === 'eraser'} /><input type="range" min="1" max={tool === 'eraser' ? 12 : 6} step="1" value={inkSize} onChange={(event) => setToolSizes((current) => ({ ...current, [tool]: Number(event.target.value) }))} aria-label={`${tool} thickness`} title={`${tool} thickness: ${inkSize}`} />
        <span className={styles.inkDivider} /><button type="button" onClick={undo} disabled={!historyRef.current.length} aria-label="Undo"><Icon name="undo" size={16} /></button><button type="button" onClick={redo} disabled={!futureRef.current.length} aria-label="Redo"><Icon name="redo" size={16} /></button><button type="button" onClick={clearPage} disabled={!annotations.some((item) => item.page === pageNumber)} aria-label="Clear annotations on this page"><Icon name="trash" size={16} /></button><button type="button" className={toolbarPinned ? styles.pinActive : ''} onClick={toggleToolbarPinned} aria-pressed={toolbarPinned} aria-label={toolbarPinned ? 'Allow toolbar to minimize while drawing' : 'Keep toolbar open while drawing'} title={toolbarPinned ? 'Toolbar locked open' : 'Auto-minimize toolbar'}><Icon name={toolbarPinned ? 'lock' : 'unlock'} size={15} /></button><span className={cx(styles.savedState, (saving || autosaveState === 'saving') && styles.savingState, !pdfSaveDirty && styles.pdfSavedState)}>{saveNotice || (saving ? 'Writing PDF…' : pdfSaveDirty ? autosaveState === 'saving' ? 'Backing up…' : 'Not saved to PDF' : 'Saved to PDF')}</span>
      </div>}
      {editing && !toolbarCollapsed && toolSettingsOpen && <section ref={toolSettingsRef} className={styles.toolSettings} aria-label={`${tool} advanced settings`}>
        <header><div><strong>{tool[0]!.toUpperCase()}{tool.slice(1)} settings</strong><small>Saved automatically on this device</small></div><button type="button" onClick={() => setToolSettingsOpen(false)} aria-label="Close tool settings"><Icon name="close" size={14} /></button></header>
        {tool !== 'eraser' && <div className={styles.toolColour}><span>Colour</span><div>{['#7c83ff', '#ef6461', '#f6c453', '#52c78f', '#4ba3f2', '#f4f4f5'].map((value) => <button type="button" key={value} className={color.toLowerCase() === value ? styles.colourActive : ''} style={{ '--swatch': value } as CSSProperties} onClick={() => setToolColors((current) => ({ ...current, [tool]: value }))} aria-label={`Use ${value}`} />)}<label title="Choose a custom colour"><input type="color" value={color} onChange={(event) => setToolColors((current) => ({ ...current, [tool]: event.target.value }))} /><Icon name="plus" size={11} /></label></div></div>}
        <label className={styles.toolRange}><span>{tool === 'eraser' ? 'Eraser size' : 'Thickness'} <b>{inkSize}</b></span><input type="range" min="1" max={tool === 'eraser' ? 12 : 6} step="1" value={inkSize} onChange={(event) => setToolSizes((current) => ({ ...current, [tool]: Number(event.target.value) }))} /></label>
        {tool === 'pen' && <><button type="button" className={cx(styles.toolToggle, advanced.penPressure && styles.toolToggleOn)} onClick={() => setAdvanced((value) => ({ ...value, penPressure: !value.penPressure }))}><span><strong>Pressure</strong><small>Stylus pressure changes stroke width</small></span><i /></button><div className={styles.toolSettingRow}><span>Smoothing</span><div className={styles.toolSegments}>{(['off', 'balanced', 'smooth'] as const).map((value) => <button type="button" key={value} className={advanced.penSmoothing === value ? styles.segmentedActive : ''} onClick={() => setAdvanced((items) => ({ ...items, penSmoothing: value }))}>{value}</button>)}</div></div></>}
        {tool === 'highlighter' && <><label className={styles.toolRange}><span>Opacity <b>{Math.round(advanced.highlighterOpacity * 100)}%</b></span><input type="range" min=".1" max=".45" step=".05" value={advanced.highlighterOpacity} onChange={(event) => setAdvanced((value) => ({ ...value, highlighterOpacity: Number(event.target.value) }))} /></label><div className={styles.toolSettingRow}><span>Stroke</span><div className={styles.toolSegments}>{(['freehand', 'straight'] as const).map((value) => <button type="button" key={value} className={(advanced.highlighterStraight ? 'straight' : 'freehand') === value ? styles.segmentedActive : ''} onClick={() => setAdvanced((items) => ({ ...items, highlighterStraight: value === 'straight' }))}>{value}</button>)}</div></div><button type="button" className={cx(styles.toolToggle, advanced.highlighterOverlap && styles.toolToggleOn)} onClick={() => setAdvanced((value) => ({ ...value, highlighterOverlap: !value.highlighterOverlap }))}><span><strong>Even colour</strong><small>Keep highlighting translucent and readable.</small></span><i /></button></>}
        {tool === 'eraser' && <div className={styles.toolSettingRow}><span>Eraser mode</span><div className={styles.toolSegments}>{(['stroke', 'precision'] as const).map((value) => <button type="button" key={value} className={advanced.eraserMode === value ? styles.segmentedActive : ''} onClick={() => setAdvanced((items) => ({ ...items, eraserMode: value }))}>{value}</button>)}</div><small>{advanced.eraserMode === 'stroke' ? 'Removes an entire mark.' : 'Cuts only the touched portion.'}</small></div>}
        <div className={styles.toolPresets}><div><span><Icon name="star" size={12} /> Favourites</span><button type="button" onClick={saveToolPreset}><Icon name="star" size={12} /> Add favourite</button></div>{toolPresets.length > 0 ? <div>{toolPresets.map((preset) => <article key={preset.id}><button type="button" onClick={() => applyToolPreset(preset)}><span className={styles.presetPreview} style={{ '--preset-colour': preset.color, '--preset-size': `${Math.max(2, preset.size)}px` } as CSSProperties}><Icon name={preset.tool === 'pen' ? 'pencil' : preset.tool === 'highlighter' ? 'highlighter' : preset.tool === 'line' ? 'line' : 'eraser'} size={14} /></span><span><strong>{preset.tool[0]!.toUpperCase()}{preset.tool.slice(1)}</strong><small>{presetDetails(preset)}</small></span></button><button type="button" onClick={() => setToolPresets((items) => items.filter((item) => item.id !== preset.id))} aria-label={`Delete ${preset.label}`} title="Remove favourite"><Icon name="close" size={11} /></button></article>)}</div> : <small className={styles.emptyPresets}>Save combinations you use often. They will appear here.</small>}</div>
        <p>Tip: a stylus barrel button temporarily switches to the eraser. Touch drawing is ignored while the pen is active.</p>
      </section>}
      {searchOpen && <section className={styles.searchPanel} aria-label="Search PDF"><label><Icon name="search" size={15} /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this PDF…" /><span>{indexing ? 'Indexing…' : query ? `${results.length} pages` : ''}</span><button type="button" onClick={() => { setSearchOpen(false); setQuery(''); }} aria-label="Close search"><Icon name="close" size={15} /></button></label>{query && !indexing && <div className={styles.searchResults}>{results.length ? results.map((result) => <button type="button" key={result.page} onClick={() => { goTo(result.page); setViewMode('page'); }}><strong>Page {result.page}</strong><span>{result.excerpt}</span></button>) : <small>No matches in this PDF.</small>}</div>}</section>}
    </>}
    <div ref={viewportRef} className={cx(styles.viewport, viewMode === 'page' && styles.pageMode, editing && styles.editViewport)} onPointerDownCapture={undoGestureDown} onPointerMoveCapture={undoGestureMove} onPointerUpCapture={undoGestureEnd} onPointerCancelCapture={undoGestureEnd} onPointerDown={readerGestureDown} onPointerMove={readerGestureMove} onPointerUp={readerGestureEnd} onPointerCancel={readerGestureEnd} onDoubleClick={(event) => { if (!editing && (event.target as Element).closest(`.${styles.page}`)) setZoom(1); }}>
      {loading && <div className={styles.status}><span className={styles.spinner} /><strong>Opening PDF…</strong><small>{name}</small></div>}{error && <div className={styles.status}><Icon name="book" size={24} /><strong>Unable to open PDF</strong><small>{error}</small></div>}
      {!error && document && visiblePages.map((page) => <PdfPage key={page} document={document} pageNumber={page} width={width} zoom={zoom} rotation={rotation} register={(number, node) => { if (node) pageRefs.current.set(number, node); else pageRefs.current.delete(number); }} annotations={annotationsByPage.get(page) ?? []} hideNativeAnnotations={nativeInkImported} editing={editing} tool={tool} color={color} inkSize={inkSize} advanced={advanced} onPrepare={prepareStroke} onBegin={begin} onExtend={extend} onEnd={end} onCancel={cancelStroke} onPan={panAnnotations} onPinch={zoomPdf} onTwoFingerTap={gestureUndo} onErase={erase} onNavigate={(destination, action) => void followLink(destination, action)} />)}
    </div>
    {saveDialogOpen && <div className={styles.saveBackdrop} role="presentation" onPointerDown={() => setSaveDialogOpen(false)}><section className={styles.saveDialog} role="dialog" aria-modal="true" aria-labelledby="pdf-save-title" onPointerDown={(event) => event.stopPropagation()}>
      <header><span><Icon name="save" size={18} /></span><div><strong id="pdf-save-title">Save {annotationFormat === 'editable' ? 'editable' : 'flattened'} PDF</strong><small>{annotationFormat === 'editable' ? 'Marks remain selectable and erasable after reopening.' : 'Marks become permanent page content.'}</small></div><button type="button" onClick={() => setSaveDialogOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
      <div className={styles.formatChoice} role="group" aria-label="PDF annotation format"><button type="button" className={annotationFormat === 'editable' ? styles.formatChoiceActive : ''} onClick={() => updateAnnotationFormat('editable')}><Icon name="pencil" size={15} /><span><strong>Editable</strong><small>Erase after reopening</small></span></button><button type="button" className={annotationFormat === 'flattened' ? styles.flattenChoiceActive : ''} onClick={() => updateAnnotationFormat('flattened')}><Icon name="lock" size={15} /><span><strong>Flattened</strong><small>Permanent—cannot erase</small></span></button></div>
      {annotationFormat === 'flattened' && <p className={styles.flattenWarning}><strong>This cannot be undone after saving.</strong> Choose Editable if you want to erase or change these marks later.</p>}
      <div className={styles.saveChoices}>
        <button type="button" onClick={() => chooseSaveMode('replace')}><Icon name="save" size={18} /><span><strong>{fileHandle ? 'Update opened PDF' : 'Choose local destination'}</strong><small>{fileHandle ? 'Write annotations into the file you opened.' : 'Save an annotated PDF using the system picker.'}</small></span></button>
        <button type="button" onClick={() => chooseSaveMode('copy')}><Icon name="copy" size={18} /><span><strong>Keep original and save copy</strong><small>Download {name.replace(/\.pdf$/i, '')}-annotated.pdf</small></span></button>
      </div>
      <label className={styles.rememberChoice}><input type="checkbox" checked={rememberSaveMode} onChange={(event) => setRememberSaveMode(event.target.checked)} /><span>Remember my choice for future PDFs</span></label>
      <p><strong>Crash protection is on.</strong> Editable strokes are autosaved locally before they are written into the PDF.</p>
    </section></div>}
    {preferencesOpen && <div className={styles.saveBackdrop} role="presentation" onPointerDown={() => setPreferencesOpen(false)}><section className={cx(styles.saveDialog, styles.preferencesDialog)} role="dialog" aria-modal="true" aria-labelledby="annotation-preferences-title" onPointerDown={(event) => event.stopPropagation()}>
      <header><span><Icon name="settings" size={18} /></span><div><strong id="annotation-preferences-title">Annotation preferences</strong><small>Choose defaults once. They apply to every PDF on this device.</small></div><button type="button" onClick={() => setPreferencesOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
      <div className={styles.preferenceGroup}><div><strong>Autosave delay</strong><small>Changes are also flushed immediately when the app is backgrounded.</small></div><div className={styles.segmentedChoices}>{[500, 1000, 2000, 5000].map((delay) => <button type="button" key={delay} className={autosaveDelay === delay ? styles.segmentedActive : ''} onClick={() => updateAutosaveDelay(delay)}>{delay < 1000 ? '.5s' : `${delay / 1000}s`}</button>)}</div></div>
      <div className={styles.preferenceGroup}><div><strong>Default Save action</strong><small>You can change this again from the PDF menu.</small></div><div className={styles.saveModeChoices}>
        <button type="button" className={saveMode === 'ask' ? styles.saveModeActive : ''} onClick={() => updateSaveMode('ask')}><strong>Ask</strong><small>Choose every time</small></button>
        <button type="button" className={saveMode === 'replace' ? styles.saveModeActive : ''} onClick={() => updateSaveMode('replace')}><strong>Update file</strong><small>Use writable original</small></button>
        <button type="button" className={saveMode === 'copy' ? styles.saveModeActive : ''} onClick={() => updateSaveMode('copy')}><strong>Save copy</strong><small>Never change original</small></button>
      </div></div>
      <div className={styles.preferenceGroup}><div><strong>PDF annotation format</strong><small>Editable is recommended. Flatten only for a final compatibility copy.</small></div><div className={styles.saveModeChoices}>
        <button type="button" className={annotationFormat === 'editable' ? styles.saveModeActive : ''} onClick={() => updateAnnotationFormat('editable')}><strong>Editable</strong><small>Erase after reopening</small></button>
        <button type="button" className={annotationFormat === 'flattened' ? styles.saveModeActive : ''} onClick={() => updateAnnotationFormat('flattened')}><strong>Flattened</strong><small>Permanent page marks</small></button>
      </div></div>
      <div className={styles.preferenceGroup}><button type="button" className={cx(styles.preferenceToggle, editSavedAnnotations && styles.preferenceToggleOn)} onClick={() => updateEditSavedAnnotations(!editSavedAnnotations)}><span><strong>Edit saved annotations</strong><small>When enabled, editable marks saved inside a PDF return to the pen and eraser tools when reopened.</small></span><i /></button><p>{editSavedAnnotations ? 'On · Saved editable marks can be erased or changed.' : 'Off · Saved marks are displayed as PDF content and protected from the app eraser.'}</p></div>
      <p><strong>Recommended:</strong> Editable PDF, 1-second autosave and Ask on Save preserve both safety and control.</p>
    </section></div>}
    {discardDialogOpen && <div className={styles.saveBackdrop} role="presentation" onPointerDown={() => setDiscardDialogOpen(false)}><section className={cx(styles.saveDialog, styles.discardDialog)} role="alertdialog" aria-modal="true" aria-labelledby="discard-annotations-title" onPointerDown={(event) => event.stopPropagation()}>
      <header><span><Icon name="trash" size={18} /></span><div><strong id="discard-annotations-title">Discard editable annotation changes?</strong><small>{annotations.length ? `Remove all ${annotations.length} editable annotation${annotations.length === 1 ? '' : 's'} stored by this app.` : 'Cancel the unsaved annotation changes made to this PDF.'}</small></div><button type="button" onClick={() => setDiscardDialogOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
      <p>The opened PDF remains unchanged. Saved editable marks return to their state in that PDF; unsaved pen and highlight changes are removed.</p>
      <div className={styles.discardActions}><button type="button" onClick={() => setDiscardDialogOpen(false)}>Keep changes</button><button type="button" onClick={() => void discardEditableAnnotations()}>Discard changes</button></div>
    </section></div>}
  </div>;
}
