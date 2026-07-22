import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AsyncBoundary, Button, EmptyState } from '../../components/common';
import { SubjectSection } from '../../components/dashboard/SubjectSection';
import { Page, PageHeader } from '../../components/layout';
import { APP_TAGLINE } from '../../constants/app';
import { Routes } from '../../constants/routes';
import { useLibrary } from '../../hooks/useChapters';
import type { ChapterSummary } from '../../types';
import { groupBySubject } from '../../utils/chapters';

export function Library() {
  const state = useLibrary();
  return <Page><AsyncBoundary state={state} loadingLabel="Loading your library…">{(chapters) => <Content chapters={chapters} />}</AsyncBoundary></Page>;
}

function Content({ chapters }: { chapters: readonly ChapterSummary[] }) {
  const navigate = useNavigate();
  const groups = useMemo(() => groupBySubject(chapters), [chapters]);
  const totals = chapters.reduce((value, chapter) => ({
    prelims: value.prelims + chapter.prelimsCount,
    mains: value.mains + chapter.mainsCount,
  }), { prelims: 0, mains: 0 });
  if (chapters.length === 0) return <EmptyState icon="book" title="No chapters yet" description="Import your first chapter to build your revision library." action={<Button variant="primary" onClick={() => navigate(Routes.import)}>Import a chapter</Button>} />;
  return <><PageHeader eyebrow="Library" title="Your revision library" description={`${APP_TAGLINE} ${chapters.length} chapters · ${totals.prelims} prelims · ${totals.mains} mains.`} />{groups.map((group) => <SubjectSection key={group.subject} group={group} />)}</>;
}
