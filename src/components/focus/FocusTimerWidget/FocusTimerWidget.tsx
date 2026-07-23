import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon } from '../../common';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { useFocusTimer } from '../../../context/FocusTimerContext';
import styles from './FocusTimerWidget.module.css';

const POSITION_KEY = 'revision-engine:focus-widget-position';
const PRESETS = [25, 30, 45, 60];
type BubbleView = 'icon' | 'time';

interface PipWindow extends Window { close: () => void }
interface DocumentPictureInPictureApi { requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<PipWindow> }

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function bubbleWidth(view: BubbleView, size: number) { return view === 'icon' ? size : Math.max(64, size + 48); }

function CompactSwitch({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`${styles.switch} ${checked ? styles.switchOn : ''}`} onClick={() => onChange(!checked)}><span /></button>;
}

function loadPosition() {
  try {
    const value = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as { x: number; y: number } | null;
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
  } catch { /* fall through */ }
  return { x: Math.max(0, window.innerWidth - 20), y: Math.max(0, window.innerHeight - 90) };
}

export function FocusTimerWidget() {
  const timer = useFocusTimer();
  const { settings, ready: settingsReady, update } = useAppSettings();
  const [view, setView] = useState<BubbleView>('icon');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'session' | 'appearance'>('session');
  const [selectedMinutes, setSelectedMinutes] = useState(settings.focusTimer.defaultMinutes);
  const [position, setPosition] = useState(loadPosition);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pipMessage, setPipMessage] = useState('');
  const [nudging, setNudging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [closeAfterEnd, setCloseAfterEnd] = useState(false);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const pipRef = useRef<PipWindow | null>(null);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => setSelectedMinutes(settings.focusTimer.defaultMinutes), [settings.focusTimer.defaultMinutes]);

  useEffect(() => {
    const openFromNavigation = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: 'session' | 'appearance' }>).detail?.tab;
      setModalTab(requested ?? 'session');
      setMenuOpen(true);
    };
    window.addEventListener('revision-engine:open-focus-timer', openFromNavigation);
    return () => window.removeEventListener('revision-engine:open-focus-timer', openFromNavigation);
  }, [settings.focusTimer.enabled, update]);

  useEffect(() => {
    const session = timer.active;
    if (!session || session.midpointNudged || !session.midpointNudgeEnabled || timer.elapsedMs < session.targetMs / 2) return;
    timer.markMidpointNudged();
    setNudging(true);
    window.setTimeout(() => setNudging(false), 1000);
  }, [timer]);

  useEffect(() => {
    const clamp = () => setPosition((current) => ({
      x: Math.max(0, Math.min(current.x, window.innerWidth - bubbleWidth(view, settings.focusTimer.size))),
      y: Math.max(0, Math.min(current.y, window.innerHeight - settings.focusTimer.size)),
    }));
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [settings.focusTimer.size, view]);

  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    pipRef.current?.close();
  }, []);

  const openAlwaysOnTop = async () => {
    const api = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture;
    if (!api) { setPipMessage('Always-on-top is unavailable in this browser.'); return; }
    try {
      pipRef.current?.close();
      const pip = await api.requestWindow({ width: 180, height: 80 });
      pipRef.current = pip;
      const doc = pip.document;
      doc.title = 'Focus';
      const style = doc.createElement('style');
      style.textContent = `
        :root { color-scheme: dark; background: #111114; }
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body {
          display: grid;
          place-items: center;
          color: #f7f7fb;
          background: #111114;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
          user-select: none;
        }
        strong {
          font-size: clamp(24px, 18vw, 42px);
          font-weight: 650;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.04em;
          line-height: 1;
        }
      `;
      const clock = doc.createElement('strong');
      clock.setAttribute('aria-label', 'Focus time remaining');
      doc.head.append(style);
      doc.body.append(clock);
      doc.body.ondblclick = () => { window.focus(); pip.close(); };
      const render = () => {
        const current = timerRef.current.active;
        clock.textContent = current?.status === 'awaiting-confirmation' ? 'Done' : formatClock(current ? Math.max(0, current.endsAt - (current.status === 'paused' ? current.pausedAt! : Date.now())) : 0);
      };
      render();
      const id = pip.setInterval(render, 500);
      pip.addEventListener('pagehide', () => { pip.clearInterval(id); if (pipRef.current === pip) pipRef.current = null; });
      setMenuOpen(false);
    } catch { setPipMessage('The browser did not allow the always-on-top window.'); }
  };

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y, moved: false };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - (position.x + drag.dx)) + Math.abs(event.clientY - (position.y + drag.dy)) > 3) drag.moved = true;
    if (!drag.moved) return;
    setDragging(true);
    setPosition({
      x: Math.max(0, Math.min(event.clientX - drag.dx, window.innerWidth - bubbleWidth(view, settings.focusTimer.size))),
      y: Math.max(0, Math.min(event.clientY - drag.dy, window.innerHeight - settings.focusTimer.size)),
    });
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const overClose = event.clientY >= window.innerHeight - 110 && Math.abs(event.clientX - window.innerWidth / 2) <= 90;
      if (overClose) {
        if (timer.active) {
          setCloseAfterEnd(true);
          setConfirmEnd(true);
        } else {
          update((current) => ({ ...current, focusTimer: { ...current.focusTimer, enabled: false } }));
        }
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        dragRef.current = null;
        setDragging(false);
        return;
      }
      const width = bubbleWidth(view, settings.focusTimer.size);
      const next = { x: position.x + width / 2 < window.innerWidth / 2 ? 0 : window.innerWidth - width, y: Math.max(0, Math.min(position.y, window.innerHeight - settings.focusTimer.size)) };
      setPosition(next);
      localStorage.setItem(POSITION_KEY, JSON.stringify(next));
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const singleClick = () => {
    if (suppressClickRef.current) return;
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      setView((current) => current === 'icon' ? 'time' : 'icon');
      clickTimerRef.current = null;
    }, 220);
  };
  const doubleClick = () => {
    if (suppressClickRef.current) return;
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    setMenuOpen(true);
    setModalTab('session');
  };

  // Never flash the default widget while the persisted opt-in preference is
  // still loading. An active session remains reachable even if the preference
  // was subsequently disabled.
  if (!settingsReady && !timer.active && !menuOpen) return null;
  if (!settings.focusTimer.enabled && !timer.active && !menuOpen) return null;
  return createPortal(<>
    <button
      type="button"
      className={`${styles.microWidget} ${view === 'time' ? styles.microTime : styles.microIcon} ${nudging ? styles.nudge : ''}`}
      style={{ left: position.x, top: position.y, '--focus-widget-opacity': settings.focusTimer.opacity / 100, '--focus-widget-size': `${settings.focusTimer.size}px`, '--focus-widget-time-width': `${bubbleWidth('time', settings.focusTimer.size)}px` } as CSSProperties}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      onClick={singleClick} onDoubleClick={doubleClick}
      aria-label={view === 'icon' ? 'Focus timer. Click for time, double-click for controls, or drag to move.' : `${timer.active ? formatClock(timer.remainingMs) : 'No active session'}. Double-click for controls.`}
      title="Click: time · Double-click: controls · Drag: move"
    >
      <Icon name="clock" size={view === 'icon' ? Math.max(10, settings.focusTimer.size - 8) : Math.max(10, settings.focusTimer.size - 10)} />
      {view === 'time' && <span>{timer.active ? timer.active.status === 'awaiting-confirmation' ? 'Done' : formatClock(timer.remainingMs) : 'Start'}</span>}
    </button>

    {menuOpen && <div className={styles.backdrop} onMouseDown={() => setMenuOpen(false)}><section className={`${styles.dialog} ${styles.timerMenu}`} role="dialog" aria-modal="true" aria-labelledby="focus-menu-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className={styles.modalHeader}><div><small>Focus Timer</small><h2 id="focus-menu-title">{modalTab === 'appearance' ? 'Widget preferences' : timer.active ? timer.active.status === 'awaiting-confirmation' ? 'Ready to finish' : formatClock(timer.remainingMs) : 'Start a session'}</h2></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button></header>
      <div className={styles.modalTabs}><button type="button" className={modalTab === 'session' ? styles.modalTabActive : ''} onClick={() => setModalTab('session')}>Session</button><button type="button" className={modalTab === 'appearance' ? styles.modalTabActive : ''} onClick={() => setModalTab('appearance')}>Preferences</button></div>
      {modalTab === 'appearance' ? <div className={styles.compactSettings}>
        <label><span><strong>Floating widget</strong><small>Available throughout the app</small></span><CompactSwitch label="Enable floating widget" checked={settings.focusTimer.enabled} disabled={Boolean(timer.active)} onChange={(enabled) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, enabled } }))} /></label>
        <label><span><strong>Default duration</strong><small>1–720 minutes</small></span><span className={styles.inlineValue}><input type="number" min="1" max="720" value={settings.focusTimer.defaultMinutes} onChange={(event) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, defaultMinutes: Math.max(1, Math.min(720, Number(event.target.value) || 1)) } }))} /><em>min</em></span></label>
        <div className={styles.settingPair}>
          <label className={timer.active ? styles.locked : ''}><span><strong>Allow pause</strong><small>{timer.active ? 'Locked this session' : 'Optional session breaks'}</small></span><CompactSwitch label="Allow timer pause" disabled={Boolean(timer.active)} checked={settings.focusTimer.allowPause} onChange={(allowPause) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, allowPause } }))} /></label>
          <label className={timer.active ? styles.locked : ''}><span><strong>Midpoint nudge</strong><small>{timer.active ? 'Locked this session' : 'One subtle pulse'}</small></span><CompactSwitch label="Enable midpoint nudge" disabled={Boolean(timer.active)} checked={settings.focusTimer.midpointNudge} onChange={(midpointNudge) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, midpointNudge } }))} /></label>
        </div>
        <label><span><strong>Opacity</strong><small>How quietly it sits onscreen</small></span><span className={styles.rangeControl}><input className={styles.modernRange} style={{ '--range-progress': `${((settings.focusTimer.opacity - 25) / 75) * 100}%` } as CSSProperties} type="range" min="25" max="100" step="5" value={settings.focusTimer.opacity} onChange={(event) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, opacity: Number(event.target.value) } }))} /><b>{settings.focusTimer.opacity}%</b></span></label>
        <label><span><strong>Icon size</strong><small>Collapsed widget footprint</small></span><span className={styles.rangeControl}><input className={styles.modernRange} style={{ '--range-progress': `${((settings.focusTimer.size - 16) / 20) * 100}%` } as CSSProperties} type="range" min="16" max="36" step="2" value={settings.focusTimer.size} onChange={(event) => update((current) => ({ ...current, focusTimer: { ...current.focusTimer, size: Number(event.target.value) } }))} /><b>{settings.focusTimer.size}px</b></span></label>
      </div> : timer.active ? <>
        <div className={styles.progress}><span style={{ width: `${Math.min(100, timer.elapsedMs / timer.active.targetMs * 100)}%` }} /></div>
        {timer.active.status === 'awaiting-confirmation' ? <div className={styles.actions}><Button variant="primary" onClick={() => { timer.complete(); setMenuOpen(false); }}>Complete session</Button><Button variant="ghost" onClick={() => setConfirmEnd(true)}>End and save</Button></div> : <div className={styles.actions}>{timer.active.allowPause && <Button variant="secondary" onClick={timer.active.status === 'paused' ? timer.resume : timer.pause}>{timer.active.status === 'paused' ? 'Resume' : 'Pause'}</Button>}<Button variant="danger" onClick={() => { setCloseAfterEnd(false); setConfirmEnd(true); }}>End session</Button></div>}
        <Button variant="ghost" fullWidth onClick={() => void openAlwaysOnTop()}><Icon name="expand" size={15} /> Open tiny always-on-top timer</Button>
        {pipMessage && <small className={styles.message} role="status">{pipMessage}</small>}
      </> : <>
        <div className={styles.presets}>{PRESETS.map((minutes) => <button type="button" key={minutes} className={selectedMinutes === minutes ? styles.presetActive : styles.preset} onClick={() => setSelectedMinutes(minutes)}>{minutes}<small>min</small></button>)}</div>
        <label className={styles.customMinutes}><span>Custom duration</span><input type="number" min="1" max="720" value={selectedMinutes} onChange={(event) => setSelectedMinutes(Math.max(1, Math.min(720, Number(event.target.value))))} /></label>
        <Button variant="primary" fullWidth onClick={() => { if (!settings.focusTimer.enabled) update((current) => ({ ...current, focusTimer: { ...current.focusTimer, enabled: true } })); timer.start(selectedMinutes, { allowPause: settings.focusTimer.allowPause, midpointNudge: settings.focusTimer.midpointNudge }); setMenuOpen(false); setView('icon'); }}>Start {selectedMinutes}-minute session</Button>
      </>}
    </section></div>}

    {dragging && <div className={styles.closeBucket}><Icon name="trash" size={17} /><span>Drop to close</span></div>}
    {confirmEnd && <div className={styles.backdrop} onMouseDown={() => { setConfirmEnd(false); setCloseAfterEnd(false); }}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="end-focus-title" onMouseDown={(event) => event.stopPropagation()}><Icon name="clock" size={24} /><h2 id="end-focus-title">{closeAfterEnd ? 'Save time and hide the timer?' : 'End and save this session?'}</h2><p>Your {formatClock(timer.elapsedMs)} of focused time will be saved against the {Math.round((timer.active?.targetMs ?? 0) / 60_000)}-minute target and included in total focus time.{closeAfterEnd ? ' The floating add-on will then be hidden.' : ''}</p><div className={styles.actions}><Button variant="secondary" onClick={() => { setConfirmEnd(false); setCloseAfterEnd(false); }}>Keep going</Button><Button variant="danger" onClick={() => { timer.discard(); if (closeAfterEnd) update((current) => ({ ...current, focusTimer: { ...current.focusTimer, enabled: false } })); setConfirmEnd(false); setCloseAfterEnd(false); setMenuOpen(false); setView('icon'); }}>Save and end{closeAfterEnd ? ' + hide' : ''}</Button></div></section></div>}
  </>, document.body);
}
