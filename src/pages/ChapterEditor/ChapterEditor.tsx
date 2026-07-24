import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Badge, Button } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { useAuth } from '../../context/AuthContext';
import { useUserData } from '../../context/UserDataContext';
import { useServices } from '../../context/ServicesContext';
import { useChapter } from '../../hooks/useChapters';
import { parseChapter } from '../../services/parser';
import { getSupabase } from '../../services/supabase/client';
import {
  getPublicChapterAccess,
  makePublicChapterPrivate,
  savePublicChapterEdit,
  type ChapterAccess,
} from '../../services/supabase/communityChapters';
import type { Chapter, MainsQuestion, PrelimsQuestion } from '../../types';
import styles from './ChapterEditor.module.css';

export function ChapterEditor() {
  const { chapterId = '' } = useParams();
  const state = useChapter(chapterId);
  return (
    <Page narrow>
      <AsyncBoundary state={state} loadingLabel='Opening editor…'>
        {(chapter) => <Editor key={chapter.id} initial={chapter} />}
      </AsyncBoundary>
    </Page>
  );
}

function Editor({ initial }: { initial: Chapter }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status, user } = useAuth();
  const { userChapters, addUserChapter } = useUserData();
  const { chapters } = useServices();
  const [draft, setDraft] = useState(initial);
  const [access, setAccess] = useState<ChapterAccess | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'publish' | 'private' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const selectedType = params.get('type');
  const selectedId = params.get('question');
  const privateChapter = useMemo(
    () => userChapters.find((chapter) => chapter.id === initial.id) ?? null,
    [initial.id, userChapters],
  );

  useEffect(() => {
    const client = getSupabase();
    if (!client || !user) {
      setAccessReady(true);
      return;
    }
    getPublicChapterAccess(client, initial.id)
      .then(setAccess)
      .catch(() => setAccess(null))
      .finally(() => setAccessReady(true));
  }, [initial.id, user]);

  const updatePrelim = (index: number, patch: Partial<PrelimsQuestion>) => {
    setDraft((current) => ({
      ...current,
      prelims: current.prelims.map((question, currentIndex) =>
        currentIndex === index ? { ...question, ...patch } : question,
      ),
    }));
  };
  const updateMains = (index: number, patch: Partial<MainsQuestion>) => {
    setDraft((current) => ({
      ...current,
      mains: current.mains.map((question, currentIndex) =>
        currentIndex === index ? { ...question, ...patch } : question,
      ),
    }));
  };
  const remove = (type: 'prelims' | 'mains', index: number) => {
    if (!window.confirm('Remove this question from the proposed chapter?')) return;
    setDraft((current) => ({
      ...current,
      [type]: current[type].filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const save = async () => {
    setMessage(null);
    let valid: Chapter;
    try {
      valid = parseChapter(JSON.parse(JSON.stringify(draft)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the chapter fields.');
      return;
    }

    if (!access) {
      if (!privateChapter) {
        setMessage(status === 'authenticated'
          ? 'This public chapter is not available for editing.'
          : 'Sign in to suggest an edit.');
        return;
      }
      addUserChapter(valid);
      navigate(Routes.chapter(valid.id));
      return;
    }

    const client = getSupabase();
    if (!client || !user) {
      setMessage('Sign in to suggest an edit.');
      return;
    }
    setBusy(true);
    try {
      const result = await savePublicChapterEdit(client, valid, note);
      setMessage(result === 'published'
        ? 'Changes published.'
        : result === 'pending'
          ? 'Revision sent for admin approval.'
          : 'Suggestion sent for admin review. Thank you.');
      if (result === 'published') {
        chapters.clearCache(valid.id);
        window.setTimeout(() => navigate(Routes.chapter(valid.id)), 700);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this edit.');
    } finally {
      setBusy(false);
    }
  };

  const makePrivate = async () => {
    if (!access || !user) return;
    const client = getSupabase();
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const privateCopy = await makePublicChapterPrivate(client, draft);
      addUserChapter(privateCopy);
      chapters.clearCache(draft.id);
      setMessage('Chapter is now private to your account.');
      window.setTimeout(() => navigate(Routes.chapter(draft.id)), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not make this chapter private.');
    } finally {
      setBusy(false);
    }
  };

  const action = access?.isAdmin
    ? 'Publish changes'
    : access?.isOwner
      ? 'Submit revision'
      : access
        ? 'Suggest changes'
        : 'Save private changes';

  return (
    <>
      <Link className={styles.back} to={Routes.chapter(initial.id)}>← Back to chapter</Link>
      <PageHeader
        eyebrow='Chapter editor'
        title={draft.title}
        description='Edit only what needs changing. Everything is validated before submission.'
      />
      <div className={styles.accessLine}>
        <Badge tone={access?.isAdmin ? 'success' : access?.isOwner ? 'accent' : 'neutral'}>
          {access?.isAdmin ? 'Admin edit' : access?.isOwner ? 'Owner revision' : access ? 'Community suggestion' : 'Private edit'}
        </Badge>
        {access && !access.isAdmin && !access.isOwner && <span>An admin will review your suggestion.</span>}
      </div>

      <section className={styles.list} aria-label='Prelims questions'>
        <h2>Prelims questions</h2>
        {draft.prelims.map((question, index) => (
          <QuestionForm
            key={question.id}
            open={selectedType === 'prelims' && selectedId === question.id}
            title={`${index + 1}. ${question.statement}`}
            onRemove={() => remove('prelims', index)}
          >
            <Field label='Question'>
              <textarea rows={4} value={question.statement} onChange={(event) => updatePrelim(index, { statement: event.target.value })} />
            </Field>
            <div className={styles.options}>
              {question.options.map((option, optionIndex) => (
                <Field key={option.id} label={`Option ${option.id.toUpperCase()}`}>
                  <input value={option.text} onChange={(event) => updatePrelim(index, {
                    options: question.options.map((item, currentIndex) => currentIndex === optionIndex
                      ? { ...item, text: event.target.value }
                      : item),
                  })} />
                </Field>
              ))}
            </div>
            <Field label='Correct answer'>
              <select value={question.answer} onChange={(event) => updatePrelim(index, { answer: event.target.value })}>
                {question.options.map((option) => <option key={option.id} value={option.id}>{option.id.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label='Explanation'>
              <textarea rows={4} value={question.explanation ?? ''} onChange={(event) => updatePrelim(index, { explanation: event.target.value })} />
            </Field>
          </QuestionForm>
        ))}
      </section>

      <section className={styles.list} aria-label='Mains questions'>
        <h2>Mains questions</h2>
        {draft.mains.map((question, index) => (
          <QuestionForm
            key={question.id}
            open={selectedType === 'mains' && selectedId === question.id}
            title={`${index + 1}. ${question.question}`}
            onRemove={() => remove('mains', index)}
          >
            <Field label='Question'>
              <textarea rows={4} value={question.question} onChange={(event) => updateMains(index, { question: event.target.value })} />
            </Field>
            <Field label='Model answer'>
              <textarea rows={7} value={question.modelAnswer ?? ''} onChange={(event) => updateMains(index, { modelAnswer: event.target.value })} />
            </Field>
          </QuestionForm>
        ))}
      </section>

      {access && !access.isAdmin && !access.isOwner && (
        <Field label='What did you change? (optional)'>
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder='Briefly explain the correction…' />
        </Field>
      )}
      {message && <p className={styles.message} role='status'>{message}</p>}
      <div className={styles.footer}>
        <Button variant='primary' disabled={busy || !accessReady} onClick={access?.isAdmin
          ? () => { setConfirmation(''); setConfirmAction('publish'); }
          : save}>
          {busy ? 'Saving…' : action}
        </Button>
        {access && (access.isOwner || (access.isAdmin && access.ownerId === null)) && (
          <Button variant='danger' disabled={busy} onClick={() => { setConfirmation(''); setConfirmAction('private'); }}>Make private</Button>
        )}
        <Button variant='secondary' onClick={() => navigate(Routes.chapter(initial.id))}>Cancel</Button>
      </div>

      {confirmAction && (
        <div className={styles.dialogBackdrop} onMouseDown={() => !busy && setConfirmAction(null)}>
          <section className={styles.dialog} role='alertdialog' aria-modal='true' aria-labelledby='chapter-confirm-title' onMouseDown={(event) => event.stopPropagation()}>
            <Badge tone={confirmAction === 'private' ? 'danger' : 'warning'}>Confirm change</Badge>
            <h2 id='chapter-confirm-title'>{confirmAction === 'private' ? 'Make this chapter private?' : 'Publish these changes?'}</h2>
            <p>{confirmAction === 'private'
              ? 'Other users will immediately lose access. Historical quiz statistics remain, and your private copy keeps the same IDs.'
              : 'This edited version will immediately replace the chapter for every user.'}</p>
            {confirmAction === 'private' && <label><span>Type <strong>PRIVATE</strong> to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
            <div className={styles.dialogActions}>
              <Button variant='secondary' disabled={busy} onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant={confirmAction === 'private' ? 'danger' : 'primary'} disabled={busy || (confirmAction === 'private' && confirmation !== 'PRIVATE')} onClick={() => {
                const selected = confirmAction;
                setConfirmAction(null);
                if (selected === 'private') void makePrivate();
                else void save();
              }}>{confirmAction === 'private' ? 'Make private' : 'Publish changes'}</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function QuestionForm({
  title,
  open,
  onRemove,
  children,
}: {
  title: string;
  open: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <details className={styles.question} open={open || undefined}>
      <summary>{title}</summary>
      <div className={styles.form}>
        {children}
        <Button variant='danger' size='sm' onClick={onRemove}>Remove question</Button>
      </div>
    </details>
  );
}
