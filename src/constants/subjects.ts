/**
 * Known UPSC subjects with an accent hue, used purely for visual grouping
 * (chapter cards, filters). Subjects are NOT limited to this list — any string
 * in the JSON is valid; unknown subjects fall back to a neutral hue.
 */
export interface SubjectStyle {
  readonly label: string;
  /** HSL hue (0–360) used to tint the subject's accent chip. */
  readonly hue: number;
}

export const SUBJECT_STYLES: Record<string, SubjectStyle> = {
  history: { label: 'History', hue: 25 },
  polity: { label: 'Polity', hue: 265 },
  economy: { label: 'Economy', hue: 150 },
  geography: { label: 'Geography', hue: 200 },
  environment: { label: 'Environment', hue: 130 },
  science: { label: 'Science & Tech', hue: 220 },
  'current-affairs': { label: 'Current Affairs', hue: 340 },
  ethics: { label: 'Ethics', hue: 45 },
};

const FALLBACK_HUE = 240;

export function subjectStyle(subject: string): SubjectStyle {
  const key = subject.trim().toLowerCase().replace(/\s+/g, '-');
  return SUBJECT_STYLES[key] ?? { label: subject, hue: FALLBACK_HUE };
}
