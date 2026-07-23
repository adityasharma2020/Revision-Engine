/** Central route table. Use the builders — never hard-code path strings. */
export const Routes = {
  dashboard: '/',
  library: '/library',
  search: '/search',
  chapter: (chapterId: string = ':chapterId') => `/chapter/${chapterId}`,
  quizSession: (quizId: string = ':quizId') => `/quiz/${quizId}`,
  activeQuiz: (quizId: string) => `/quiz/${quizId}`,
  quizResult: (resultId: string = ':resultId') => `/results/${resultId}`,
  sharedQuizResult: (shareToken: string = ':shareToken') => `/shared/${shareToken}`,
  statistics: '/statistics',
  bookmarks: '/bookmarks',
  revision: '/revision',
  import: '/import',
  settings: '/settings',
  nudges: '/nudges',
} as const;
