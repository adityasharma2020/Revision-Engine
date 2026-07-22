import { useState } from 'react';
import { useUserData } from '../../../context/UserDataContext';
import type { QuestionType } from '../../../types';
import { Badge } from '../../common/Badge';
import { Icon } from '../../common/Icon';
import { cx } from '../../../utils/cx';
import styles from './QuestionAnnotations.module.css';

interface QuestionAnnotationsProps {
  chapterId: string;
  questionId: string;
  type: QuestionType;
  /** Tags baked into the question JSON (read-only). */
  baseTags?: readonly string[];
}

/**
 * The personal-overlay controls for a single question: bookmark, free-text
 * note and user-added tags. All changes persist instantly via UserDataContext.
 */
export function QuestionAnnotations({
  chapterId,
  questionId,
  type,
  baseTags = [],
}: QuestionAnnotationsProps) {
  const { getAnnotation, toggleBookmark, setNote, addTag, removeTag } = useUserData();
  const annotation = getAnnotation(chapterId, questionId);
  const bookmarked = annotation?.bookmarked ?? false;
  const note = annotation?.note ?? '';
  const userTags = annotation?.tags ?? [];

  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(note);
  const [tagDraft, setTagDraft] = useState('');

  const openNote = () => {
    setDraft(note);
    setEditingNote(true);
  };
  const saveNote = () => {
    setNote(chapterId, questionId, type, draft.trim());
    setEditingNote(false);
  };

  const commitTag = () => {
    if (tagDraft.trim()) addTag(chapterId, questionId, type, tagDraft);
    setTagDraft('');
  };

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button
          type="button"
          className={cx(styles.action, bookmarked && styles.bookmarked)}
          onClick={() => toggleBookmark(chapterId, questionId, type)}
          aria-pressed={bookmarked}
        >
          <Icon name="bookmark" size={15} className={bookmarked ? styles.filled : undefined} />
          {bookmarked ? 'Saved' : 'Bookmark'}
        </button>

        <button type="button" className={styles.action} onClick={openNote}>
          <Icon name="pencil" size={15} />
          {note ? 'Edit note' : 'Add note'}
        </button>
      </div>

      <div className={styles.tags}>
        {baseTags.map((tag) => (
          <Badge key={`base-${tag}`} tone="neutral">
            {tag}
          </Badge>
        ))}
        {userTags.map((tag) => (
          <button
            key={`user-${tag}`}
            type="button"
            className={styles.userTag}
            onClick={() => removeTag(chapterId, questionId, type, tag)}
            title="Remove tag"
          >
            {tag}
            <Icon name="close" size={12} />
          </button>
        ))}
        <input
          className={styles.tagInput}
          value={tagDraft}
          placeholder="+ tag"
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTag();
            }
          }}
          onBlur={commitTag}
          aria-label="Add a tag"
        />
      </div>

      {editingNote ? (
        <div className={styles.noteEditor}>
          <textarea
            className={styles.noteField}
            value={draft}
            autoFocus
            rows={3}
            placeholder="Write a personal note for this question…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className={styles.noteActions}>
            <button type="button" className={styles.noteSave} onClick={saveNote}>
              Save note
            </button>
            <button
              type="button"
              className={styles.noteCancel}
              onClick={() => setEditingNote(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        note && (
          <button type="button" className={styles.notePreview} onClick={openNote}>
            <Icon name="pencil" size={14} />
            <span>{note}</span>
          </button>
        )
      )}
    </div>
  );
}
