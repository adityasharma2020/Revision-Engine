import { getSupabase } from '../supabase/client';
import type { PdfInkAnnotation } from './PdfAnnotationStore';

const BUCKET = 'user-pdfs';
export const PDF_SOFT_LIMIT_BYTES = 10 * 1024 * 1024;

export interface CloudPdfRecord {
  readonly id: string; readonly name: string; readonly storagePath?: string; readonly sourceUrl?: string;
  readonly sizeBytes: number; readonly linkedChapterIds: readonly string[];
  readonly annotations: readonly PdfInkAnnotation[]; readonly revision: number; readonly updatedAt: string;
}

type CloudRow = { id: string; name: string; storage_path: string | null; source_url: string | null; size_bytes: number; linked_chapter_ids: unknown; annotations: unknown; revision: number; updated_at: string };
const mapRow = (row: CloudRow): CloudPdfRecord => ({ id: row.id, name: row.name, storagePath: row.storage_path ?? undefined, sourceUrl: row.source_url ?? undefined, sizeBytes: Number(row.size_bytes), linkedChapterIds: Array.isArray(row.linked_chapter_ids) ? row.linked_chapter_ids.filter((id): id is string => typeof id === 'string') : [], annotations: Array.isArray(row.annotations) ? row.annotations as PdfInkAnnotation[] : [], revision: Number(row.revision), updatedAt: row.updated_at });
const COLUMNS = 'id,name,storage_path,source_url,size_bytes,linked_chapter_ids,annotations,revision,updated_at';
const LEGACY_COLUMNS = 'id,name,storage_path,size_bytes,linked_chapter_ids,annotations,revision,updated_at';
const client = () => { const value = getSupabase(); if (!value) throw new Error('Cloud sync is not configured.'); return value; };

export class PdfCloudConflictError extends Error { constructor() { super('Another device saved this PDF first. Your work is safe locally and was not uploaded; reopen the cloud copy to compare.'); } }

export async function listCloudPdfs(): Promise<CloudPdfRecord[]> {
  const current = await client().from('user_pdfs').select(COLUMNS).order('updated_at', { ascending: false });
  if (!current.error) return (current.data as CloudRow[]).map(mapRow);
  // Keep previously uploaded files usable while migration 0015 is pending.
  // Only the new public-URL feature requires the new source_url column.
  const message = current.error.message.toLocaleLowerCase();
  if (!message.includes('source_url')) throw current.error;
  const legacy = await client().from('user_pdfs').select(LEGACY_COLUMNS).order('updated_at', { ascending: false });
  if (legacy.error) throw legacy.error;
  return (legacy.data as Omit<CloudRow, 'source_url'>[]).map((row) => mapRow({ ...row, source_url: null }));
}

export async function downloadCloudPdf(record: CloudPdfRecord): Promise<Blob> {
  if (!record.storagePath) throw new Error('This cloud entry is a public PDF link and has no stored file.');
  const { data, error } = await client().storage.from(BUCKET).download(record.storagePath);
  if (error) throw error;
  await assertPdfBlob(data, `The cloud file “${record.name}”`);
  return data.type === 'application/pdf' ? data : data.slice(0, data.size, 'application/pdf');
}

async function assertPdfBlob(blob: Blob, label: string): Promise<void> {
  if (!blob.size) throw new Error(`${label} is empty. Upload the PDF again.`);
  // A PDF header is normally first, but ISO 32000 permits leading bytes. Scan
  // a small prefix instead of trusting a browser/server supplied MIME type.
  const prefix = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1024)).arrayBuffer());
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const valid = prefix.some((_, start) => signature.every((byte, offset) => prefix[start + offset] === byte));
  if (!valid) throw new Error(`${label} does not contain valid PDF data. Upload the original PDF again.`);
}

export async function uploadCloudPdf(userId: string, id: string, name: string, blob: Blob, linkedChapterIds: readonly string[]): Promise<CloudPdfRecord> {
  await assertPdfBlob(blob, `The selected file “${name}”`);
  const path = `${userId}/${id}/v1.pdf`;
  const storage = client().storage.from(BUCKET);
  const uploaded = await storage.upload(path, blob, { contentType: 'application/pdf', upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await client().from('user_pdfs').insert({ id, user_id: userId, name, storage_path: path, size_bytes: blob.size, linked_chapter_ids: linkedChapterIds, annotations: [], revision: 1 }).select(LEGACY_COLUMNS).single();
  if (inserted.error) { await storage.remove([path]); throw inserted.error; }
  return mapRow({ ...(inserted.data as Omit<CloudRow, 'source_url'>), source_url: null });
}

export async function syncCloudPdfUrl(userId: string, id: string, name: string, sourceUrl: string, linkedChapterIds: readonly string[]): Promise<CloudPdfRecord> {
  const saved = await client().from('user_pdfs').upsert({ id, user_id: userId, name, source_url: sourceUrl, storage_path: null, size_bytes: 0, linked_chapter_ids: linkedChapterIds, annotations: [], revision: 1 }, { onConflict: 'id' }).select(COLUMNS).single();
  if (saved.error) {
    if (saved.error.message.toLocaleLowerCase().includes('source_url')) throw new Error('Public PDF link sync needs Supabase migration 0015_cloud_pdf_urls.sql. Existing uploaded PDFs are unaffected.');
    throw saved.error;
  }
  return mapRow(saved.data as CloudRow);
}

export async function updateCloudAnnotations(record: CloudPdfRecord, annotations: readonly PdfInkAnnotation[], linkedChapterIds: readonly string[]): Promise<CloudPdfRecord> {
  const promoted = await client().rpc('update_user_pdf_annotations', { p_id: record.id, p_expected_revision: record.revision, p_annotations: annotations, p_linked_chapter_ids: linkedChapterIds });
  if (promoted.error) { if (promoted.error.message.includes('PDF_VERSION_CONFLICT')) throw new PdfCloudConflictError(); throw promoted.error; }
  return mapRow(promoted.data as CloudRow);
}
