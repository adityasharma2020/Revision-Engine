import { useEffect, useState } from 'react';
import { Button } from '../Button';
import { Icon, type IconName } from '../Icon';
import { WELCOME_TOUR_EVENT } from './tourEvents';
import styles from './FirstVisitTour.module.css';

const TOUR_KEY = 'revision-engine:welcome-tour:v1';
const STEPS: ReadonlyArray<{ eyebrow: string; title: string; text: string; features: ReadonlyArray<{ icon: IconName; title: string; text: string }> }> = [
  {
    eyebrow: 'Quiz + revision engine', title: 'Practice any question bank—and remember what you learn.', text: 'Use it for any subject or exam. Take focused quizzes, revise at the right time and track what is improving.',
    features: [
      { icon: 'book', title: 'Organise', text: 'Subjects, chapters and questions' },
      { icon: 'clock', title: 'Practise', text: 'Focused and timed quizzes' },
      { icon: 'target', title: 'Remember', text: 'Smart, scheduled revision' },
    ],
  },
  {
    eyebrow: 'Quiz your way', title: 'Build the exact quiz you need.', text: 'Choose the questions, source and pace. Start simply or customise the session when you need more control.',
    features: [
      { icon: 'settings', title: 'Choose', text: 'Filter or pick questions' },
      { icon: 'clock', title: 'Attempt', text: 'Standard, strict or timed' },
      { icon: 'check', title: 'Review', text: 'Answers, mistakes and results' },
    ],
  },
  {
    eyebrow: 'The revision engine', title: 'A smart daily quiz, built around what you may forget.', text: 'Questions move through a seven-stage revision cycle. Correct answers return later; wrong, skipped and due questions return sooner.',
    features: [
      { icon: 'clock', title: 'Revision cycles', text: 'Seven expanding recall intervals' },
      { icon: 'target', title: 'Smart recommendations', text: 'Due and weak questions first' },
      { icon: 'chart', title: 'Daily feedback', text: 'Results improve the next queue' },
    ],
  },
];

function hasSeenTour(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === 'done'; } catch { return false; }
}

export function FirstVisitTour() {
  const [open, setOpen] = useState(() => !hasSeenTour());
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const finish = () => {
    try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* Closing must not depend on storage. */ }
    setOpen(false);
  };

  useEffect(() => {
    const replay = () => { setStep(0); setOpen(true); };
    window.addEventListener(WELCOME_TOUR_EVENT, replay);
    return () => window.removeEventListener(WELCOME_TOUR_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight' && step < STEPS.length - 1) setStep((value) => value + 1);
      if (event.key === 'ArrowLeft' && step > 0) setStep((value) => value - 1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [open, step]);

  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="welcome-tour-title">
        <header><div className={styles.identity}><span className={styles.brand}><Icon name="sparkle" size={20} /></span><span><strong>Revision Engine</strong><small>Quick product tour</small><small className={styles.credit}>Made with <Icon name="heart" size={11} /> by Aditya Sharma.</small></span></div><button type="button" onClick={finish}>Skip</button></header>
        <div className={styles.copy}><span className={styles.eyebrow}>{current.eyebrow}</span><h2 id="welcome-tour-title">{current.title}</h2><p>{current.text}</p></div>
        <div className={styles.features}>{current.features.map((feature) => (
          <article key={feature.title}><span><Icon name={feature.icon} size={19} /></span><div><strong>{feature.title}</strong><small>{feature.text}</small></div></article>
        ))}</div>
        <footer>
          <div className={styles.progressWrap}><small>{step + 1} / {STEPS.length}</small><div className={styles.progress} aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((item, index) => <span key={item.eyebrow} className={index === step ? styles.current : ''} />)}</div></div>
          <div className={styles.actions}>{step > 0 && <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button>}<Button variant="primary" onClick={() => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1)}>{step === STEPS.length - 1 ? 'Start exploring' : 'Next'}</Button></div>
        </footer>
      </section>
    </div>
  );
}
