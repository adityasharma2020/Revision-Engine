import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createChapterService, ChapterService } from '../services/parser';

/**
 * Dependency-injection seam for stateless app services.
 *
 * Storage is intentionally NOT here — it depends on auth state and lives in
 * StorageContext. This context holds the shared public-chapter loader.
 */
export interface Services {
  readonly chapters: ChapterService;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  children,
  services,
}: {
  children: ReactNode;
  services?: Services;
}) {
  const value = useMemo<Services>(
    () => services ?? { chapters: createChapterService() },
    [services],
  );

  return (
    <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error('useServices must be used within a <ServicesProvider>');
  }
  return ctx;
}
