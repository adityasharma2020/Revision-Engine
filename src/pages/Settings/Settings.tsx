import { useEffect, useState, type ReactNode } from "react";
import { Link } from 'react-router-dom';
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
import { disableWebPush, enableWebPush, getPushStatus, sendTestNotification } from '../../services/notifications';
import { loadNudgePreferences, saveNudgePreferences } from '../../services/nudges';
import { DEFAULT_NUDGE_PREFERENCES, type NudgePreferences } from '../../types';
import { Routes } from '../../constants/routes';

export function Settings() {
  const { storage, cloudAvailable, online, syncing, syncNow } = useStorage();
  const { status, signOut } = useAuth();
  const [cleared, setCleared] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'general' | 'features'>('general');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [nudgeSettingsOpen, setNudgeSettingsOpen] = useState(false);
  const { preferences: revisionPreferences, update: updateRevisionPreferences } = useRevisionPreferences();
  const { settings: appSettings, update: updateAppSettings, reset: resetAppSettings } = useAppSettings();
  const pushStatus = getPushStatus(status === 'authenticated');
  const notificationsReady = appSettings.notifications.enabled && pushStatus === 'granted';

  const setNotificationsEnabled = async (enabled: boolean) => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (!enabled) {
        await disableWebPush();
        updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, enabled: false } });
        setPushMessage('Notifications disabled on this device.');
        return;
      }
      const nextStatus = await enableWebPush();
      if (nextStatus !== 'granted') {
        const messages = { unsupported: 'This browser does not support Web Push.', 'install-required': 'On iPhone or iPad, add this app to the Home Screen and open it from its icon first.', unconfigured: 'Web Push needs its public VAPID key.', 'signed-out': 'Sign in before enabling cross-device notifications.', denied: 'Notifications are blocked in browser settings.', prompt: 'Notification permission was not granted.', granted: '' };
        setPushMessage(messages[nextStatus]);
        return;
      }
      updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, enabled: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } });
      setPushMessage('This device is subscribed. Send a test to confirm delivery.');
    } catch (error) {
      updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, enabled: false } });
      setPushMessage(error instanceof Error ? error.message : 'Could not configure notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try { await sendTestNotification(); setPushMessage('Test sent to your subscribed devices.'); }
    catch (error) { setPushMessage(error instanceof Error ? error.message : 'Test delivery failed.'); }
    finally { setPushBusy(false); }
  };

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
              description={`Master control for study reminders and progress updates · ${pushStatus === 'granted' ? 'browser allowed' : pushStatus.replace('-', ' ')}`}
              checked={notificationsReady}
              disabled={pushBusy}
              onChange={(checked) => void setNotificationsEnabled(checked)}
            />
            <ToggleSetting title='Daily revision reminder' description='Remind me when today’s revision is still pending.' checked={appSettings.notifications.dailyRevision} disabled={!notificationsReady} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, dailyRevision: checked } })} />
            <ToggleSetting title='Weekly progress summary' description='Receive a concise summary of questions, accuracy and active days.' checked={appSettings.notifications.weeklySummary} disabled={!notificationsReady} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, weeklySummary: checked } })} />
            <ToggleSetting title='Milestones' description='Celebrate streaks and meaningful learning milestones.' checked={appSettings.notifications.milestones} disabled={!notificationsReady} onChange={(checked) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, milestones: checked } })} />
            <div className={`${styles.notificationSchedule} ${!notificationsReady ? styles.disabled : ''}`}>
              <label><span>Daily reminder</span><input type='time' value={appSettings.notifications.dailyReminderTime} disabled={!notificationsReady} onChange={(event) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, dailyReminderTime: event.target.value } })} /></label>
              <label><span>Weekly summary</span><select value={appSettings.notifications.weeklySummaryDay} disabled={!notificationsReady} onChange={(event) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, weeklySummaryDay: Number(event.target.value) } })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
              <label><span>Summary time</span><input type='time' value={appSettings.notifications.weeklySummaryTime} disabled={!notificationsReady} onChange={(event) => updateAppSettings({ ...appSettings, notifications: { ...appSettings.notifications, weeklySummaryTime: event.target.value } })} /></label>
              <small>Times use {appSettings.notifications.timezone || 'UTC'}.</small>
            </div>
            <div className={styles.pushActions}><Button size='sm' variant='secondary' disabled={pushBusy || !notificationsReady} onClick={() => void testPush()}>Send test notification</Button>{pushMessage && <small role='status'>{pushMessage}</small>}</div>
          </PreferenceGroup>

          <PreferenceGroup title='Accessibility' description='Comfort settings applied everywhere in the app.'>
            <ToggleSetting title='Reduce motion' description='Minimise interface animations and transitions.' checked={appSettings.accessibility.reduceMotion} onChange={(checked) => updateAppSettings({ ...appSettings, accessibility: { ...appSettings.accessibility, reduceMotion: checked } })} />
          </PreferenceGroup>

          <section className={styles.addonCard}>
            <span><Icon name='sparkle' size={20} /></span>
            <div><em>ADD-ON</em><strong>Memory Nudges</strong><p>Bring important facts, quotes and mistakes back through weighted, adaptive notifications.</p></div>
            <Button variant='primary' size='sm' disabled={status !== 'authenticated'} onClick={() => setNudgeSettingsOpen(true)}>Configure</Button>
          </section>
          {status !== 'authenticated' && <small className={styles.addonHelp}>Sign in to configure private, synced nudges.</small>}
          <button type='button' className={styles.resetPreferences} onClick={resetAppSettings}>Restore feature defaults</button>
        </div>
      )}
      {nudgeSettingsOpen && <NudgeSettingsDialog onClose={() => setNudgeSettingsOpen(false)} />}
    </Page>
  );
}

function NudgeSettingsDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<NudgePreferences>(DEFAULT_NUDGE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { void loadNudgePreferences().then(setValue).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load settings.')).finally(() => setLoading(false)); }, []);
  const save = async () => { setSaving(true); try { await saveNudgePreferences({ ...value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }); onClose(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); } finally { setSaving(false); } };
  const toggleDay = (day: number) => setValue({ ...value, deliveryDays: value.deliveryDays.includes(day) ? value.deliveryDays.filter((item) => item !== day) : [...value.deliveryDays, day].sort() });
  return <div className={styles.modalBackdrop} onMouseDown={onClose}><section className={styles.nudgeModal} role='dialog' aria-modal='true' aria-labelledby='nudge-settings-title' onMouseDown={(event) => event.stopPropagation()}><header><div><span>Memory Nudges add-on</span><h2 id='nudge-settings-title'>Control what returns—and when</h2><p>Weighted selection favours crucial and forgotten items while cooldowns prevent repetition.</p></div><button onClick={onClose} aria-label='Close'><Icon name='close' /></button></header>{loading ? <p>Loading preferences…</p> : <div className={styles.nudgeControls}><ToggleSetting title='Enable Memory Nudges' description='Allow the dispatcher to select and deliver eligible nudges.' checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} /><div className={styles.controlGrid}><label>Maximum per day<select value={value.maxPerDay} onChange={(event) => setValue({ ...value, maxPerDay: Number(event.target.value) })}>{[1,2,3,4,5,6,8].map((item) => <option key={item}>{item}</option>)}</select></label><label>Default priority<select value={value.defaultPriority} onChange={(event) => setValue({ ...value, defaultPriority: Number(event.target.value) })}>{[1,2,3,4,5].map((item) => <option key={item}>{item}</option>)}</select></label><label>Global minimum cooldown<select value={value.minimumCooldownHours} onChange={(event) => setValue({ ...value, minimumCooldownHours: Number(event.target.value) })}>{[6,12,24,48,72,168].map((item) => <option value={item} key={item}>{item < 24 ? `${item} hours` : `${item / 24} days`}</option>)}</select></label></div><fieldset><legend>Delivery days</legend><div className={styles.dayPicker}>{['S','M','T','W','T','F','S'].map((label, day) => <button type='button' className={value.deliveryDays.includes(day) ? styles.selectedDay : ''} onClick={() => toggleDay(day)} key={`${label}-${day}`}>{label}</button>)}</div></fieldset><fieldset><legend>Delivery windows</legend><div className={styles.windows}>{value.windows.map((window, index) => <div key={index}><input type='time' value={window.start} onChange={(event) => setValue({ ...value, windows: value.windows.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item) })} /><span>to</span><input type='time' value={window.end} onChange={(event) => setValue({ ...value, windows: value.windows.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item) })} />{value.windows.length > 1 && <button type='button' onClick={() => setValue({ ...value, windows: value.windows.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}</div>)}</div>{value.windows.length < 3 && <button type='button' className={styles.addWindow} onClick={() => setValue({ ...value, windows: [...value.windows, { start: '12:00', end: '14:00' }] })}>+ Add another window</button>}</fieldset><fieldset><legend>Quiet hours</legend><div className={styles.quiet}><input type='time' value={value.quietStart} onChange={(event) => setValue({ ...value, quietStart: event.target.value })} /><span>to</span><input type='time' value={value.quietEnd} onChange={(event) => setValue({ ...value, quietEnd: event.target.value })} /></div></fieldset><ToggleSetting title='Adaptive scheduling' description='Remembered items wait longer; forgotten items return sooner.' checked={value.adaptiveScheduling} onChange={(adaptiveScheduling) => setValue({ ...value, adaptiveScheduling })} /><ToggleSetting title='Complete the pool before repeats' description='Prefer unseen eligible nudges before starting another cycle.' checked={value.avoidRepeatsUntilCycle} onChange={(avoidRepeatsUntilCycle) => setValue({ ...value, avoidRepeatsUntilCycle })} /><ToggleSetting title='Private lock-screen text' description='Hide nudge content until the notification is opened.' checked={value.privacyMode} onChange={(privacyMode) => setValue({ ...value, privacyMode })} /><p className={styles.timezone}>Scheduling timezone: {value.timezone}</p></div>}{message && <small className={styles.dialogError}>{message}</small>}<footer><Link to={Routes.nudges} onClick={onClose}>Manage nudge library</Link><div><Button onClick={onClose}>Cancel</Button><Button variant='primary' disabled={loading || saving || value.deliveryDays.length === 0 || value.windows.length === 0} onClick={() => void save()}>{saving ? 'Saving…' : 'Save add-on'}</Button></div></footer></section></div>;
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
