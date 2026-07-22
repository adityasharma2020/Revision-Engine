import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Badge, EmptyState, Icon } from '../../components/common';
import { Page } from '../../components/layout/Page/Page';
import { PageHeader } from '../../components/layout/PageHeader/PageHeader';
import { Routes } from '../../constants/routes';
import { useSearchIndex } from '../../hooks/useSearchIndex';
import { formatQuestionOrigin } from '../../utils/questionOrigin';
import { searchIndex, type SearchDocumentType } from '../../utils/search';
import styles from './Search.module.css';

const TYPE_LABEL: Record<SearchDocumentType, string> = {
  chapter: 'Chapter',
  prelims: 'Prelims',
  mains: 'Mains',
};

interface SearchProps {
  overlay?: boolean;
  onNavigate?: () => void;
}

export function Search({ overlay = false, onNavigate }: SearchProps = {}) {
  const state = useSearchIndex();
  const [routeParams, setRouteParams] = useSearchParams();
  const [overlayParams, setOverlayParams] = useState(() => new URLSearchParams());
  const params = overlay ? overlayParams : routeParams;
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);
  const [searchError, setSearchError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const chapterId = params.get('chapter') ?? '';
  const type = (params.get('type') ?? 'all') as SearchDocumentType | 'all';
  const origin = (params.get('origin') ?? 'all') as 'all' | 'fyq' | 'pyq' | 'other';
  const tag = params.get('tag') ?? '';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (overlay) setOverlayParams(next);
    else setRouteParams(next, { replace: true });
  };

  useEffect(() => setDraft(query), [query]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = draft.trim();
    if (clean.length > 0 && clean.length < 3) {
      setSearchError('Enter at least 3 characters to search.');
      return;
    }
    setSearchError('');
    update('q', clean);
    inputRef.current?.blur();
  };

  const clearSearch = () => {
    setDraft('');
    setSearchError('');
    update('q', '');
    inputRef.current?.focus();
  };

  const content = (
    <>
      <form className={styles.searchBox} onSubmit={submitSearch}>
        <Icon name="search" size={20} />
        <input
          ref={inputRef}
          autoFocus
          type="search"
          enterKeyHint="search"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (searchError) setSearchError('');
          }}
          placeholder="Search a topic, fact, tag, question…"
          aria-label="Search your revision library"
          aria-describedby={searchError ? 'search-error' : undefined}
        />
        {draft && (
          <button type="button" className={styles.clear} onClick={clearSearch}>
            Clear
          </button>
        )}
        <button type="submit" className={styles.submit}>Search</button>
      </form>
      {searchError && <p id="search-error" className={styles.searchError}>{searchError}</p>}

      <AsyncBoundary state={state} loadingLabel="Building your search index…">
        {(index) => {
          const chapters = [...new Map(index.map((item) => [item.chapterId, {
            id: item.chapterId,
            title: item.chapterTitle,
          }])).values()].sort((a, b) => a.title.localeCompare(b.title));
          const availableTags = [...new Set(index
            .filter((item) => !chapterId || item.chapterId === chapterId)
            .flatMap((item) => item.tags))].sort();
          const hits = searchIndex(index, query, { chapterId, type, origin, tag });
          const searching = Boolean(query.trim() || chapterId || type !== 'all' || origin !== 'all' || tag);

          return (
            <>
              <div className={styles.filters}>
                <label>
                  <span>Chapter</span>
                  <select value={chapterId} onChange={(e) => update('chapter', e.target.value)}>
                    <option value="">All chapters</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Content</span>
                  <select value={type} onChange={(e) => update('type', e.target.value)}>
                    <option value="all">Everything</option>
                    <option value="chapter">Chapters</option>
                    <option value="prelims">Prelims</option>
                    <option value="mains">Mains</option>
                  </select>
                </label>
                <label>
                  <span>Source</span>
                  <select value={origin} onChange={(e) => update('origin', e.target.value)}>
                    <option value="all">All sources</option>
                    <option value="fyq">FYQ</option>
                    <option value="pyq">PYQ</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span>Tag</span>
                  <select value={tag} onChange={(e) => update('tag', e.target.value)}>
                    <option value="">All tags</option>
                    {availableTags.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              {!searching ? (
                <EmptyState icon="search" title="Search across everything" description="Try a topic such as mansabdari, choose a tag, or narrow the search to one chapter." />
              ) : hits.length === 0 ? (
                <EmptyState icon="search" title="No matching results" description="Try fewer words or clear one of the filters." />
              ) : (
                <section className={styles.results} aria-live="polite">
                  <div className={styles.resultHead}>
                    <strong>{hits.length} result{hits.length === 1 ? '' : 's'}</strong>
                    <span>Best matches first</span>
                  </div>
                  <div className={styles.list}>
                    {hits.map((hit) => {
                      const questionId = hit.id.split(':').slice(2).join(':');
                      const destination = hit.type === 'chapter'
                        ? Routes.chapter(hit.chapterId)
                        : `${Routes.chapter(hit.chapterId)}?tab=${hit.type}#question-${questionId}`;
                      return (
                        <Link key={hit.id} to={destination} className={styles.result} onClick={onNavigate}>
                          <div className={styles.resultMeta}>
                            <Badge tone="neutral">{TYPE_LABEL[hit.type]}</Badge>
                            {hit.origin && <Badge tone={hit.origin.toUpperCase().startsWith('PYQ') ? 'accent' : 'neutral'}>{formatQuestionOrigin(hit.origin)}</Badge>}
                            {hit.year && <Badge tone="neutral">{hit.year}</Badge>}
                          </div>
                          <h2>{hit.title}</h2>
                          {hit.snippet && <p>{hit.snippet}</p>}
                          <div className={styles.context}>
                            <span>{hit.subject}</span><span>·</span><span>{hit.chapterTitle}</span>
                          </div>
                          {hit.tags.length > 0 && <div className={styles.tags}>{hit.tags.map((value) => <span key={value}>#{value}</span>)}</div>}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </>
  );

  if (overlay) return <div className={styles.overlayContent}>{content}</div>;

  return (
    <Page>
      <PageHeader
        eyebrow="Knowledge search"
        title="Search your library"
        description="Search chapters, questions, answers, explanations, tags, FYQs and PYQs—even offline."
      />
      {content}
    </Page>
  );
}
