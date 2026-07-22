/** Central route table. Use the builders — never hard-code path strings. */
export const Routes = {
  dashboard: '/',
  library: '/library',
  search: '/search',
  chapter: (chapterId: string = ':chapterId') => `/chapter/${chapterId}`,
  quiz: (chapterId: string = ':chapterId') => `/chapter/${chapterId}?mode=quiz`,
  quizResult: (resultId: string = ':resultId') => `/results/${resultId}`,
  sharedQuizResult: (shareToken: string = ':shareToken') => `/shared/${shareToken}`,
  statistics: '/statistics',
  bookmarks: '/bookmarks',
  import: '/import',
  settings: '/settings',
} as const;
