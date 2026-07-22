import type { SubjectGroup } from '../../../utils/chapters';
import { ChapterCard } from '../ChapterCard';
import styles from './SubjectSection.module.css';

interface SubjectSectionProps {
  group: SubjectGroup;
}

export function SubjectSection({ group }: SubjectSectionProps) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <span className={styles.dot} style={{ backgroundColor: `hsl(${group.hue} 60% 50%)` }} />
        <h2 className={styles.title}>{group.label}</h2>
        <span className={styles.count}>{group.chapters.length}</span>
      </header>
      <div className={styles.grid}>
        {group.chapters.map((chapter) => (
          <ChapterCard key={chapter.id} chapter={chapter} />
        ))}
      </div>
    </section>
  );
}
