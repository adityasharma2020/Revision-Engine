/**
 * Small durable store for an in-progress quiz. localStorage keeps recovery
 * available after route changes, reloads and in another tab; sessionStorage is
 * retained as a fallback and migration source for older drafts.
 */
export function readQuizRecoveryItem(key: string): string | null {
  try {
    const durable = localStorage.getItem(key);
    if (durable !== null) return durable;
  } catch {
    // Fall through to the per-tab store in restricted browser contexts.
  }
  try {
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) writeQuizRecoveryItem(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function writeQuizRecoveryItem(key: string, value: string): void {
  let durable = false;
  try {
    localStorage.setItem(key, value);
    durable = true;
  } catch {
    // Use sessionStorage below when durable storage is unavailable.
  }
  try {
    if (durable) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // The live React state remains usable even if browser storage is blocked.
  }
}

export function removeQuizRecoveryItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Continue and clear any per-tab copy.
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

export function listQuizRecoveryKeys(prefix: string): string[] {
  const keys = new Set<string>();
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const store = globalThis[name];
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key?.startsWith(prefix)) keys.add(key);
      }
    } catch {
      // Continue with whichever storage area remains available.
    }
  }
  return [...keys];
}
