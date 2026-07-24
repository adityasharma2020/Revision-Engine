import { Link } from 'react-router-dom';
import { Routes } from '../../../constants/routes';
import { subjectStyle } from '../../../constants/subjects';
import type { ChapterSummary } from '../../../types';
import { Badge } from '../../common/Badge';
import { Icon } from '../../common/Icon';
import styles from './ChapterCard.module.css';

interface ChapterCardProps {
  chapter: ChapterSummary;
}

export function ChapterCard({ chapter }: ChapterCardProps) {
  const { hue, label } = subjectStyle(chapter.subject);

  return (
    <Link to={Routes.chapter(chapter.id)} className={styles.card}>
      <div className={styles.top}>
        <div className={styles.badges}>
          <Badge hue={hue}>{label}</Badge>
          {chapter.origin === 'public' && <Badge tone='accent'>Public</Badge>}
          {chapter.origin === 'user' && <Badge tone='neutral'>Private</Badge>}
        </div>
        <span className={styles.number}>Ch {chapter.chapterNumber}</span>
      </div>

      <h3 className={styles.title}>{chapter.title}</h3>
      {chapter.description && (
        <p className={styles.description}>{chapter.description}</p>
      )}

      <div className={styles.footer}>
        <span className={styles.stat}>{chapter.prelimsCount} prelims</span>
        <span className={styles.dot} />
        <span className={styles.stat}>{chapter.mainsCount} mains</span>
        <Icon name="chevronRight" size={16} className={styles.arrow} />
      </div>
    </Link>
  );
}
