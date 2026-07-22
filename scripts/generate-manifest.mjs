#!/usr/bin/env node
/**
 * Generates public/chapters/manifest.json by scanning every *.json chapter in
 * that directory. Runs automatically before `dev` and `build` (see package.json
 * predev/prebuild), so adding a chapter file is the only step required to make
 * it appear in the app — no code or config changes.
 *
 * The manifest holds lightweight summaries only; full question arrays stay in
 * the individual files and are fetched lazily at runtime.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAPTERS_DIR = join(__dirname, '..', 'public', 'chapters');
const MANIFEST_PATH = join(CHAPTERS_DIR, 'manifest.json');
const MANIFEST_FILE = 'manifest.json';

const REQUIRED = ['id', 'subject', 'title', 'chapterNumber'];

/** @param {Record<string, unknown>} data @param {string} file */
function toSummary(data, file) {
  for (const key of REQUIRED) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      throw new Error(`missing required field "${key}"`);
    }
  }
  return {
    id: data.id,
    subject: data.subject,
    title: data.title,
    chapterNumber: data.chapterNumber,
    source: data.source,
    description: data.description,
    tags: data.tags,
    file,
    prelimsCount: Array.isArray(data.prelims) ? data.prelims.length : 0,
    mainsCount: Array.isArray(data.mains) ? data.mains.length : 0,
  };
}

async function main() {
  let files;
  try {
    files = (await readdir(CHAPTERS_DIR)).filter(
      (f) => f.endsWith('.json') && f !== MANIFEST_FILE,
    );
  } catch {
    console.warn('[manifest] no chapters directory yet — writing empty manifest');
    files = [];
  }

  const summaries = [];
  const seen = new Set();
  for (const file of files.sort()) {
    const raw = await readFile(join(CHAPTERS_DIR, file), 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`[manifest] ${file}: invalid JSON — ${err.message}`);
    }
    let summary;
    try {
      summary = toSummary(data, file);
    } catch (err) {
      throw new Error(`[manifest] ${file}: ${err.message}`);
    }
    if (seen.has(summary.id)) {
      throw new Error(`[manifest] duplicate chapter id "${summary.id}" in ${file}`);
    }
    seen.add(summary.id);
    summaries.push(summary);
  }

  summaries.sort(
    (a, b) =>
      String(a.subject).localeCompare(String(b.subject)) ||
      a.chapterNumber - b.chapterNumber,
  );

  const manifest = { generatedAt: new Date().toISOString(), chapters: summaries };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[manifest] indexed ${summaries.length} chapter(s) → ${MANIFEST_FILE}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
