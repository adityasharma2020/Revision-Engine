import { getSupabase } from '../supabase/client';
import type { PdfInkAnnotation } from './PdfAnnotationStore';

const BUCKET = 'user-pdfs';
export const PDF_SOFT_LIMIT_BYTES = 10 * 1024 * 1024;

export interface CloudPdfRecord {
  readonly id: string; readonly name: string; readonly storagePath: string;
  readonly sizeBytes: number; readonly linkedChapterIds: readonly string[];
  readonly annotations: readonly PdfInkAnnotation[]; readonly revision: number; readonly updatedAt: string;
}

type CloudRow = { id: string; name: string; storage_path: string; size_bytes: number; linked_chapter_ids: unknown; annotations: unknown; revision: number; updated_at: string };
const mapRow = (row: CloudRow): CloudPdfRecord => ({ id: row.id, name: row.name, storagePath: row.storage_path, sizeBytes: Number(row.size_bytes), linkedChapterIds: Array.isArray(row.linked_chapter_ids) ? row.linked_chapter_ids.filter((id): id is string => typeof id === 'string') : [], annotations: Array.isArray(row.annotations) ? row.annotations as PdfInkAnnotation[] : [], revision: Number(row.revision), updatedAt: row.updated_at });
const client = () => { const value = getSupabase(); if (!value) throw new Error('Cloud sync is not configured.'); return value; };

export class PdfCloudConflictError extends Error { constructor() { super('Another device saved this PDF first. Your work is safe locally and was not uploaded; reopen the cloud copy to compare.'); } }

export async function listCloudPdfs(): Promise<CloudPdfRecord[]> {
  const { data, error } = await client().from('user_pdfs').select('id,name,storage_path,size_bytes,linked_chapter_ids,annotations,revision,updated_at').order('updated_at', { ascending: false });
  if (error) throw error; return (data as CloudRow[]).map(mapRow);
}

export async function downloadCloudPdf(record: CloudPdfRecord): Promise<Blob> {
  const { data, error } = await client().storage.from(BUCKET).download(record.storagePath);
  if (error) throw error; return data;
}

export async function uploadCloudPdf(userId: string, id: string, name: string, blob: Blob, linkedChapterIds: readonly string[]): Promise<CloudPdfRecord> {
  const path = `${userId}/${id}/v1.pdf`;
  const storage = client().storage.from(BUCKET);
  const uploaded = await storage.upload(path, blob, { contentType: 'application/pdf', upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await client().from('user_pdfs').insert({ id, user_id: userId, name, storage_path: path, size_bytes: blob.size, linked_chapter_ids: linkedChapterIds, annotations: [], revision: 1 }).select('id,name,storage_path,size_bytes,linked_chapter_ids,annotations,revision,updated_at').single();
  if (inserted.error) { await storage.remove([path]); throw inserted.error; }
  return mapRow(inserted.data as CloudRow);
}

export async function updateCloudAnnotations(record: CloudPdfRecord, annotations: readonly PdfInkAnnotation[], linkedChapterIds: readonly string[]): Promise<CloudPdfRecord> {
  const promoted = await client().rpc('update_user_pdf_annotations', { p_id: record.id, p_expected_revision: record.revision, p_annotations: annotations, p_linked_chapter_ids: linkedChapterIds });
  if (promoted.error) { if (promoted.error.message.includes('PDF_VERSION_CONFLICT')) throw new PdfCloudConflictError(); throw promoted.error; }
  return mapRow(promoted.data as CloudRow);
}
