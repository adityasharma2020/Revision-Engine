import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { useAuth } from '../../context/AuthContext';
import { createNudge, getNudge, listNudges, recordNudgeFeedback, recordNudgeOpen, setNudgeActive, updateNudge } from '../../services/nudges';
import type { MemoryNudge, NudgeKind } from '../../types';
import styles from './Nudges.module.css';

const KINDS: NudgeKind[] = ['fact', 'data', 'quote', 'definition', 'mistake', 'reminder'];
const blank = { kind: 'fact' as NudgeKind, title: '', content: '', context: '', source: '', sourceUrl: '', tags: [] as string[], priority: 3, cooldownHours: 24 };
type EditorValue = typeof blank;

export function Nudges() {
  const { status } = useAuth();
  const [params, setParams] = useSearchParams();
  const [nudges, setNudges] = useState<MemoryNudge[]>([]);
  const [selected, setSelected] = useState<MemoryNudge | null>(null);
  const [editing, setEditing] = useState<MemoryNudge | 'new' | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const refresh = async () => { setLoading(true); try { setNudges(await listNudges()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load nudges.'); } finally { setLoading(false); } };
  useEffect(() => { if (status === 'authenticated') void refresh(); else setLoading(false); }, [status]);
  useEffect(() => { const id = params.get('id'); if (!id || status !== 'authenticated') { setSelected(null); return; } void Promise.all([getNudge(id), recordNudgeOpen(id)]).then(([nudge]) => setSelected(nudge)); }, [params, status]);
  const visible = useMemo(() => nudges.filter((nudge) => `${nudge.title} ${nudge.content} ${nudge.tags.join(' ')}`.toLowerCase().includes(filter.toLowerCase())), [nudges, filter]);

  if (status !== 'authenticated') return <Page narrow><PageHeader eyebrow='Memory Nudges' title='Sign in to use private nudges' description='Nudges sync privately and need an account so Supabase can deliver them to your devices.' /></Page>;
  return (
    <Page narrow>
      <PageHeader eyebrow='Memory Nudges' title='Keep important ideas alive' description='Capture facts, data and reminders, then let weighted repetition bring them back at the right time.' actions={<div className={styles.headerActions}><Button size='sm' onClick={() => setImportOpen(true)}>Import</Button><Button size='sm' variant='primary' onClick={() => setEditing('new')}><Icon name='plus' size={15} /> Add nudge</Button></div>} />
      {message && <p className={styles.message} role='status'>{message}</p>}
      {selected && <ReviewCard nudge={selected} onDone={async (action, hours) => { await recordNudgeFeedback(selected, action, hours); setParams({}); setMessage(action === 'remembered' ? 'Marked remembered. Its interval is now longer.' : action === 'forgot' ? 'Marked for an earlier return.' : action === 'archive' ? 'Nudge archived.' : 'Nudge snoozed.'); await refresh(); }} />}
      <div className={styles.toolbar}><label><Icon name='search' size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder='Filter nudges…' /></label><span>{nudges.filter((item) => item.active).length} active · {nudges.length} total</span></div>
      {!loading && visible.length === 0 ? <EmptyState icon='sparkle' title='No memory nudges yet' description='Add one important fact, quote or mistake you never want to forget.' action={<Button variant='primary' onClick={() => setEditing('new')}>Create first nudge</Button>} /> : <div className={styles.grid}>{visible.map((nudge) => <article className={`${styles.card} ${!nudge.active ? styles.paused : ''}`} key={nudge.id}><header><span>{nudge.kind}</span><div aria-label={`Priority ${nudge.priority}`}>{'●'.repeat(nudge.priority)}<i>{'●'.repeat(5 - nudge.priority)}</i></div></header><h2>{nudge.title}</h2><p>{nudge.content}</p>{nudge.tags.length > 0 && <div className={styles.tags}>{nudge.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}<footer><small>{nudge.sendCount} deliveries · {nudge.cooldownHours}h cooldown</small><div><button onClick={() => { setSelected(nudge); setParams({ id: nudge.id }); }}>Review</button><button onClick={() => setEditing(nudge)}>Edit</button><button onClick={async () => { await setNudgeActive(nudge.id, !nudge.active); await refresh(); }}>{nudge.active ? 'Pause' : 'Resume'}</button></div></footer></article>)}</div>}
      {editing && <NudgeEditor nudge={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async (value) => { if (editing === 'new') await createNudge(value); else await updateNudge(editing.id, value); setEditing(null); setMessage('Nudge saved.'); await refresh(); }} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={async (items) => { await Promise.all(items.map(createNudge)); setImportOpen(false); setMessage(`${items.length} nudges imported.`); await refresh(); }} />}
    </Page>
  );
}

function ReviewCard({ nudge, onDone }: { nudge: MemoryNudge; onDone: (action: 'remembered' | 'forgot' | 'snooze' | 'archive', hours?: number) => Promise<void> }) {
  return <section className={styles.review}><span>{nudge.kind} · priority {nudge.priority}</span><h2>{nudge.title}</h2><blockquote>{nudge.content}</blockquote>{nudge.context && <p>{nudge.context}</p>}{nudge.source && <small>Source: {nudge.source}</small>}<div><Button size='sm' variant='primary' onClick={() => void onDone('remembered')}>Remembered</Button><Button size='sm' onClick={() => void onDone('forgot')}>Forgot this</Button><Button size='sm' onClick={() => void onDone('snooze', 24)}>Tomorrow</Button><Button size='sm' variant='ghost' onClick={() => void onDone('archive')}>Archive</Button></div></section>;
}

function NudgeEditor({ nudge, onClose, onSave }: { nudge: MemoryNudge | null; onClose: () => void; onSave: (value: EditorValue) => Promise<void> }) {
  const [value, setValue] = useState<EditorValue>(nudge ? { kind: nudge.kind, title: nudge.title, content: nudge.content, context: nudge.context, source: nudge.source, sourceUrl: nudge.sourceUrl, tags: nudge.tags, priority: nudge.priority, cooldownHours: nudge.cooldownHours } : blank);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await onSave(value); } finally { setSaving(false); } };
  return <div className={styles.backdrop} onMouseDown={onClose}><form className={styles.editor} onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}><header><div><span>Memory nudge</span><h2>{nudge ? 'Edit nudge' : 'Add something worth remembering'}</h2></div><button type='button' onClick={onClose}><Icon name='close' /></button></header><div className={styles.fields}><label>Type<select value={value.kind} onChange={(event) => setValue({ ...value, kind: event.target.value as NudgeKind })}>{KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label>Title<input required maxLength={120} value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} /></label><label className={styles.wide}>Content<textarea required maxLength={500} rows={4} value={value.content} onChange={(event) => setValue({ ...value, content: event.target.value })} /></label><label className={styles.wide}>Context<textarea rows={2} value={value.context} onChange={(event) => setValue({ ...value, context: event.target.value })} /></label><label>Source<input value={value.source} onChange={(event) => setValue({ ...value, source: event.target.value })} /></label><label>Source URL<input type='url' value={value.sourceUrl} onChange={(event) => setValue({ ...value, sourceUrl: event.target.value })} /></label><label>Tags<input value={value.tags.join(', ')} onChange={(event) => setValue({ ...value, tags: event.target.value.split(',').map((item) => item.trim()) })} placeholder='history, economy' /></label><label>Priority<select value={value.priority} onChange={(event) => setValue({ ...value, priority: Number(event.target.value) })}>{[1,2,3,4,5].map((item) => <option value={item} key={item}>{item} — {item === 5 ? 'Crucial' : item === 1 ? 'Occasional' : 'Normal'}</option>)}</select></label><label>Minimum cooldown<select value={value.cooldownHours} onChange={(event) => setValue({ ...value, cooldownHours: Number(event.target.value) })}>{[6,12,24,48,72,168,336,720].map((item) => <option value={item} key={item}>{item < 24 ? `${item} hours` : `${item / 24} days`}</option>)}</select></label></div><footer><Button onClick={onClose}>Cancel</Button><Button variant='primary' type='submit' disabled={saving}>{saving ? 'Saving…' : 'Save nudge'}</Button></footer></form></div>;
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (items: EditorValue[]) => Promise<void> }) {
  const [text, setText] = useState(''); const [error, setError] = useState('');
  const submit = async () => { try { let raw: Partial<EditorValue>[]; if (text.trim().startsWith('[')) raw = JSON.parse(text) as Partial<EditorValue>[]; else { const [header, ...rows] = text.trim().split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim())); raw = rows.map((row) => Object.fromEntries(header.map((key, index) => [key, key === 'priority' || key === 'cooldownHours' ? Number(row[index]) : key === 'tags' ? (row[index] ?? '').split('|') : row[index]]))); } if (!Array.isArray(raw)) throw new Error('Paste a JSON array or CSV rows.'); const items = raw.map((item) => ({ ...blank, ...item, tags: Array.isArray(item.tags) ? item.tags : [] })); if (items.some((item) => !item.title || !item.content)) throw new Error('Every item needs title and content.'); await onImport(items); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid import data.'); } };
  return <div className={styles.backdrop} onMouseDown={onClose}><section className={styles.importDialog} onMouseDown={(event) => event.stopPropagation()}><h2>Import nudges</h2><p>Paste a JSON array or CSV with title and content columns. Separate CSV tags with |.</p><textarea rows={12} value={text} onChange={(event) => setText(event.target.value)} placeholder='[{"title":"Battle of Buxar","content":"Fought in 1764","priority":5}]' />{error && <small>{error}</small>}<footer><Button onClick={onClose}>Cancel</Button><Button variant='primary' onClick={() => void submit()}>Import</Button></footer></section></div>;
}
