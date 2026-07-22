import type { SVGProps } from 'react';

/**
 * A minimal, dependency-free icon set (24px grid, 1.5 stroke) drawn to match
 * the app's calm, line-based aesthetic. Add new glyphs here rather than pulling
 * in an icon library — it keeps the bundle lean and the style consistent.
 */
export const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5ZM18 3v18',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  settings: 'M4 7h8M16 7h4M4 17h4M12 17h8M14 4v6M10 14v6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  chevronRight: 'm9 6 6 6-6 6',
  arrowLeft: 'm12 19-7-7 7-7M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  check: 'm5 12 5 5L20 7',
  close: 'M6 6l12 12M18 6 6 18',
  sparkle: 'M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7.5V12l3 2',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1ZM14.5 6.5l3 3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z',
  flame: 'M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 8 10 5 12 3Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
