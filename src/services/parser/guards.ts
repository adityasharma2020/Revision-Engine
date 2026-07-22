/**
 * Tiny, dependency-free validation primitives.
 *
 * We validate hand-authored JSON at load time so the UI can treat every parsed
 * `Chapter` as fully trustworthy. Each helper throws a `ChapterParseError` with
 * a precise path, making malformed files easy to fix.
 */
import { ChapterParseError } from './errors';

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, path: string): Json {
  if (!isObject(value)) {
    throw new ChapterParseError(`Expected an object`, path);
  }
  return value;
}

export function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ChapterParseError(`Expected an array`, path);
  }
  return value;
}

export function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ChapterParseError(`Expected a non-empty string`, path);
  }
  return value;
}

export function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, path);
}

export function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ChapterParseError(`Expected a number`, path);
  }
  return value;
}

export function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireNumber(value, path);
}

export function optionalStringArray(
  value: unknown,
  path: string,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return requireArray(value, path).map((item, i) =>
    requireString(item, `${path}[${i}]`),
  );
}

export function optionalEnum<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (!allowed.includes(value as T)) {
    throw new ChapterParseError(
      `Expected one of: ${allowed.join(', ')}`,
      path,
    );
  }
  return value as T;
}
