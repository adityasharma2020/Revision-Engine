/** Central route table. Use the builders — never hard-code path strings. */
export const Routes = {
  dashboard: '/',
  library: '/library',
  search: '/search',
  chapter: (chapterId: string = ':chapterId') => `/chapter/${chapterId}`,
  chapterEdit: (
    chapterId: string = ':chapterId',
    type?: 'prelims' | 'mains',
    questionId?: string,
  ) => `/chapter/${chapterId}/edit${type && questionId
    ? `?type=${type}&question=${encodeURIComponent(questionId)}`
    : ''}`,
  quizSession: (quizId: string = ':quizId') => `/quiz/${quizId}`,
  activeQuiz: (quizId: string) => `/quiz/${quizId}`,
  quizResult: (resultId: string = ':resultId') => `/results/${resultId}`,
  sharedQuizResult: (shareToken: string = ':shareToken') => `/shared/${shareToken}`,
  statistics: '/statistics',
  bookmarks: '/bookmarks',
  pdfReader: '/pdf-reader',
  revision: '/revision',
  import: '/import',
  settings: '/settings',
  nudges: '/nudges',
} as const;
