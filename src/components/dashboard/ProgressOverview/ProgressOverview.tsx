import { useEffect, useMemo, useState } from 'react';
import type { QuizResult } from '../../../types';
import { Icon } from '../../common';
import styles from './ProgressOverview.module.css';

type DayActivity = {
  date: Date;
  key: string;
  questions: number;
  quizzes: number;
  correct: number;
  answered: number;
};

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, count: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));

function activityMap(results: readonly QuizResult[]) {
  const map = new Map<string, Omit<DayActivity, 'date' | 'key'>>();
  results.forEach((result) => {
    if (result.includedInAnalytics === false || result.isDeleted === 1) return;
    const key = dayKey(new Date(result.takenAt));
    const current = map.get(key) ?? { questions: 0, quizzes: 0, correct: 0, answered: 0 };
    map.set(key, {
      questions: current.questions + result.totalQuestions,
      quizzes: current.quizzes + 1,
      correct: current.correct + result.correct,
      answered: current.answered + result.answered,
    });
  });
  return map;
}

function getDay(date: Date, map: ReturnType<typeof activityMap>): DayActivity {
  const key = dayKey(date);
  return { date, key, ...(map.get(key) ?? { questions: 0, quizzes: 0, correct: 0, answered: 0 }) };
}

function level(questions: number) {
  if (questions === 0) return 0;
  if (questions < 10) return 1;
  if (questions < 25) return 2;
  if (questions < 50) return 3;
  return 4;
}

function total(days: readonly DayActivity[]) {
  return days.reduce((sum, day) => sum + day.questions, 0);
}

/** Compact, reusable quiz-activity overview with an expandable calendar. */
export function ProgressOverview({ results, now = new Date() }: { results: readonly QuizResult[]; now?: Date }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const data = useMemo(() => activityMap(results), [results]);
  const today = startOfDay(now);
  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, index) => getDay(addDays(weekStart, index), data));
  const activeThisWeek = week.filter((day) => day.questions > 0).length;

  return (
    <>
      <section className={styles.hero} aria-labelledby="progress-overview-title">
        <div className={styles.heroCopy}>
          <div>
            <span className={styles.eyebrow}>Your learning pulse</span>
            <h1 id="progress-overview-title">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</h1>
          </div>
          <p><strong>{total(week)}</strong> questions this week <span>·</span> {activeThisWeek} active {activeThisWeek === 1 ? 'day' : 'days'}</p>
          <button type="button" className={styles.expandButton} onClick={() => setCalendarOpen(true)}>
            View progress <Icon name="chevronRight" size={14} />
          </button>
        </div>

        <button type="button" className={styles.week} onClick={() => setCalendarOpen(true)} aria-label="Open detailed activity calendar">
          {week.map((day) => {
            const isToday = day.key === dayKey(today);
            const isFuture = day.date.getTime() > today.getTime();
            const accuracy = day.answered ? Math.round((day.correct / day.answered) * 100) : 0;
            return (
              <span className={`${styles.day} ${isToday ? styles.today : ''}`} key={day.key}>
                <small>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day.date).slice(0, 2)}</small>
                <i className={`${styles.activity} ${styles[`level${level(day.questions)}`]} ${isFuture ? styles.future : ''}`}>
                  {day.questions > 0 && <b>{day.questions}</b>}
                </i>
                <strong>{day.date.getDate()}</strong>
                <em>{isToday ? 'Today' : day.questions > 0 ? `${accuracy}%` : ''}</em>
              </span>
            );
          })}
        </button>
      </section>
      {calendarOpen && <ActivityCalendar data={data} today={today} visibleMonth={visibleMonth} onMonthChange={setVisibleMonth} onClose={() => setCalendarOpen(false)} />}
    </>
  );
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{suffix}</small></div>;
}

function ActivityCalendar({ data, today, visibleMonth, onMonthChange, onClose }: {
  data: ReturnType<typeof activityMap>;
  today: Date;
  visibleMonth: Date;
  onMonthChange: (date: Date) => void;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState(today);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => getDay(addDays(gridStart, index), data));
  const visibleDays = days.filter((day) => day.date.getMonth() === visibleMonth.getMonth());
  const selectedDays = period === 'day'
    ? [getDay(selectedDate, data)]
    : period === 'week'
      ? Array.from({ length: 7 }, (_, index) => getDay(addDays(startOfWeek(selectedDate), index), data))
      : visibleDays;
  const selectedTotal = total(selectedDays);
  const activeDays = selectedDays.filter((day) => day.questions > 0).length;
  const periodLabel = period === 'day'
    ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(selectedDate)
    : period === 'week' ? 'this week' : 'this month';
  const canGoNext = visibleMonth.getFullYear() < today.getFullYear() || visibleMonth.getMonth() < today.getMonth();

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="activity-calendar-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Activity calendar</span><h2 id="activity-calendar-title">Your progress, at a glance</h2></div>
          <button type="button" onClick={onClose} aria-label="Close calendar"><Icon name="close" /></button>
        </header>
        <div className={styles.periodTabs} role="group" aria-label="Progress period">
          {(['day', 'week', 'month'] as const).map((item) => <button type="button" className={period === item ? styles.activePeriod : ''} onClick={() => setPeriod(item)} key={item}>{item === 'day' ? 'Daily' : item === 'week' ? 'Weekly' : 'Monthly'}</button>)}
        </div>
        <div className={styles.monthNav}>
          <button type="button" onClick={() => onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))} aria-label="Previous month"><Icon name="arrowLeft" size={17} /></button>
          <strong>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth)}</strong>
          <button type="button" disabled={!canGoNext} onClick={() => onMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))} aria-label="Next month"><Icon name="arrowLeft" size={17} /></button>
        </div>
        <div className={styles.monthStats}><Metric label="Questions" value={selectedTotal} suffix={periodLabel} /><Metric label="Active days" value={activeDays} suffix={`of ${selectedDays.length} days`} /></div>
        <div className={styles.calendar}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <span className={styles.weekday} key={name}>{name}</span>)}
          {days.map((day) => {
            const outside = day.date.getMonth() !== visibleMonth.getMonth();
            const accuracy = day.answered ? Math.round((day.correct / day.answered) * 100) : 0;
            const label = day.questions
              ? `${day.questions} questions · ${day.quizzes} ${day.quizzes === 1 ? 'quiz' : 'quizzes'} · ${accuracy}% accuracy`
              : 'No quiz activity';
            const selectDay = () => {
              setSelectedDate(day.date);
              setPeriod('day');
              if (outside) onMonthChange(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
            };
            return <button type="button" onClick={selectDay} aria-label={`${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(day.date)}: ${label}`} className={`${styles.calendarDay} ${styles[`level${level(day.questions)}`]} ${outside ? styles.outside : ''} ${day.key === dayKey(today) ? styles.calendarToday : ''} ${day.key === dayKey(selectedDate) ? styles.selectedDay : ''}`} key={day.key}><span>{day.date.getDate()}</span>{day.questions > 0 && <><strong>{day.questions}</strong><small>questions</small></>}<i className={styles.dayTooltip}><b>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(day.date)}</b><em>{label}</em><u>Click for daily view</u></i></button>;
          })}
        </div>
        <footer><div className={styles.legend}><span>Less</span>{[0, 1, 2, 3, 4].map((item) => <i key={item} className={styles[`level${item}`]} />)}<span>More questions</span></div><small>Color intensity is based on total quiz questions completed each day.</small></footer>
      </section>
    </div>
  );
}
