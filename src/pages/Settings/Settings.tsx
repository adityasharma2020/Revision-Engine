import { useState, type ReactNode } from "react";
import { Button, Icon, replayFirstVisitTour, Tabs, ThemeToggle } from "../../components/common";
import { AccountPanel } from "../../components/auth/AccountPanel";
import { Page, PageHeader } from "../../components/layout";
import { useStorage } from "../../context/StorageContext";
import { useAuth } from "../../context/AuthContext";
import { createLocalStorageService } from "../../services/storage";
import { APP_NAME, APP_VERSION } from "../../constants/app";
import styles from "./Settings.module.css";
import { useRevisionPreferences } from "../../hooks/useRevisionPreferences";
import { useAppSettings } from "../../context/AppSettingsContext";

export function Settings() {
  const { storage, cloudAvailable, online, syncing, syncNow } = useStorage();
  const { status, signOut } = useAuth();
  const [cleared, setCleared] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'general' | 'features'>('general');
  const { preferences: revisionPreferences, update: updateRevisionPreferences } = useRevisionPreferences();
  const { settings: appSettings, update: updateAppSettings, reset: resetAppSettings } = useAppSettings();

  const clearDeviceOnly = async () => {
    if (cloudAvailable) await signOut();
    await createLocalStorageService().resetAll();
    setCleared(true);
    window.location.reload();
  };

  const clearDeviceAndArchiveCloud = async () => {
    await storage.resetAll();
    setCleared(true);
    window.location.reload();
  };

  const manualSync = async () => {
    setSyncMessage(null);
    try {
      await syncNow();
      setSyncMessage("Synced with Supabase just now.");
    } catch {
      setSyncMessage(
        "Sync failed. Your local data is safe; try again when online."
      );
    }
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow='Settings'
        title='Preferences'
        description='Personalise the app and control how your study data is stored.'
      />

      <div className={styles.settingsTabs}>
        <Tabs items={[{ id: 'general', label: 'General' }, { id: 'features', label: 'Features & alerts' }]} value={tab} onChange={setTab} aria-label='Settings sections' />
      </div>

      {tab === 'general' && <>
      <section className={styles.group}>
        <div className={styles.stack}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Account &amp; sync</h3>
            <p className={styles.rowDesc}>Sign in to continue on any device.</p>
          </div>
          <AccountPanel />
          {status === "authenticated" && cloudAvailable && (
            <div className={styles.syncPanel}>
              <div>
                <strong>Local + Supabase</strong>
                <span>Quiz attempts and responses save locally first, then sync to your account.</span>
                {syncMessage && <small role='status'>{syncMessage}</small>}
              </div>
              <Button
                variant='secondary'
                size='sm'
                disabled={!online || syncing}
                onClick={() => void manualSync()}
              >
                <Icon name='sync' size={15} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.stack}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Daily revision</h3>
            <p className={styles.rowDesc}>Set the maximum queue size and how much unseen material can be introduced.</p>
          </div>
          <div className={styles.revisionFields}>
            <label>
              <span>Daily question capacity</span>
              <select value={revisionPreferences.dailyQuestionLimit} onChange={(event) => updateRevisionPreferences({ ...revisionPreferences, dailyQuestionLimit: Number(event.target.value) })}>
                {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((value) => <option key={value} value={value}>{value} questions</option>)}
              </select>
              <small>This is a maximum. If fewer questions are due, the queue stays smaller.</small>
            </label>
            <label>
              <span>Maximum unseen questions</span>
              <select value={revisionPreferences.newQuestionPercent} onChange={(event) => updateRevisionPreferences({ ...revisionPreferences, newQuestionPercent: Number(event.target.value) })}>
                {[0, 10, 20, 25, 30, 40, 50].map((value) => <option key={value} value={value}>{value}% of queue</option>)}
              </select>
              <small>Due revision always takes priority over unseen questions.</small>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Appearance</h3>
            <p className={styles.rowDesc}>
              Choose light, dark, or follow your system.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Product tour</h3>
            <p className={styles.rowDesc}>A brief overview of the question bank, quizzes, revision and analytics.</p>
          </div>
          <Button variant='secondary' size='sm' onClick={replayFirstVisitTour}>
            <Icon name='sparkle' size={15} /> Replay tour
          </Button>
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <h3 className={styles.rowTitle}>Reset all data</h3>
            <p className={styles.rowDesc}>
              Clear progress, quiz history, responses, bookmarks, imports and
              preferences.
            </p>
          </div>
          <Button
            variant='danger'
            onClick={() => setResetOpen(true)}
            disabled={cleared}
          >
            Reset data
          </Button>
        </div>
      </section>

      {resetOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={() => setResetOpen(false)}
        >
          <section
            className={styles.resetModal}
            role='dialog'
            aria-modal='true'
            aria-labelledby='reset-title'
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.resetIcon}>
              <Icon name='trash' size={20} />
            </span>
            <h2 id='reset-title'>Where should data disappear from?</h2>
            <p>
              Cloud removal is non-destructive: Supabase rows are marked as
              deleted and excluded from the app, while their database history is
              retained.
            </p>
            <div className={styles.resetChoices}>
              <button type='button' onClick={() => void clearDeviceOnly()}>
                <strong>Clear this device</strong>
                <span>
                  {cloudAvailable
                    ? "Signs you out and clears this browser. Supabase data remains available."
                    : "Clears all data stored in this browser."}
                </span>
              </button>
              {cloudAvailable && (
                <button
                  type='button'
                  className={styles.cloudDelete}
                  onClick={() => void clearDeviceAndArchiveCloud()}
                >
                  <strong>
                    Clear device and remove cloud data from the app
                  </strong>
                  <span>
                    Soft-deletes the active Supabase records. No database row or
                    previous version is physically deleted.
                  </span>
                </button>
              )}
            </div>
            <Button variant='ghost' onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
          </section>
        </div>
      )}

      <section className={styles.group}>
        <div className={styles.about}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <h3 className={styles.rowTitle}>About</h3>
              <p className={styles.rowDesc}>{APP_NAME} application version.</p>
            </div>
            <code className={styles.version}>v{APP_VERSION}</code>
          </div>
          <div className={styles.responsibleUse} role='note'>
            <p>
              This is an educational study tool. Only import material you
              created, own, or have permission to use. Respect copyright,
              licences, privacy, and source terms; do not upload or share
              pirated, confidential, or unlawfully copied content. You are
              responsible for the content you import and how you use it.
            </p>
          </div>
          <p className={styles.credit}>
            Made with <Icon name='heart' size={15} className={styles.heart} />{" "}
            by Aditya Sharma.
          </p>
        </div>
      </section>
      </>}

      {tab === 'features' && (
        <div className={styles.preferenceSections}>
          <PreferenceGroup title='Dashboard' description='Choose which optional information appears on your home page.'>
            <ToggleSetting
              title='Weekly activity overview'
              description='Show the compact progress calendar at the top of the dashboard.'
              checked={appSettings.dashboard.showActivityOverview}
              onChange={(checked) => updateAppSettings({ ...appSettings, dashboard: { ...appSettings.dashboard, showActivityOverview: checked } })}
            />
          </PreferenceGroup>

          <PreferenceGroup title='Notifications' description='Choose which study updates you want to receive. Delivery remains off until notifications are enabled.'>
            <ToggleSetting
              title='Allow notifications'
              description='Master control for study reminders and progress updates.'
              checked={appSettings.notifications.enabled}
              onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, enabled: checked } })}
            />
            <ToggleSetting title='Daily revision reminder' description='Remind me when today’s revision is still pending.' checked={appSettings.notifications.dailyRevision} disabled={!appSettings.notifications.enabled} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, dailyRevision: checked } })} />
            <ToggleSetting title='Weekly progress summary' description='Receive a concise summary of questions, accuracy and active days.' checked={appSettings.notifications.weeklySummary} disabled={!appSettings.notifications.enabled} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, weeklySummary: checked } })} />
            <ToggleSetting title='Milestones' description='Celebrate streaks and meaningful learning milestones.' checked={appSettings.notifications.milestones} disabled={!appSettings.notifications.enabled} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, milestones: checked } })} />
          </PreferenceGroup>

          <PreferenceGroup title='Accessibility' description='Comfort settings applied everywhere in the app.'>
            <ToggleSetting title='Reduce motion' description='Minimise interface animations and transitions.' checked={appSettings.accessibility.reduceMotion} onChange={(checked) => updateAppSettings({ ...appSettings, accessibility: { ...appSettings.accessibility, reduceMotion: checked } })} />
          </PreferenceGroup>

          <section className={styles.addonNote}>
            <span><Icon name='plus' size={18} /></span>
            <div><strong>Built for future add-ons</strong><p>Optional tools such as focus timers can be added here without changing your core study workflow.</p></div>
          </section>
          <button type='button' className={styles.resetPreferences} onClick={resetAppSettings}>Restore feature defaults</button>
        </div>
      )}
    </Page>
  );
}

function PreferenceGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={styles.preferenceGroup}><header><h2>{title}</h2><p>{description}</p></header><div>{children}</div></section>;
}

function ToggleSetting({ title, description, checked, disabled = false, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`${styles.toggleRow} ${disabled ? styles.disabled : ''}`}>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type='checkbox' checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden='true' />
    </label>
  );
}
