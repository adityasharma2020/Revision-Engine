/** Theme is either explicitly chosen, or follows the OS. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The concrete theme actually applied to the DOM (never 'system'). */
export type ResolvedTheme = 'light' | 'dark';
