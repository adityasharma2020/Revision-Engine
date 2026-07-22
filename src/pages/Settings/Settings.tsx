import { useState } from 'react';
import { Button, ThemeToggle } from '../../components/common';
import { AccountPanel } from '../../components/auth/AccountPanel';
import { Page, PageHeader } from '../../components/layout';
import { useStorage } from '../../context/StorageContext';
import styles from './Settings.module.css';

export function Settings() {
  const { storage } = useStorage();
  const [cleared, setCleared] = useState(false);

  const resetAll = async () => {
    const confirmed = window.confirm(
      'This permanently deletes all revision progress, bookmarks and preferences on this device. Continue?',
    );
    if (!confirmed) return;
    await storage.resetAll();
    setCleared(true);
    window.location.reload();
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Personalise the app. Everything is stored locally on this device."
      />

      <section className={styles.group}>
        <div className={styles.stack}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Account &amp; sync</h3>
            <p className={styles.rowDesc}>
              Sign in to continue on any device.
            </p>
          </div>
          <AccountPanel />
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Appearance</h3>
            <p className={styles.rowDesc}>Choose light, dark, or follow your system.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Reset all data</h3>
            <p className={styles.rowDesc}>
              Clear progress, bookmarks and preferences from this browser.
            </p>
          </div>
          <Button variant="danger" onClick={resetAll} disabled={cleared}>
            Reset data
          </Button>
        </div>
      </section>
    </Page>
  );
}
