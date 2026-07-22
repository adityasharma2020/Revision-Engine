import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { subjectStyle } from '../../constants/subjects';
import { useUserData } from '../../context/UserDataContext';
import { ChapterParseError, parseChapter } from '../../services/parser';
import type { Chapter } from '../../types';
import styles from './Import.module.css';

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

export function Import() {
  const navigate = useNavigate();
  const { userChapters, addUserChapter, removeUserChapter } = useUserData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validate = (text: string) => {
    setRaw(text);
    setParsed(null);
    setError(null);
    if (text.trim() === '') return;
    try {
      const chapter = parseChapter(JSON.parse(text));
      setParsed(chapter);
    } catch (err) {
      if (err instanceof ChapterParseError) {
        setError(`${err.message}${err.path ? ` — at ${err.path}` : ''}`);
      } else if (err instanceof SyntaxError) {
        setError(`Invalid JSON — ${err.message}`);
      } else {
        setError('Could not read this file.');
      }
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => validate(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const save = () => {
    if (!parsed) return;
    const clash = userChapters.some((c) => c.id === parsed.id);
    if (clash && !window.confirm(`A chapter with id "${parsed.id}" exists. Replace it?`)) {
      return;
    }
    addUserChapter(parsed);
    navigate(Routes.chapter(parsed.id));
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Import"
        title="Add your own chapter"
        description="Upload or paste a chapter JSON. It's validated, saved to your library, and synced to your account."
      />

      <div className={styles.dropzone}>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className={styles.dropInner}>
          <Icon name="plus" size={22} />
          <p>Choose a <code>.json</code> file, or paste below.</p>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Choose file
          </Button>
        </div>
      </div>

      <label className={styles.pasteLabel}>
        <span>Or paste JSON</span>
        <button
          type="button"
          className={styles.templateBtn}
          onClick={() => validate(TEMPLATE)}
        >
          Insert template
        </button>
      </label>
      <textarea
        className={styles.textarea}
        value={raw}
        rows={12}
        spellCheck={false}
        placeholder="Paste chapter JSON here…"
        onChange={(e) => validate(e.target.value)}
      />

      {error && (
        <div className={styles.error}>
          <Icon name="close" size={16} />
          <span>{error}</span>
        </div>
      )}

      {parsed && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            <Badge hue={subjectStyle(parsed.subject).hue}>
              {subjectStyle(parsed.subject).label}
            </Badge>
            <Icon name="check" size={18} className={styles.validIcon} />
          </div>
          <h3 className={styles.previewTitle}>{parsed.title}</h3>
          <p className={styles.previewMeta}>
            Chapter {parsed.chapterNumber} · {parsed.prelims.length} prelims ·{' '}
            {parsed.mains.length} mains
          </p>
          <Button variant="primary" onClick={save}>
            Add to library
          </Button>
        </div>
      )}

      <section className={styles.existing}>
        <h2 className={styles.existingTitle}>Your uploads</h2>
        {userChapters.length === 0 ? (
          <EmptyState
            icon="book"
            title="No uploads yet"
            description="Chapters you import appear here and in your library."
          />
        ) : (
          <ul className={styles.list}>
            {userChapters.map((c) => (
              <li key={c.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemMain}
                  onClick={() => navigate(Routes.chapter(c.id))}
                >
                  <span className={styles.itemTitle}>{c.title}</span>
                  <span className={styles.itemMeta}>
                    {subjectStyle(c.subject).label} · {c.prelims.length}P ·{' '}
                    {c.mains.length}M
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  title="Remove"
                  onClick={() => {
                    if (window.confirm(`Remove "${c.title}" from your library?`)) {
                      removeUserChapter(c.id);
                    }
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
