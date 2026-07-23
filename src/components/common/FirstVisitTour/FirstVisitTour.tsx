import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Routes } from '../../../constants/routes';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { WELCOME_TOUR_EVENT } from './tourEvents';
import styles from './FirstVisitTour.module.css';

const TOUR_KEY = 'revision-engine:welcome-tour:v2';
const TARGET_PADDING = 7;
const TOOLTIP_GAP = 15;

interface TourStep {
  readonly route: string;
  readonly target: string;
  readonly icon: IconName;
  readonly eyebrow: string;
  readonly title: string;
  readonly text: string;
  readonly hint?: string;
}

interface TargetRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const STEPS: readonly TourStep[] = [
  {
    route: Routes.dashboard,
    target: '[data-tour="activity-overview"]',
    icon: 'chart',
    eyebrow: 'Your learning pulse',
    title: 'See your progress at a glance',
    text: 'Open the activity calendar for daily, weekly, and monthly study patterns without leaving your dashboard.',
  },
  {
    route: Routes.dashboard,
    target: '[data-tour="daily-revision"]',
    icon: 'target',
    eyebrow: 'Daily revision',
    title: 'Revise what matters today',
    text: 'This builds a focused queue from due, weak, skipped, and recently missed questions. Your result improves the next queue.',
  },
  {
    route: Routes.dashboard,
    target: '[data-tour="library-shortcut"]',
    icon: 'book',
    eyebrow: 'Library',
    title: 'Everything you study lives here',
    text: 'Browse subjects and chapters, then choose learning mode or launch a quiz with independent filters.',
  },
  {
    route: Routes.dashboard,
    target: '[data-tour="quiz-shortcut"]',
    icon: 'clock',
    eyebrow: 'Quiz engine',
    title: 'Build the attempt you need',
    text: 'Use a standard or strict quiz, choose individual questions, run an unsaved test attempt, and review every saved result later.',
  },
  {
    route: Routes.dashboard,
    target: '[data-tour="global-search"]',
    icon: 'search',
    eyebrow: 'Global search',
    title: 'Find anything from anywhere',
    text: 'Search chapters, questions, answers, explanations, sources, and tags. Results take you to the exact highlighted question.',
    hint: 'Shortcut: ⌘⇧P on Mac or Ctrl⇧P elsewhere',
  },
  {
    route: Routes.dashboard,
    target: '[data-tour="memory-nudges"]',
    icon: 'sparkle',
    eyebrow: 'Memory Nudges',
    title: 'Bring back knowledge before it fades',
    text: 'Schedule private reminders, review due content, and control notification delivery separately on every signed-in device.',
  },
  {
    route: Routes.statistics,
    target: '[data-tour="statistics-overview"]',
    icon: 'chart',
    eyebrow: 'Statistics',
    title: 'Use analytics that guide action',
    text: 'Filter by time and chapter to inspect activity, accuracy, retention, weak categories, and question-level performance.',
  },
  {
    route: Routes.pdfReader,
    target: '[data-tour="pdf-reader"]',
    icon: 'monitor',
    eyebrow: 'Private PDF workspace',
    title: 'Read beside your revision',
    text: 'Open local PDFs without uploading them, use a focused reader, or keep the document beside learning and quiz content.',
  },
  {
    route: Routes.settings,
    target: '[data-tour="app-settings"]',
    icon: 'settings',
    eyebrow: 'Settings',
    title: 'Make the engine yours',
    text: 'Control appearance, device notifications, add-ons, data sync, hard refresh, and replay this guided tour whenever you need it.',
  },
];

function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return false; }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function rectFrom(element: HTMLElement): TargetRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
}

export function FirstVisitTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const tooltipRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(() => !hasSeenTour());
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(230);
  const current = STEPS[step];

  const finish = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* Closing must not depend on storage. */ }
    setOpen(false);
    setTargetRect(null);
  }, []);

  const changeStep = useCallback((next: number) => {
    setTargetRect(null);
    setStep(clamp(next, 0, STEPS.length - 1));
  }, []);

  useEffect(() => {
    const replay = () => {
      setTargetRect(null);
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(WELCOME_TOUR_EVENT, replay);
    return () => window.removeEventListener(WELCOME_TOUR_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight' && step < STEPS.length - 1) changeStep(step + 1);
      if (event.key === 'ArrowLeft' && step > 0) changeStep(step - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeStep, finish, open, step]);

  useEffect(() => {
    if (!open) return;
    if (location.pathname !== current.route) {
      navigate(current.route);
      return;
    }

    let cancelled = false;
    let timer = 0;
    let observer: ResizeObserver | undefined;
    let target: HTMLElement | null = null;

    const update = () => {
      if (!cancelled && target) setTargetRect(rectFrom(target));
    };
    const findTarget = (attempt = 0) => {
      if (cancelled) return;
      target = document.querySelector<HTMLElement>(current.target);
      const nextRect = target ? rectFrom(target) : null;
      if (!target || !nextRect) {
        if (attempt < 50) timer = window.setTimeout(() => findTarget(attempt + 1), 80);
        return;
      }
      setTargetRect(nextRect);
      target.scrollIntoView({ behavior: attempt === 0 ? 'smooth' : 'auto', block: 'center', inline: 'nearest' });
      timer = window.setTimeout(() => {
        update();
        observer = new ResizeObserver(update);
        if (target) observer.observe(target);
      }, 220);
    };

    findTarget();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [current.route, current.target, location.pathname, navigate, open]);

  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) return;
    setTooltipHeight(tooltipRef.current.offsetHeight);
  }, [current, open, targetRect]);

  useEffect(() => {
    if (!open || !targetRect) return;
    nextRef.current?.focus({ preventScroll: true });
  }, [open, step, targetRect]);

  if (!open) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.min(370, viewportWidth - 24);
  const canFitBelow = targetRect ? targetRect.bottom + TOOLTIP_GAP + tooltipHeight <= viewportHeight - 12 : false;
  const placeBelow = targetRect ? canFitBelow || targetRect.top < tooltipHeight + TOOLTIP_GAP + 12 : true;
  const tooltipTop = targetRect
    ? clamp(placeBelow ? targetRect.bottom + TOOLTIP_GAP : targetRect.top - TOOLTIP_GAP - tooltipHeight, 12, viewportHeight - tooltipHeight - 12)
    : clamp((viewportHeight - tooltipHeight) / 2, 12, viewportHeight - tooltipHeight - 12);
  const tooltipLeft = targetRect
    ? clamp(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, 12, viewportWidth - tooltipWidth - 12)
    : clamp((viewportWidth - tooltipWidth) / 2, 12, viewportWidth - tooltipWidth - 12);
  const pointerLeft = targetRect
    ? clamp(targetRect.left + targetRect.width / 2 - tooltipLeft, 28, tooltipWidth - 28)
    : tooltipWidth / 2;
  const tooltipStyle = {
    left: tooltipLeft,
    top: tooltipTop,
    width: tooltipWidth,
    '--tour-pointer-left': `${pointerLeft}px`,
  } as CSSProperties;
  const spotlightLeft = targetRect ? clamp(targetRect.left - TARGET_PADDING, 4, viewportWidth - 8) : 0;
  const spotlightTop = targetRect ? clamp(targetRect.top - TARGET_PADDING, 4, viewportHeight - 8) : 0;
  const spotlightStyle = targetRect ? {
    left: spotlightLeft,
    top: spotlightTop,
    width: Math.min(targetRect.width + TARGET_PADDING * 2, viewportWidth - spotlightLeft - 4),
    height: Math.min(targetRect.height + TARGET_PADDING * 2, viewportHeight - spotlightTop - 4),
  } : undefined;

  return (
    <div className={styles.root} aria-live="polite">
      {targetRect && <div className={styles.spotlight} style={spotlightStyle} aria-hidden="true" />}
      {!targetRect && <div className={styles.loadingShade} aria-hidden="true" />}
      <section
        ref={tooltipRef}
        className={`${styles.tooltip} ${placeBelow ? styles.below : styles.above}`}
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
      >
        {targetRect && <span className={styles.pointer} aria-hidden="true" />}
        <header>
          <span className={styles.stepIcon}><Icon name={current.icon} size={18} /></span>
          <div><small>{current.eyebrow}</small><span>{step + 1} of {STEPS.length}</span></div>
          <button type="button" className={styles.skip} onClick={finish}>Skip tour</button>
        </header>
        <div className={styles.copy}>
          <h2 id="guided-tour-title">{current.title}</h2>
          <p>{current.text}</p>
          {current.hint && <small className={styles.hint}><Icon name="search" size={13} />{current.hint}</small>}
        </div>
        <footer>
          <div className={styles.progress} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => <span key={item.target} className={index <= step ? styles.complete : ''} />)}
          </div>
          <div className={styles.actions}>
            {step > 0 && <Button variant="ghost" size="sm" onClick={() => changeStep(step - 1)}>Back</Button>}
            <Button ref={nextRef} variant="primary" size="sm" onClick={() => step === STEPS.length - 1 ? finish() : changeStep(step + 1)}>
              {step === STEPS.length - 1 ? 'Finish' : 'Next'}
              {step < STEPS.length - 1 && <Icon name="chevronRight" size={14} />}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
