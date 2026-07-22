/** Central route table. Use the builders — never hard-code path strings. */
export const Routes = {
  dashboard: '/',
  chapter: (chapterId: string = ':chapterId') => `/chapter/${chapterId}`,
  quiz: (chapterId: string = ':chapterId') => `/chapter/${chapterId}/revise`,
  statistics: '/statistics',
  bookmarks: '/bookmarks',
  import: '/import',
  settings: '/settings',
} as const;
