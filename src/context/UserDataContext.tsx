import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useServices } from './ServicesContext';
import type {
  AnnotationMap,
  ProgressMap,
  QuestionAnnotation,
  QuestionAttempt,
  QuestionType,
  QuizResult,
  QuizResultList,
} from '../types';
import {
  annotationKey,
  emptyAnnotation,
  isBlankAnnotation,
} from '../utils/annotations';

interface UserDataValue {
  ready: boolean;
  annotations: AnnotationMap;
  progress: ProgressMap;
  quizResults: QuizResultList;

  getAnnotation: (chapterId: string, questionId: string) => QuestionAnnotation | undefined;
  toggleBookmark: (chapterId: string, questionId: string, type: QuestionType) => void;
  setNote: (chapterId: string, questionId: string, type: QuestionType, note: string) => void;
  addTag: (chapterId: string, questionId: string, type: QuestionType, tag: string) => void;
  removeTag: (chapterId: string, questionId: string, type: QuestionType, tag: string) => void;

  recordAttempt: (attempt: QuestionAttempt) => void;
  recordQuizResult: (result: QuizResult) => void;
}

const UserDataContext = createContext<UserDataValue | null>(null);

/**
 * Loads all user-generated data once, keeps it in memory for instant reactive
 * UI, and writes every mutation back through StorageService. This is the seam
 * that becomes cloud-synced: swap the storage backend, this stays identical.
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { storage } = useServices();
  const [ready, setReady] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});
  const [progress, setProgress] = useState<ProgressMap>({});
  const [quizResults, setQuizResults] = useState<QuizResultList>([]);

  // Keep latest refs so persistence helpers never read stale closures.
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  useEffect(() => {
    let active = true;
    Promise.all([
      storage.loadAnnotations(),
      storage.loadProgress(),
      storage.loadQuizResults(),
    ]).then(([a, p, q]) => {
      if (!active) return;
      setAnnotations(a);
      setProgress(p);
      setQuizResults(q);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [storage]);

  const mutateAnnotation = useCallback(
    (
      chapterId: string,
      questionId: string,
      type: QuestionType,
      patch: (current: QuestionAnnotation) => QuestionAnnotation,
    ) => {
      const key = annotationKey(chapterId, questionId);
      const current = annotationsRef.current[key] ?? emptyAnnotation(chapterId, questionId, type);
      const updated = { ...patch(current), updatedAt: Date.now() };

      const next = { ...annotationsRef.current };
      if (isBlankAnnotation(updated)) delete next[key];
      else next[key] = updated;

      setAnnotations(next);
      void storage.saveAnnotations(next);
    },
    [storage],
  );

  const getAnnotation = useCallback(
    (chapterId: string, questionId: string) =>
      annotations[annotationKey(chapterId, questionId)],
    [annotations],
  );

  const toggleBookmark = useCallback(
    (chapterId: string, questionId: string, type: QuestionType) =>
      mutateAnnotation(chapterId, questionId, type, (c) => ({
        ...c,
        bookmarked: !c.bookmarked,
      })),
    [mutateAnnotation],
  );

  const setNote = useCallback(
    (chapterId: string, questionId: string, type: QuestionType, note: string) =>
      mutateAnnotation(chapterId, questionId, type, (c) => ({ ...c, note })),
    [mutateAnnotation],
  );

  const addTag = useCallback(
    (chapterId: string, questionId: string, type: QuestionType, tag: string) => {
      const clean = tag.trim().toLowerCase();
      if (!clean) return;
      mutateAnnotation(chapterId, questionId, type, (c) =>
        c.tags.includes(clean) ? c : { ...c, tags: [...c.tags, clean] },
      );
    },
    [mutateAnnotation],
  );

  const removeTag = useCallback(
    (chapterId: string, questionId: string, type: QuestionType, tag: string) =>
      mutateAnnotation(chapterId, questionId, type, (c) => ({
        ...c,
        tags: c.tags.filter((t) => t !== tag),
      })),
    [mutateAnnotation],
  );

  const recordAttempt = useCallback(
    (attempt: QuestionAttempt) => {
      setProgress((prev) => {
        const chapter = prev[attempt.chapterId] ?? {
          chapterId: attempt.chapterId,
          attempts: {},
          lastVisitedAt: attempt.attemptedAt,
        };
        const next: ProgressMap = {
          ...prev,
          [attempt.chapterId]: {
            ...chapter,
            attempts: { ...chapter.attempts, [attempt.questionId]: attempt },
            lastVisitedAt: attempt.attemptedAt,
          },
        };
        void storage.saveProgress(next);
        return next;
      });
    },
    [storage],
  );

  const recordQuizResult = useCallback(
    (result: QuizResult) => {
      setQuizResults((prev) => {
        const next = [result, ...prev];
        void storage.saveQuizResults(next);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo<UserDataValue>(
    () => ({
      ready,
      annotations,
      progress,
      quizResults,
      getAnnotation,
      toggleBookmark,
      setNote,
      addTag,
      removeTag,
      recordAttempt,
      recordQuizResult,
    }),
    [
      ready,
      annotations,
      progress,
      quizResults,
      getAnnotation,
      toggleBookmark,
      setNote,
      addTag,
      removeTag,
      recordAttempt,
      recordQuizResult,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error('useUserData must be used within a <UserDataProvider>');
  return ctx;
}
