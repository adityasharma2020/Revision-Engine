import { Link, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Badge, EmptyState, Icon } from '../../components/common';
import { Page, PageHeader } from '../../components/layout';
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

export function Search() {
  const state = useSearchIndex();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const chapterId = params.get('chapter') ?? '';
  const type = (params.get('type') ?? 'all') as SearchDocumentType | 'all';
  const origin = (params.get('origin') ?? 'all') as 'all' | 'fyq' | 'pyq' | 'other';
  const tag = params.get('tag') ?? '';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Knowledge search"
        title="Search your library"
        description="Search chapters, questions, answers, explanations, tags, FYQs and PYQs—even offline."
      />
      <div className={styles.searchBox}>
        <Icon name="search" size={20} />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => update('q', event.target.value)}
          placeholder="Search a topic, fact, tag, question…"
          aria-label="Search your revision library"
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => update('q', '')}>
            Clear
          </button>
        )}
      </div>

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
                        <Link key={hit.id} to={destination} className={styles.result}>
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
    </Page>
  );
}
