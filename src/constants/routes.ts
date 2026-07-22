/** Central route table. Use the builders — never hard-code path strings. */
export const Routes = {
  dashboard: '/',
  search: '/search',
  chapter: (chapterId: string = ':chapterId') => `/chapter/${chapterId}`,
  quiz: (chapterId: string = ':chapterId') => `/chapter/${chapterId}/revise`,
  quizResult: (resultId: string = ':resultId') => `/results/${resultId}`,
  statistics: '/statistics',
  bookmarks: '/bookmarks',
  import: '/import',
  settings: '/settings',
} as const;
