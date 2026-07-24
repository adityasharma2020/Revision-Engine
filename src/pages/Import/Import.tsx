import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, Icon } from "../../components/common";
import { Page, PageHeader } from "../../components/layout";
import { Routes } from "../../constants/routes";
import { subjectStyle } from "../../constants/subjects";
import { useUserData } from "../../context/UserDataContext";
import { useAuth } from "../../context/AuthContext";
import { ChapterParseError, parseChapter } from "../../services/parser";
import { getSupabase } from "../../services/supabase/client";
import {
  isCommunityAdmin,
  adminSetChapterState,
  adminUpdateChapter,
  loadAdminChapterCatalog,
  loadAdminChapterAudit,
  loadMySubmissions,
  loadReviewQueue,
  loadSuggestionQueue,
  reviewEditSuggestion,
  reviewCommunityChapter,
  submitCommunityChapter,
  type CommunitySubmission,
  type EditSuggestion,
  type AdminAuditEntry,
} from "../../services/supabase/communityChapters";
import type { Chapter } from "../../types";
import styles from "./Import.module.css";

interface AdminAction {
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  noteLabel?: string;
  noteRequired?: boolean;
  danger?: boolean;
  run: (note: string) => Promise<void>;
}

const TEMPLATE = `{
  "id": "my-subject-ch01",
  "subject": "History",
  "chapterNumber": 1,
  "title": "My Chapter Title",
  "prelims": [
    {
      "id": "q1",
      "statement": "Question text?",
      "options": [
        { "id": "a", "text": "Option A" },
        { "id": "b", "text": "Option B" }
      ],
      "answer": "a",
      "explanation": "Why A is correct."
    }
  ],
  "mains": []
}`;

const AI_PROMPT = `Convert my study material into one valid Revision Engine chapter JSON object.

Important content rules:
- Use only the material I provide. Do not invent facts, questions, answers, explanations, or citations.
- I confirm that I created, own, or have permission to use the supplied material.
- Return raw JSON only: no Markdown fences, introduction, comments, or trailing commas.
- Use a unique kebab-case chapter id and unique question ids across both arrays.
- Every prelims answer must exactly match one of that question's option ids.
- Keep "statement" as the complete question text for search and accessibility.
- Set "questionType" to exactly one of: "standard", "statements", "how-many", "match-pairs", "pair-evaluation", "assertion-reason", "sequence", "map-based", or "passage-based".
- Use "standard" for a direct question. Use "map-based" for map/location identification and "passage-based" for questions tied to a supplied passage; these need no special fields unless the source itself has structure.
- For "statements" and "how-many", provide "lead", "statements" (without number prefixes), and "ask".
- For "sequence", use the same list fields but preserve the source order. Do not solve or reorder the events.
- For "match-pairs", provide "lead", "pairs" as [{ "left": "List I item", "right": "List II item" }], optional "pairLeftLabel" and "pairRightLabel" headings, and "ask". Preserve source row order; do not perform the matching.
- For questions asking which displayed pairs are correctly matched, use "pair-evaluation" with the same pair fields.
- For "assertion-reason", provide "lead" when present, "assertion", "reason", and "ask".
- Omit fields belonging to other question types. Never force prose into a list or infer structure absent from the source.
- Allowed difficulty values are "easy", "medium", or "hard".
- If a field is unknown, omit optional fields instead of guessing.

Required structure:
{
  "id": "subject-topic-ch01",
  "subject": "Subject name",
  "title": "Chapter title",
  "chapterNumber": 1,
  "source": "Optional source attribution",
  "description": "Optional short summary",
  "tags": ["optional", "chapter-level", "tags"],
  "prelims": [
    {
      "id": "pre-001",
      "statement": "Complete multiple-choice question",
      "questionType": "statements",
      "lead": "Optional introduction for a statement-based question",
      "statements": ["First numbered statement", "Second numbered statement"],
      "ask": "Which of the statements given above is/are correct?",
      "options": [
        { "id": "a", "text": "Option A" },
        { "id": "b", "text": "Option B" }
      ],
      "answer": "a",
      "explanation": "Optional explanation grounded in the supplied material",
      "difficulty": "medium",
      "tags": ["topic"],
      "source": "Optional question source",
      "origin": "FYQ_Pre_1 or PYQ_Pre_2024 when known",
      "year": 2024
    }
  ],
  "mains": [
    {
      "id": "main-001",
      "question": "Complete descriptive question",
      "modelAnswer": "Optional model answer grounded in the supplied material",
      "keyPoints": ["Point one", "Point two"],
      "explanation": "Optional examiner guidance",
      "wordLimit": 250,
      "marks": 15,
      "difficulty": "medium",
      "tags": ["topic"],
      "origin": "FYQ_M.1 or PYQ_M.2024 when known",
      "year": 2024
    }
  ]
}

Question-format examples (use only the fields for the selected type):
- Match the following: "questionType": "match-pairs", "lead": "Match List I with List II:", "pairLeftLabel": "List I — Site", "pairRightLabel": "List II — State", "pairs": [{ "left": "Item 1", "right": "Item A" }], "ask": "Select the correct answer using the code below."
- Correctly matched pairs: "questionType": "pair-evaluation", "lead": "Consider the following pairs:", "pairLeftLabel": "Term", "pairRightLabel": "Description", "pairs": [{ "left": "Term as supplied", "right": "Description as supplied" }], "ask": "How many pairs given above are correctly matched?"
- Assertion and reason: "questionType": "assertion-reason", "assertion": "Assertion text", "reason": "Reason text", "ask": "Choose the correct option."
- Chronology/order: "questionType": "sequence", "lead": "Arrange the following in chronological order:", "statements": ["Event one", "Event two"], "ask": "Select the correct sequence."

Keep "prelims" and "mains" as arrays even when either is empty. Validate the final JSON and its answer-option matches before responding.

SOURCE MATERIAL:
[Paste the authorised study material here]`;

export function Import() {
  const navigate = useNavigate();
  const { status: authStatus, user } = useAuth();
  const { userChapters, addUserChapter, removeUserChapter } = useUserData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [submissions, setSubmissions] = useState<CommunitySubmission[]>([]);
  const [reviewQueue, setReviewQueue] = useState<CommunitySubmission[]>([]);
  const [suggestionQueue, setSuggestionQueue] = useState<EditSuggestion[]>([]);
  const [adminCatalog, setAdminCatalog] = useState<CommunitySubmission[]>([]);
  const [adminAudit, setAdminAudit] = useState<AdminAuditEntry[]>([]);
  const [adminEditingRecord, setAdminEditingRecord] = useState<CommunitySubmission | null>(null);
  const [adminAction, setAdminAction] = useState<AdminAction | null>(null);
  const [adminConfirmation, setAdminConfirmation] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [admin, setAdmin] = useState(false);
  const [communityBusy, setCommunityBusy] = useState<string | null>(null);
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);

  const refreshCommunity = useCallback(async () => {
    const client = getSupabase();
    if (!client || !user) {
      setSubmissions([]);
      setReviewQueue([]);
      setSuggestionQueue([]);
      setAdminCatalog([]);
      setAdminAudit([]);
      setAdmin(false);
      return;
    }
    try {
      const adminAccess = await isCommunityAdmin(client);
      setAdmin(adminAccess);
      const [mine, queue, suggestions, catalog, audit] = await Promise.all([
        loadMySubmissions(client),
        adminAccess ? loadReviewQueue(client) : Promise.resolve([]),
        adminAccess ? loadSuggestionQueue(client) : Promise.resolve([]),
        adminAccess ? loadAdminChapterCatalog(client) : Promise.resolve([]),
        adminAccess ? loadAdminChapterAudit(client) : Promise.resolve([]),
      ]);
      setSubmissions(mine);
      setReviewQueue(queue);
      setSuggestionQueue(suggestions);
      setAdminCatalog(catalog);
      setAdminAudit(audit);
    } catch (err) {
      console.warn('[community] publishing unavailable:', err);
    }
  }, [user]);

  useEffect(() => {
    void refreshCommunity();
  }, [refreshCommunity]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptCopied(false);
    }
  };

  const validate = (text: string) => {
    setRaw(text);
    setParsed(null);
    setError(null);
    if (text.trim() === "") return;
    try {
      const chapter = parseChapter(JSON.parse(text));
      setParsed(chapter);
    } catch (err) {
      if (err instanceof ChapterParseError) {
        setError(`${err.message}${err.path ? ` — at ${err.path}` : ""}`);
      } else if (err instanceof SyntaxError) {
        setError(`Invalid JSON — ${err.message}`);
      } else {
        setError("Could not read this file.");
      }
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => validate(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const validatedDraft = (): Chapter | null => {
    try {
      const chapter = parseChapter(JSON.parse(raw));
      setParsed(chapter);
      setError(null);
      return chapter;
    } catch {
      validate(raw);
      return null;
    }
  };

  const save = () => {
    const chapter = validatedDraft();
    if (!chapter) return;
    const clash = userChapters.some((c) => c.id === chapter.id);
    if (
      clash &&
      !window.confirm(`A chapter with id "${chapter.id}" exists. Replace it?`)
    ) {
      return;
    }
    addUserChapter(chapter);
    navigate(Routes.chapter(chapter.id));
  };

  const editChapter = (chapter: Chapter) => {
    validate(JSON.stringify(chapter, null, 2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setChapterDraft = (chapter: Chapter) => {
    setParsed(chapter);
    setRaw(JSON.stringify(chapter, null, 2));
    setError(null);
  };

  const updatePrelim = (index: number, patch: Record<string, unknown>) => {
    if (!parsed) return;
    const prelims = parsed.prelims.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    );
    setChapterDraft({ ...parsed, prelims });
  };

  const updateMains = (index: number, patch: Record<string, unknown>) => {
    if (!parsed) return;
    const mains = parsed.mains.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    );
    setChapterDraft({ ...parsed, mains });
  };

  const removeQuestion = (kind: 'prelims' | 'mains', index: number) => {
    if (!parsed || !window.confirm('Remove this question?')) return;
    const questions = parsed[kind].filter((_, questionIndex) => questionIndex !== index);
    setChapterDraft({ ...parsed, [kind]: questions });
  };

  const submitForReview = async () => {
    const client = getSupabase();
    const chapter = validatedDraft();
    if (!chapter || !client || !user) return;
    setCommunityBusy(chapter.id);
    setCommunityMessage(null);
    try {
      addUserChapter(chapter);
      await submitCommunityChapter(client, chapter);
      await refreshCommunity();
      setCommunityMessage('Submitted for admin review. Your private copy is still editable.');
    } catch (err) {
      setCommunityMessage(err instanceof Error ? err.message : 'Could not submit this chapter.');
    } finally {
      setCommunityBusy(null);
    }
  };

  const review = async (
    submission: CommunitySubmission,
    decision: 'published' | 'changes_requested',
    note?: string,
  ) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase is unavailable.');
    await reviewCommunityChapter(client, submission.id, decision, note);
  };

  const reviewSuggestion = async (
    suggestion: EditSuggestion,
    decision: 'accepted' | 'rejected',
    note?: string,
  ) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase is unavailable.');
    await reviewEditSuggestion(client, suggestion.id, decision, note);
  };

  const openAdminAction = (action: AdminAction) => {
    setAdminConfirmation('');
    setAdminNote('');
    setAdminAction(action);
  };

  const runAdminAction = async () => {
    if (!adminAction) return;
    setCommunityBusy('admin-action');
    setCommunityMessage(null);
    try {
      await adminAction.run(adminNote);
      setAdminAction(null);
      await refreshCommunity();
    } catch (err) {
      setCommunityMessage(err instanceof Error ? err.message : 'Admin action failed.');
    } finally {
      setCommunityBusy(null);
    }
  };

  const changeAdminChapterState = (
    submission: CommunitySubmission,
    action: 'publish' | 'unpublish' | 'archive',
  ) => {
    const labels = {
      publish: {
        title: 'Publish this chapter?',
        description: 'The current reviewed draft will become immediately available to every user.',
        confirmLabel: 'Publish chapter',
      },
      unpublish: {
        title: 'Unpublish this chapter?',
        description: 'It will disappear from the public library. Existing quiz history remains, but users cannot start new quizzes from it.',
        confirmLabel: 'Unpublish chapter',
      },
      archive: {
        title: 'Archive this chapter?',
        description: 'It will be removed from public use and review queues. Its content and audit history are retained for recovery.',
        confirmLabel: 'Archive chapter',
      },
    }[action];
    openAdminAction({
      ...labels,
      danger: action !== 'publish',
      confirmationText: action === 'archive' ? 'ARCHIVE' : undefined,
      noteLabel: 'Reason or moderation note (optional)',
      run: async (note) => {
        const client = getSupabase();
        if (!client) throw new Error('Supabase is unavailable.');
        await adminSetChapterState(client, submission.id, action, note);
      },
    });
  };

  const beginAdminEdit = (submission: CommunitySubmission) => {
    setAdminEditingRecord(submission);
    validate(JSON.stringify(submission.draft, null, 2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveAdminDraft = async (publish: boolean, note?: string, managed = false) => {
    const client = getSupabase();
    const chapter = validatedDraft();
    if (!client || !chapter || !adminEditingRecord) {
      if (managed) throw new Error('The admin draft is not ready to save.');
      return;
    }
    if (!managed) setCommunityBusy(adminEditingRecord.id);
    try {
      await adminUpdateChapter(client, adminEditingRecord.id, chapter, publish, note);
      setAdminEditingRecord(null);
      await refreshCommunity();
      setCommunityMessage(publish ? 'Admin changes published.' : 'Admin draft saved.');
    } catch (err) {
      if (managed) throw err;
      setCommunityMessage(err instanceof Error ? err.message : 'Could not save admin changes.');
    } finally {
      if (!managed) setCommunityBusy(null);
    }
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow='Import'
        title='Import a chapter'
        description='Choose a JSON file or paste its contents below.'
      />

      <section className={styles.importPanel} aria-label='Chapter JSON'>
        <input
          ref={fileInput}
          type='file'
          accept='application/json,.json'
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className={styles.fileOption}>
          <div>
            <h2>Upload a file</h2>
            <p>Select a <code>.json</code> file from your device.</p>
          </div>
          <Button
            variant='secondary'
            onClick={() => fileInput.current?.click()}
          >
            Choose file
          </Button>
        </div>

        <div className={styles.divider}><span>or</span></div>

        <label className={styles.pasteLabel}>
          <span>Paste JSON</span>
          <button
            type='button'
            className={styles.templateBtn}
            onClick={() => validate(TEMPLATE)}
          >
            Use a template
          </button>
        </label>
        <textarea
          className={styles.textarea}
          value={raw}
          rows={9}
          spellCheck={false}
          placeholder='Paste chapter JSON here…'
          onChange={(e) => validate(e.target.value)}
        />
      </section>

      {error && (
        <div className={styles.error}>
          <Icon name='close' size={16} />
          <span>{error}</span>
        </div>
      )}

      {parsed && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            <Badge hue={subjectStyle(parsed.subject).hue}>
              {subjectStyle(parsed.subject).label}
            </Badge>
            <Icon name='check' size={18} className={styles.validIcon} />
          </div>
          <h3 className={styles.previewTitle}>{parsed.title}</h3>
          <p className={styles.previewMeta}>
            Chapter {parsed.chapterNumber} · {parsed.prelims.length} prelims ·{" "}
            {parsed.mains.length} mains
          </p>
          <details className={styles.questionEditor}>
            <summary>Edit or remove questions</summary>
            <div className={styles.questionEditorContent}>
              {parsed.prelims.map((question, index) => (
                <fieldset key={question.id} className={styles.questionForm}>
                  <legend>Prelims {index + 1}</legend>
                  <label>
                    Question
                    <textarea
                      rows={3}
                      value={question.statement}
                      onChange={(event) => updatePrelim(index, { statement: event.target.value })}
                    />
                  </label>
                  <div className={styles.optionGrid}>
                    {question.options.map((option, optionIndex) => (
                      <label key={option.id}>
                        Option {option.id.toUpperCase()}
                        <input
                          value={option.text}
                          onChange={(event) => updatePrelim(index, {
                            options: question.options.map((item, itemIndex) =>
                              itemIndex === optionIndex ? { ...item, text: event.target.value } : item,
                            ),
                          })}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Correct answer
                    <select
                      value={question.answer}
                      onChange={(event) => updatePrelim(index, { answer: event.target.value })}
                    >
                      {question.options.map((option) => (
                        <option key={option.id} value={option.id}>{option.id.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Explanation
                    <textarea
                      rows={2}
                      value={question.explanation ?? ''}
                      onChange={(event) => updatePrelim(index, { explanation: event.target.value })}
                    />
                  </label>
                  <Button variant='danger' size='sm' onClick={() => removeQuestion('prelims', index)}>
                    Remove question
                  </Button>
                </fieldset>
              ))}
              {parsed.mains.map((question, index) => (
                <fieldset key={question.id} className={styles.questionForm}>
                  <legend>Mains {index + 1}</legend>
                  <label>
                    Question
                    <textarea
                      rows={3}
                      value={question.question}
                      onChange={(event) => updateMains(index, { question: event.target.value })}
                    />
                  </label>
                  <label>
                    Model answer
                    <textarea
                      rows={5}
                      value={question.modelAnswer ?? ''}
                      onChange={(event) => updateMains(index, { modelAnswer: event.target.value })}
                    />
                  </label>
                  <Button variant='danger' size='sm' onClick={() => removeQuestion('mains', index)}>
                    Remove question
                  </Button>
                </fieldset>
              ))}
            </div>
          </details>
          <div className={styles.previewActions}>
            {adminEditingRecord ? (
              <>
                <Button variant='secondary' disabled={communityBusy === adminEditingRecord.id} onClick={() => void saveAdminDraft(false)}>
                  Save admin draft
                </Button>
                <Button variant='primary' disabled={communityBusy === adminEditingRecord.id} onClick={() => openAdminAction({
                  title: 'Publish these admin edits?',
                  description: 'Every user will immediately receive this edited chapter version.',
                  confirmLabel: 'Publish changes',
                  noteLabel: 'Reason for this change (optional)',
                  run: async (note) => { await saveAdminDraft(true, note, true); },
                })}>
                  Publish admin changes
                </Button>
                <Button variant='ghost' onClick={() => { setAdminEditingRecord(null); validate(''); }}>Cancel admin edit</Button>
              </>
            ) : (
              <Button variant='primary' onClick={save}>
                Save privately
              </Button>
            )}
            {!adminEditingRecord && authStatus === 'authenticated' && (
              <Button
                variant='secondary'
                onClick={submitForReview}
                disabled={communityBusy === parsed.id}
              >
                {communityBusy === parsed.id ? 'Submitting…' : 'Submit to community'}
              </Button>
            )}
          </div>
          {!adminEditingRecord && authStatus !== 'authenticated' && (
            <p className={styles.previewHint}>Sign in to submit this chapter for public review.</p>
          )}
        </div>
      )}

      {communityMessage && <p className={styles.communityMessage}>{communityMessage}</p>}

      <details className={styles.aiHelp}>
        <summary>
          <span>
            <strong>Need help creating the JSON?</strong>
            <small>Use our prompt with an AI assistant</small>
          </span>
        </summary>
        <div className={styles.aiHelpContent}>
          <p>
            Copy the prompt, add your study material at the end, then paste the
            AI response above.
          </p>
          <div className={styles.aiActions}>
            <Button variant='secondary' size='sm' onClick={copyPrompt}>
              <Icon name={promptCopied ? "check" : "copy"} size={16} />
              {promptCopied ? "Copied" : "Copy prompt"}
            </Button>
            <details className={styles.promptDetails}>
              <summary>Preview prompt</summary>
              <pre>{AI_PROMPT}</pre>
            </details>
          </div>
          <p className={styles.importNote}>
            Review AI-generated content before saving. Only use material you
            have permission to use.
          </p>
        </div>
      </details>

      <section className={styles.existing}>
        <h2 className={styles.existingTitle}>Your uploads</h2>
        {userChapters.length === 0 ? (
          <EmptyState
            icon='book'
            title='No uploads yet'
            description='Chapters you import appear here and in your library.'
          />
        ) : (
          <ul className={styles.list}>
            {userChapters.map((c) => (
              <li key={c.id} className={styles.item}>
                <button
                  type='button'
                  className={styles.itemMain}
                  onClick={() => navigate(Routes.chapter(c.id))}
                >
                  <span className={styles.itemTitle}>{c.title}</span>
                  <span className={styles.itemMeta}>
                    {subjectStyle(c.subject).label} · {c.prelims.length}P ·{" "}
                    {c.mains.length}M
                  </span>
                  {submissions.find((submission) => submission.chapterId === c.id) && (
                    <Badge tone={
                      submissions.find((submission) => submission.chapterId === c.id)?.status === 'published'
                        ? 'success'
                        : submissions.find((submission) => submission.chapterId === c.id)?.status === 'changes_requested'
                          ? 'danger'
                          : 'warning'
                    }>
                      {submissions.find((submission) => submission.chapterId === c.id)?.status.replace('_', ' ')}
                    </Badge>
                  )}
                  {submissions.find((submission) => submission.chapterId === c.id)?.reviewNote && (
                    <span className={styles.reviewNote}>
                      Admin: {submissions.find((submission) => submission.chapterId === c.id)?.reviewNote}
                    </span>
                  )}
                </button>
                <button
                  type='button'
                  className={styles.edit}
                  title='Edit JSON'
                  onClick={() => editChapter(c)}
                >
                  Edit
                </button>
                <button
                  type='button'
                  className={styles.remove}
                  title='Remove'
                  onClick={() => {
                    if (
                      window.confirm(`Remove "${c.title}" from your library?`)
                    ) {
                      removeUserChapter(c.id);
                    }
                  }}
                >
                  <Icon name='trash' size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && (
        <section className={styles.existing}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 className={styles.existingTitle}>Platform chapters</h2>
              <p>Manage every submitted, public, unpublished, and archived chapter.</p>
            </div>
            <Badge tone='accent'>{adminCatalog.length} records</Badge>
          </div>
          <ul className={styles.reviewList}>
            {adminCatalog.map((submission) => (
              <li key={submission.id} className={styles.reviewItem}>
                <div className={styles.adminRecordHead}>
                  <div>
                    <h3>{submission.draft.title}</h3>
                    <p>{submission.draft.subject} · {submission.draft.prelims.length} prelims · {submission.draft.mains.length} mains</p>
                  </div>
                  <Badge tone={submission.status === 'published' ? 'success' : submission.status === 'archived' ? 'danger' : submission.status === 'pending' ? 'warning' : 'neutral'}>
                    {submission.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className={styles.reviewActions}>
                  <Button size='sm' variant='secondary' onClick={() => beginAdminEdit(submission)}>Edit draft</Button>
                  {submission.status !== 'published' && submission.status !== 'private' && (
                    <Button size='sm' variant='primary' onClick={() => changeAdminChapterState(submission, 'publish')}>Publish</Button>
                  )}
                  {submission.status === 'published' && (
                    <Button size='sm' variant='secondary' onClick={() => changeAdminChapterState(submission, 'unpublish')}>Unpublish</Button>
                  )}
                  {submission.status !== 'archived' && (
                    <Button size='sm' variant='danger' onClick={() => changeAdminChapterState(submission, 'archive')}>Archive</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && adminAudit.length > 0 && (
        <details className={styles.auditPanel}>
          <summary>Moderation history · {adminAudit.length} recent actions</summary>
          <ul>
            {adminAudit.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.action.replaceAll('_', ' ')}</strong>
                  <small>{entry.chapterId}{entry.previousStatus || entry.nextStatus ? ` · ${entry.previousStatus ?? '—'} → ${entry.nextStatus ?? '—'}` : ''}</small>
                </span>
                <time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time>
                {entry.note && <p>{entry.note}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {admin && (
        <section className={styles.existing}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 className={styles.existingTitle}>Community review</h2>
              <p>Approve submissions before they become visible to everyone.</p>
            </div>
            <Badge tone={reviewQueue.length + suggestionQueue.length ? 'warning' : 'neutral'}>
              {reviewQueue.length + suggestionQueue.length} pending
            </Badge>
          </div>
          {reviewQueue.length === 0 && suggestionQueue.length === 0 ? (
            <EmptyState icon='check' title='Review queue is clear' />
          ) : reviewQueue.length > 0 ? (
            <ul className={styles.reviewList}>
              {reviewQueue.map((submission) => (
                <li key={submission.id} className={styles.reviewItem}>
                  <div>
                    <h3>{submission.draft.title}</h3>
                    <p>{submission.draft.subject} · {submission.draft.prelims.length} prelims · {submission.draft.mains.length} mains</p>
                  </div>
                  <details className={styles.reviewJson}>
                    <summary>Inspect JSON</summary>
                    <pre>{JSON.stringify(submission.draft, null, 2)}</pre>
                  </details>
                  <div className={styles.reviewActions}>
                    <Button
                      variant='primary'
                      size='sm'
                      disabled={communityBusy === submission.id}
                      onClick={() => openAdminAction({
                        title: 'Approve and publish?',
                        description: 'This submitted draft will become available to every user immediately.',
                        confirmLabel: 'Approve and publish',
                        noteLabel: 'Review note (optional)',
                        run: (note) => review(submission, 'published', note),
                      })}
                    >
                      Approve and publish
                    </Button>
                    <Button
                      variant='secondary'
                      size='sm'
                      disabled={communityBusy === submission.id}
                      onClick={() => openAdminAction({
                        title: 'Request changes?',
                        description: 'The chapter will remain unpublished and the author will see your review note.',
                        confirmLabel: 'Send change request',
                        noteLabel: 'Required changes',
                        noteRequired: true,
                        run: (note) => review(submission, 'changes_requested', note),
                      })}
                    >
                      Request changes
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {suggestionQueue.length > 0 && (
            <>
              <h3 className={styles.queueSubtitle}>Suggested corrections</h3>
              <ul className={styles.reviewList}>
                {suggestionQueue.map((suggestion) => (
                  <li key={suggestion.id} className={styles.reviewItem}>
                    <div>
                      <h3>{suggestion.proposed.title}</h3>
                      <p>{suggestion.proposed.subject} · Suggested edit{suggestion.note ? ` · ${suggestion.note}` : ''}</p>
                    </div>
                    <details className={styles.reviewJson}>
                      <summary>Inspect proposed JSON</summary>
                      <pre>{JSON.stringify(suggestion.proposed, null, 2)}</pre>
                    </details>
                    <div className={styles.reviewActions}>
                      <Button variant='primary' size='sm' disabled={communityBusy === suggestion.id} onClick={() => openAdminAction({
                        title: 'Accept and publish this suggestion?',
                        description: 'The suggested chapter version will replace the currently published version immediately.',
                        confirmLabel: 'Accept and publish',
                        noteLabel: 'Review note (optional)',
                        run: (note) => reviewSuggestion(suggestion, 'accepted', note),
                      })}>
                        Accept and publish
                      </Button>
                      <Button variant='secondary' size='sm' disabled={communityBusy === suggestion.id} onClick={() => openAdminAction({
                        title: 'Reject this suggestion?',
                        description: 'No public chapter content will change.',
                        confirmLabel: 'Reject suggestion',
                        noteLabel: 'Reason for rejection (optional)',
                        run: (note) => reviewSuggestion(suggestion, 'rejected', note),
                      })}>
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {adminAction && (
        <div className={styles.adminDialogBackdrop} onMouseDown={() => communityBusy !== 'admin-action' && setAdminAction(null)}>
          <section
            className={styles.adminDialog}
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='admin-action-title'
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Badge tone={adminAction.danger ? 'danger' : 'warning'}>Admin action</Badge>
            <h2 id='admin-action-title'>{adminAction.title}</h2>
            <p>{adminAction.description}</p>
            {adminAction.noteLabel && (
              <label>
                <span>{adminAction.noteLabel}</span>
                <textarea rows={3} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
              </label>
            )}
            {adminAction.confirmationText && (
              <label>
                <span>Type <strong>{adminAction.confirmationText}</strong> to confirm</span>
                <input autoFocus value={adminConfirmation} onChange={(event) => setAdminConfirmation(event.target.value)} autoComplete='off' />
              </label>
            )}
            <div className={styles.adminDialogActions}>
              <Button variant='secondary' disabled={communityBusy === 'admin-action'} onClick={() => setAdminAction(null)}>Cancel</Button>
              <Button
                variant={adminAction.danger ? 'danger' : 'primary'}
                disabled={
                  communityBusy === 'admin-action'
                  || Boolean(adminAction.confirmationText && adminConfirmation !== adminAction.confirmationText)
                  || Boolean(adminAction.noteRequired && !adminNote.trim())
                }
                onClick={() => void runAdminAction()}
              >
                {communityBusy === 'admin-action' ? 'Working…' : adminAction.confirmLabel}
              </Button>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
