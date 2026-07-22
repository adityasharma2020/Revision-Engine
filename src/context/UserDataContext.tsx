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
import { useStorage } from './StorageContext';
import type {
  AnnotationMap,
  Chapter,
  ProgressMap,
  QuestionAnnotation,
  QuestionAttempt,
  QuestionAttemptList,
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
  questionAttemptLog: QuestionAttemptList;
  userChapters: Chapter[];

  getAnnotation: (chapterId: string, questionId: string) => QuestionAnnotation | undefined;
  toggleBookmark: (chapterId: string, questionId: string, type: QuestionType) => void;
  setNote: (chapterId: string, questionId: string, type: QuestionType, note: string) => void;
  addTag: (chapterId: string, questionId: string, type: QuestionType, tag: string) => void;
  removeTag: (chapterId: string, questionId: string, type: QuestionType, tag: string) => void;

  recordAttempt: (attempt: QuestionAttempt) => void;
  recordQuizResult: (result: QuizResult) => void;
  setQuizResultAnalytics: (resultId: string, included: boolean) => void;
  deleteQuizResult: (resultId: string) => void;

  addUserChapter: (chapter: Chapter) => void;
  removeUserChapter: (chapterId: string) => void;
}

const UserDataContext = createContext<UserDataValue | null>(null);

/**
 * Loads all user-generated data once, keeps it in memory for instant reactive
 * UI, and writes every mutation back through StorageService. This is the seam
 * that becomes cloud-synced: swap the storage backend, this stays identical.
 */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { storage } = useStorage();
  const [ready, setReady] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});
  const [progress, setProgress] = useState<ProgressMap>({});
  const [quizResults, setQuizResults] = useState<QuizResultList>([]);
  const [questionAttemptLog, setQuestionAttemptLog] = useState<QuestionAttemptList>([]);
  const [userChapters, setUserChapters] = useState<Chapter[]>([]);

  // Keep latest refs so persistence helpers never read stale closures.
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  useEffect(() => {
    let active = true;
    Promise.all([
      storage.loadAnnotations(),
      storage.loadProgress(),
      storage.loadQuizResults(),
      storage.loadQuestionAttemptLog(),
      storage.loadUserChapters(),
    ]).then(([a, p, q, attemptLog, uc]) => {
      if (!active) return;
      setAnnotations(a);
      setProgress(p);
      setQuizResults(q);
      setQuestionAttemptLog(attemptLog);
      setUserChapters(uc);
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
      setQuestionAttemptLog((previous) => {
        const next = [...previous, attempt];
        void storage.saveQuestionAttemptLog(next);
        return next;
      });
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

  const setQuizResultAnalytics = useCallback(
    (resultId: string, included: boolean) => {
      setQuizResults((prev) => {
        const next = prev.map((result) =>
          result.id === resultId ? { ...result, includedInAnalytics: included } : result,
        );
        void storage.saveQuizResults(next);
        return next;
      });
    },
    [storage],
  );

  const deleteQuizResult = useCallback((resultId: string) => {
    setQuizResults((prev) => {
      const next = prev.map((result) => result.id === resultId
        ? { ...result, isDeleted: 1 as const, deletedAt: Date.now(), includedInAnalytics: false }
        : result);
      void storage.saveQuizResults(next);
      return next;
    });
  }, [storage]);

  const addUserChapter = useCallback(
    (chapter: Chapter) => {
      setUserChapters((prev) => {
        const next = [chapter, ...prev.filter((c) => c.id !== chapter.id)];
        void storage.saveUserChapters(next);
        return next;
      });
    },
    [storage],
  );

  const removeUserChapter = useCallback(
    (chapterId: string) => {
      setUserChapters((prev) => {
        const next = prev.filter((c) => c.id !== chapterId);
        void storage.saveUserChapters(next);
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
      quizResults: quizResults.filter((result) => result.isDeleted !== 1),
      questionAttemptLog,
      userChapters,
      getAnnotation,
      toggleBookmark,
      setNote,
      addTag,
      removeTag,
      recordAttempt,
      recordQuizResult,
      setQuizResultAnalytics,
      deleteQuizResult,
      addUserChapter,
      removeUserChapter,
    }),
    [
      ready,
      annotations,
      progress,
      quizResults,
      questionAttemptLog,
      userChapters,
      getAnnotation,
      toggleBookmark,
      setNote,
      addTag,
      removeTag,
      recordAttempt,
      recordQuizResult,
      setQuizResultAnalytics,
      deleteQuizResult,
      addUserChapter,
      removeUserChapter,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error('useUserData must be used within a <UserDataProvider>');
  return ctx;
}
