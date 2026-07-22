import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createStorageService, type StorageService } from '../services/storage';
import { createChapterService, ChapterService } from '../services/parser';

/**
 * Dependency-injection seam for app services.
 *
 * Components consume services through this context rather than importing
 * singletons, which keeps them decoupled from concrete implementations and
 * trivial to test (swap in fakes at the provider). It is also where the cloud
 * migration lands: change what `createStorageService()` returns, nothing else.
 */
export interface Services {
  readonly storage: StorageService;
  readonly chapters: ChapterService;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  children,
  services,
}: {
  children: ReactNode;
  /** Override for tests/storybook; defaults to the real service stack. */
  services?: Services;
}) {
  const value = useMemo<Services>(
    () =>
      services ?? {
        storage: createStorageService(),
        chapters: createChapterService(),
      },
    [services],
  );

  return (
    <ServicesContext.Provider value={value}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error('useServices must be used within a <ServicesProvider>');
  }
  return ctx;
}
