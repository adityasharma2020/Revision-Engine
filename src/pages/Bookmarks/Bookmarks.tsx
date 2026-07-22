import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AsyncBoundary, Badge, EmptyState, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
import { Routes } from '../../constants/routes';
import { subjectStyle } from '../../constants/subjects';
import { useBookmarks, type ResolvedBookmark } from '../../hooks/useBookmarks';
import styles from './Bookmarks.module.css';

interface ChapterGroup {
  chapterId: string;
  chapterTitle: string;
  subject: string;
  items: ResolvedBookmark[];
}

function groupByChapter(bookmarks: ResolvedBookmark[]): ChapterGroup[] {
  const map = new Map<string, ChapterGroup>();
  for (const b of bookmarks) {
    const group = map.get(b.chapterId) ?? {
      chapterId: b.chapterId,
      chapterTitle: b.chapterTitle,
      subject: b.subject,
      items: [],
    };
    group.items.push(b);
    map.set(b.chapterId, group);
  }
  return [...map.values()];
}

export function Bookmarks() {
  const state = useBookmarks();

  return (
    <Page>
      <PageHeader
        eyebrow="Bookmarks"
        title="Saved for revision"
        description="Questions you have flagged to revisit, gathered by chapter."
      />
      <AsyncBoundary state={state} loadingLabel="Loading bookmarks…">
        {(bookmarks) => <BookmarksList bookmarks={bookmarks} />}
      </AsyncBoundary>
    </Page>
  );
}

function BookmarksList({ bookmarks }: { bookmarks: ResolvedBookmark[] }) {
  const groups = useMemo(() => groupByChapter(bookmarks), [bookmarks]);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="No bookmarks yet"
        description="Bookmark a tricky question from any chapter and it will show up here."
      />
    );
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        const { hue, label } = subjectStyle(group.subject);
        return (
          <section key={group.chapterId} className={styles.group}>
            <header className={styles.groupHead}>
              <Badge hue={hue}>{label}</Badge>
              <Link to={Routes.chapter(group.chapterId)} className={styles.groupTitle}>
                {group.chapterTitle}
                <Icon name="chevronRight" size={15} />
              </Link>
            </header>
            <div className={styles.items}>
              {group.items.map((item) => (
                <Link
                  key={item.questionId}
                  to={Routes.chapter(item.chapterId)}
                  className={styles.item}
                >
                  <span className={styles.itemType}>{item.type}</span>
                  <div className={styles.itemBody}>
                    <p className={styles.itemText}>{item.text}</p>
                    {item.note && <p className={styles.itemNote}>{item.note}</p>}
                    {item.tags.length > 0 && (
                      <div className={styles.itemTags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
