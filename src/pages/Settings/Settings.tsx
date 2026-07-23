import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Icon, replayFirstVisitTour, Tabs, ThemeToggle } from '../../components/common';
import { AccountPanel } from '../../components/auth/AccountPanel';
import { Page, PageHeader } from '../../components/layout';
import { useStorage } from '../../context/StorageContext';
import { useAuth } from '../../context/AuthContext';
import { createLocalStorageService } from '../../services/storage';
import { APP_BUILD_TIMESTAMP, APP_NAME, APP_VERSION } from '../../constants/app';
import styles from './Settings.module.css';
import { useRevisionPreferences } from '../../hooks/useRevisionPreferences';
import { useAppSettings } from '../../context/AppSettingsContext';
import { disableWebPush, enableWebPush, getPushStatus, sendTestNotification, syncWebPushSubscription } from '../../services/notifications';
import { loadNudgePreferences, saveNudgePreferences } from '../../services/nudges';
import { DEFAULT_NUDGE_PREFERENCES, type NudgePreferences } from '../../types';
import { Routes } from '../../constants/routes';
import { getPwaInstallState, requestPwaInstall, subscribeToPwaInstall } from '../../services/pwa/InstallService';
import { useDeviceNotificationSettings } from '../../context/DeviceNotificationSettingsContext';
import type { DeviceNotificationSettings } from '../../services/notifications';
import { clearAllPdfAnnotations } from '../../services/pdf/PdfAnnotationStore';
import { clearStoredWorkspacePdfs } from '../../services/pdf/PdfWorkspaceStore';

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { storage, cloudAvailable, online, syncing, syncNow } = useStorage();
  const { status, signOut } = useAuth();
  const [cleared, setCleared] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'general' | 'alerts' | 'addons'>('general');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [nudgeSettingsOpen, setNudgeSettingsOpen] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [refreshingApp, setRefreshingApp] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const installState = useSyncExternalStore(subscribeToPwaInstall, getPwaInstallState, getPwaInstallState);
  const { preferences: revisionPreferences, update: updateRevisionPreferences } = useRevisionPreferences();
  const { settings: appSettings, update: updateAppSettings, reset: resetAppSettings } = useAppSettings();
  const { settings: deviceNotifications, update: updateDeviceNotifications } = useDeviceNotificationSettings();
  const pushStatus = getPushStatus(status === 'authenticated');
  const notificationsReady = deviceNotifications.enabled && pushStatus === 'granted';

  const saveDeviceNotifications = (next: DeviceNotificationSettings) => {
    updateDeviceNotifications(next);
  };

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'alerts' || requestedTab === 'features') setTab('alerts');
    if (requestedTab === 'addons') setTab('addons');
    if (searchParams.get('nudge') === '1') { setTab('addons'); setNudgeSettingsOpen(true); }
  }, [searchParams]);

  const closeNudgeSettings = () => {
    setNudgeSettingsOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('nudge');
    setSearchParams(next, { replace: true });
  };

  const installPwa = async () => {
    if (installState === 'installed') return;
    const result = await requestPwaInstall();
    setInstallMessage(result === 'accepted' ? 'Revision Engine was installed.' : result === 'dismissed' ? 'Installation was cancelled.' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'On iPhone or iPad: Share → Add to Home Screen.' : 'Open your browser menu and choose Install app or Add to Home screen.');
  };

  const refreshApplication = async () => {
    if (refreshingApp) return;
    setRefreshingApp(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async (registration) => {
          await registration.update();
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        }));
      }
      // Chapter JSON uses a separate stale-while-revalidate cache. Removing
      // only that cache forces fresh content without touching local app data.
      if ('caches' in window) await caches.delete('chapter-content');
    } finally {
      window.location.reload();
    }
  };

  const setNotificationsEnabled = async (enabled: boolean) => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (!enabled) {
        const next = { ...deviceNotifications, enabled: false };
        await disableWebPush(next);
        updateDeviceNotifications(next);
        setPushMessage('Notifications disabled on this device.');
        return;
      }
      const next = {
        ...deviceNotifications,
        enabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      };
      const nextStatus = await enableWebPush(next);
      if (nextStatus !== 'granted') {
        const messages = {
          unsupported: 'This browser does not support Web Push.',
          'install-required': 'On iPhone or iPad, add this app to the Home Screen and open it from its icon first.',
          unconfigured: 'Web Push needs its public VAPID key.',
          'signed-out': 'Sign in before enabling cross-device notifications.',
          denied: 'Notifications are blocked in browser settings.',
          prompt: 'Notification permission was not granted.',
          granted: '',
        };
        setPushMessage(messages[nextStatus]);
        return;
      }
      updateDeviceNotifications(next);
      setPushMessage('This device is subscribed. Send a test to confirm delivery.');
    } catch (error) {
      updateDeviceNotifications({ ...deviceNotifications, enabled: false });
      setPushMessage(error instanceof Error ? error.message : 'Could not configure notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      const currentStatus = await syncWebPushSubscription(deviceNotifications);
      if (currentStatus !== 'granted') throw new Error('Enable notifications on this device before sending a test.');
      const delivered = await sendTestNotification();
      setPushMessage(`Test delivered to ${delivered} active device${delivered === 1 ? '' : 's'}.`);
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Test delivery failed.');
    } finally {
      setPushBusy(false);
    }
  };

  const previewMotivation = async () => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      const currentStatus = await syncWebPushSubscription(deviceNotifications);
      if (currentStatus !== 'granted') throw new Error('Enable notifications on this device before sending a preview.');
      const delivered = await sendTestNotification('motivation', deviceNotifications.motivationImages, deviceNotifications.motivationTone);
      setPushMessage(delivered ? 'Motivational preview sent to this device.' : 'The preview could not be delivered.');
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Motivational preview failed.');
    } finally {
      setPushBusy(false);
    }
  };

  const toggleMotivationDay = (day: number) => {
    const current = deviceNotifications.motivationDays;
    const next = current.includes(day)
      ? current.length === 1 ? current : current.filter((item) => item !== day)
      : [...current, day].sort();
    saveDeviceNotifications({ ...deviceNotifications, motivationDays: next });
  };

  const updateMotivationTime = (index: number, time: string) => {
    const next = [...deviceNotifications.motivationTimes];
    next[index] = time;
    saveDeviceNotifications({ ...deviceNotifications, motivationTimes: next });
  };

  const addMotivationTime = () => {
    const candidates = ['12:00', '15:30', '17:00', '18:00', '20:00', '21:00', '23:00'];
    const time = candidates.find((candidate) => !deviceNotifications.motivationTimes.includes(candidate));
    if (!time || deviceNotifications.motivationTimes.length >= 5) return;
    saveDeviceNotifications({ ...deviceNotifications, motivationTimes: [...deviceNotifications.motivationTimes, time] });
  };

  const removeMotivationTime = (index: number) => {
    if (deviceNotifications.motivationTimes.length === 1) return;
    saveDeviceNotifications({
      ...deviceNotifications,
      motivationTimes: deviceNotifications.motivationTimes.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const clearBrowserData = async () => {
    await createLocalStorageService().resetAll();
    // IndexedDB can be held briefly by a PDF tab. Never let optional crash
    // recovery cleanup prevent the rest of this-device reset from completing.
    await Promise.race([
      Promise.all([clearAllPdfAnnotations(), clearStoredWorkspacePdfs()]).then(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
    ]).catch(() => undefined);

    // Feature-specific preferences are intentionally outside the synced
    // storage namespace. They still belong to this app and must be removed by
    // “Clear this device”. Supabase keys are removed by local sign-out.
    const appKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith('revision-engine:')));
    appKeys.forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
  };

  const clearDeviceOnly = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setResetError(null);
    try {
      const pushCleanup = disableWebPush({ ...deviceNotifications, enabled: false }).catch(() => undefined);
      await clearBrowserData();
      // These are secondary cleanups. Network/browser APIs must not hold the
      // destructive local action in an endless loading state.
      await Promise.race([
        pushCleanup,
        new Promise<void>((resolve) => window.setTimeout(resolve, 1000)),
      ]).catch(() => undefined);
      if (cloudAvailable) {
        await Promise.race([
          signOut(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 1000)),
        ]).catch(() => undefined);
      }
      setCleared(true);
      setResetOpen(false);
      window.location.replace('/');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'This device could not be cleared. Please try again.');
      setResetBusy(false);
    }
  };

  const clearDeviceAndArchiveCloud = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setResetError(null);
    try {
      const pushCleanup = disableWebPush({ ...deviceNotifications, enabled: false }).catch(() => undefined);
      await Promise.race([
        storage.resetAll(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Cloud removal timed out. Check your connection and try again.')), 10000)),
      ]);
      await clearBrowserData();
      await Promise.race([
        pushCleanup,
        new Promise<void>((resolve) => window.setTimeout(resolve, 1000)),
      ]);
      updateDeviceNotifications({ ...deviceNotifications, enabled: false });
      setCleared(true);
      setResetOpen(false);
      window.location.replace('/');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Your data could not be cleared. Please try again.');
      setResetBusy(false);
    }
  };

  const manualSync = async () => {
    setSyncMessage(null);
    try {
      await syncNow();
      setSyncMessage('Cloud backup is up to date.');
    } catch {
      setSyncMessage('Sync failed. Your local data is safe; try again when online.');
    }
  };

  return (
    <Page narrow>
      <PageHeader eyebrow="Settings" title="Preferences" description="Personalise the app and control how your study data is stored." />

      <div className={styles.settingsTabs} data-tour="app-settings">
        <Tabs
          items={[
            { id: 'general', label: 'General' },
            { id: 'alerts', label: 'Alerts' },
            { id: 'addons', label: 'Add-ons' },
          ]}
          value={tab}
          onChange={setTab}
          aria-label="Settings sections"
        />
      </div>

      {tab === 'general' && (
        <>
          <section className={styles.group}>
            <div className={styles.stack}>
              <div className={styles.rowText}>
                <h3 className={styles.rowTitle}>Account &amp; sync</h3>
                <p className={styles.rowDesc}>Sign in to continue on any device.</p>
              </div>
              <AccountPanel />
              {status === 'authenticated' && cloudAvailable && (
                <div className={styles.syncPanel}>
                  <div>
                    <strong>Local + cloud backup</strong>
                    <span>Quiz attempts and responses save locally first, then sync to your account.</span>
                    {syncMessage && <small role="status">{syncMessage}</small>}
                  </div>
                  <Button variant="secondary" size="sm" disabled={!online || syncing} onClick={() => void manualSync()}>
                    <Icon name="sync" size={15} />
                    {syncing ? 'Syncing…' : 'Sync now'}
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
                  <select
                    value={revisionPreferences.dailyQuestionLimit}
                    onChange={(event) =>
                      updateRevisionPreferences({
                        ...revisionPreferences,
                        dailyQuestionLimit: Number(event.target.value),
                      })
                    }
                  >
                    {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((value) => (
                      <option key={value} value={value}>
                        {value} questions
                      </option>
                    ))}
                  </select>
                  <small>This is a maximum. If fewer questions are due, the queue stays smaller.</small>
                </label>
                <label>
                  <span>Maximum unseen questions</span>
                  <select
                    value={revisionPreferences.newQuestionPercent}
                    onChange={(event) =>
                      updateRevisionPreferences({
                        ...revisionPreferences,
                        newQuestionPercent: Number(event.target.value),
                      })
                    }
                  >
                    {[0, 10, 20, 25, 30, 40, 50].map((value) => (
                      <option key={value} value={value}>
                        {value}% of queue
                      </option>
                    ))}
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
                <p className={styles.rowDesc}>Choose light, dark, or follow your system.</p>
              </div>
              <ThemeToggle />
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <h3 className={styles.rowTitle}>Install Revision Engine</h3>
                <p className={styles.rowDesc}>{installState === 'installed' ? 'The PWA is installed on this device.' : 'Install the app for home-screen access and the most reliable mobile notification experience.'}</p>
                {installMessage && <small className={styles.installMessage} role='status'>{installMessage}</small>}
              </div>
              <Button variant={installState === 'available' ? 'primary' : 'secondary'} size='sm' disabled={installState === 'installed'} onClick={() => void installPwa()}>
                <Icon name={installState === 'installed' ? 'check' : 'share'} size={15} /> {installState === 'installed' ? 'Installed' : installState === 'available' ? 'Install app' : 'How to install'}
              </Button>
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <h3 className={styles.rowTitle}>Refresh application</h3>
                <p className={styles.rowDesc}>Fetch the latest deployed app and chapter files. Your local data, settings and quiz history stay unchanged.</p>
              </div>
              <Button variant="secondary" size="sm" disabled={refreshingApp} onClick={() => void refreshApplication()}>
                <Icon name="sync" size={15} /> {refreshingApp ? 'Refreshing…' : 'Refresh app'}
              </Button>
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <h3 className={styles.rowTitle}>Product tour</h3>
                <p className={styles.rowDesc}>Walk through the app again with a guided, feature-by-feature tour.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={replayFirstVisitTour}>
                <Icon name="sparkle" size={15} /> Replay tour
              </Button>
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <h3 className={styles.rowTitle}>Reset all data</h3>
                <p className={styles.rowDesc}>Clear progress, quiz history, responses, bookmarks, imports and preferences.</p>
              </div>
              <Button variant="danger" onClick={() => setResetOpen(true)} disabled={cleared}>
                Reset data
              </Button>
            </div>
          </section>

          {resetOpen && (
            <div className={styles.modalBackdrop} onMouseDown={() => { if (!resetBusy) setResetOpen(false); }}>
              <section
                className={styles.resetModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span className={styles.resetIcon}>
                  <Icon name="trash" size={20} />
                </span>
                <h2 id="reset-title">Where should data disappear from?</h2>
                <p>
                  Cloud removal is non-destructive: the selected data disappears from the app while a protected recovery record is retained.
                </p>
                <div className={styles.resetChoices}>
                  <button type="button" onClick={() => void clearDeviceOnly()} disabled={resetBusy}>
                    <strong>{resetBusy ? 'Clearing this device…' : 'Clear this device'}</strong>
                    <span>
                      {cloudAvailable
                        ? 'Signs you out and clears this browser. Your cloud backup remains available.'
                        : 'Clears all data stored in this browser.'}
                    </span>
                  </button>
                  {cloudAvailable && (
                    <button type="button" onClick={() => void clearDeviceAndArchiveCloud()} disabled={resetBusy}>
                      <strong>Clear device and remove cloud data from the app</strong>
                      <span>Removes active cloud data from the app without permanently erasing its protected recovery history.</span>
                    </button>
                  )}
                </div>
                {resetError && <p role="alert" className={styles.resetError}>{resetError}</p>}
                <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetBusy}>
                  Cancel
                </Button>
              </section>
            </div>
          )}

          <PreferenceGroup title="Dashboard" description="Choose which optional information appears on your home page.">
            <ToggleSetting
              title="Weekly activity overview"
              description="Show the compact progress calendar at the top of the dashboard."
              checked={appSettings.dashboard.showActivityOverview}
              onChange={(checked) => updateAppSettings({ ...appSettings, dashboard: { ...appSettings.dashboard, showActivityOverview: checked } })}
            />
          </PreferenceGroup>

          <PreferenceGroup title="Accessibility" description="Comfort settings applied everywhere in the app.">
            <ToggleSetting
              title="Reduce motion"
              description="Minimise interface animations and transitions."
              checked={appSettings.accessibility.reduceMotion}
              onChange={(checked) => updateAppSettings({ ...appSettings, accessibility: { ...appSettings.accessibility, reduceMotion: checked } })}
            />
          </PreferenceGroup>

          <button type="button" className={styles.resetPreferences} onClick={resetAppSettings}>Restore application defaults</button>

          <section className={styles.group}>
            <div className={styles.about}>
              <div className={styles.row}>
                <div className={styles.rowText}>
                  <h3 className={styles.rowTitle}>About</h3>
                  <p className={styles.rowDesc}>{APP_NAME} application version.</p>
                </div>
                <div className={styles.buildIdentity}><code className={styles.version}>v{APP_VERSION}</code><small>Built {new Date(APP_BUILD_TIMESTAMP).toLocaleString()}</small></div>
              </div>
              <div className={styles.responsibleUse} role="note">
                <p>
                  This is an educational study tool. Only import material you created, own, or have permission to use. Respect copyright,
                  licences, privacy, and source terms; do not upload or share pirated, confidential, or unlawfully copied content. You are
                  responsible for the content you import and how you use it.
                </p>
              </div>
              <p className={styles.credit}>
                Made with <Icon name="heart" size={15} className={styles.heart} /> by Aditya Sharma.
              </p>
            </div>
          </section>
        </>
      )}

      {tab === 'alerts' && (
        <div className={styles.preferenceSections}>
          <PreferenceGroup
            title="Notifications"
            description="These choices apply only to this device. Other phones, tablets and computers keep their own notification settings."
          >
            <ToggleSetting
              title="Allow notifications"
              description={`Master control for study reminders and progress updates · ${pushStatus === 'granted' ? 'browser allowed' : pushStatus.replace('-', ' ')}`}
              checked={notificationsReady}
              disabled={pushBusy}
              onChange={(checked) => void setNotificationsEnabled(checked)}
            />
            <ToggleSetting
              title="Daily revision reminder"
              description="Remind me when today’s revision is still pending."
              checked={deviceNotifications.dailyRevision}
              disabled={!notificationsReady}
              onChange={(checked) => saveDeviceNotifications({ ...deviceNotifications, dailyRevision: checked })}
            />
            <ToggleSetting
              title="Weekly progress summary"
              description="Receive a concise summary of questions, accuracy and active days."
              checked={deviceNotifications.weeklySummary}
              disabled={!notificationsReady}
              onChange={(checked) => saveDeviceNotifications({ ...deviceNotifications, weeklySummary: checked })}
            />
            <ToggleSetting
              title="Milestones"
              description="Celebrate streaks and meaningful learning milestones."
              checked={deviceNotifications.milestones}
              disabled={!notificationsReady}
              onChange={(checked) => saveDeviceNotifications({ ...deviceNotifications, milestones: checked })}
            />
            <ToggleSetting
              title="Memory nudges"
              description="Allow configured memory nudges to arrive on this device."
              checked={deviceNotifications.memoryNudges}
              disabled={!notificationsReady}
              onChange={(checked) => saveDeviceNotifications({ ...deviceNotifications, memoryNudges: checked })}
            />
            <ToggleSetting
              title="Motivational reminders"
              description="Occasional UPSC-focused encouragement, kept separate from your Memory Nudges."
              checked={deviceNotifications.motivation}
              disabled={!notificationsReady}
              onChange={(checked) => saveDeviceNotifications({ ...deviceNotifications, motivation: checked })}
            />
            {deviceNotifications.motivation && (
              <details className={`${styles.motivationPanel} ${!notificationsReady ? styles.disabled : ''}`}>
                <summary>
                  <span><Icon name="sun" size={17} /></span>
                  <div><strong>Motivation schedule</strong><small>{deviceNotifications.motivationTimes.length} daily times · {deviceNotifications.motivationTone === 'mixed' ? 'mixed intensity' : `${deviceNotifications.motivationTone} tone`} · {deviceNotifications.motivationImages ? 'images on' : 'text only'}</small></div>
                  <Icon name="chevronDown" size={15} />
                </summary>
                <div className={styles.motivationControls}>
                  <div className={styles.motivationFields}>
                    <div className={styles.motivationScheduleEditor}>
                      <span>Daily delivery times</span>
                      <div className={styles.motivationTimeList}>
                        {deviceNotifications.motivationTimes.map((time, index) => (
                          <div className={styles.motivationTimeRow} key={`${time}-${index}`}>
                            <input type="time" value={time} disabled={!notificationsReady} aria-label={`Motivation delivery time ${index + 1}`} onChange={(event) => updateMotivationTime(index, event.target.value)} />
                            <button type="button" disabled={!notificationsReady || deviceNotifications.motivationTimes.length === 1} aria-label={`Remove ${time} reminder`} title="Remove time" onClick={() => removeMotivationTime(index)}><Icon name="trash" size={14} /></button>
                          </div>
                        ))}
                      </div>
                      {deviceNotifications.motivationTimes.length < 5 && <button type="button" className={styles.addMotivationTime} disabled={!notificationsReady} onClick={addMotivationTime}><Icon name="plus" size={14} /> Add time</button>}
                    </div>
                    <label><span>Intensity</span><select value={deviceNotifications.motivationTone} disabled={!notificationsReady} onChange={(event) => saveDeviceNotifications({ ...deviceNotifications, motivationTone: event.target.value as DeviceNotificationSettings['motivationTone'] })}><option value="mixed">Mixed</option><option value="soft">Soft</option><option value="balanced">Balanced</option><option value="firm">Firm</option><option value="brutal">Raw / brutal</option></select></label>
                  </div>
                  <fieldset>
                    <legend>Delivery days</legend>
                    <div className={styles.motivationDays}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, day) => <button type="button" key={`${label}-${day}`} disabled={!notificationsReady} className={deviceNotifications.motivationDays.includes(day) ? styles.motivationDayActive : ''} aria-pressed={deviceNotifications.motivationDays.includes(day)} onClick={() => toggleMotivationDay(day)}>{label}</button>)}</div>
                  </fieldset>
                  <label className={styles.imageChoice}><input type="checkbox" checked={deviceNotifications.motivationImages} disabled={!notificationsReady} onChange={(event) => saveDeviceNotifications({ ...deviceNotifications, motivationImages: event.target.checked })} /><span><strong>Rich images</strong><small>Use a category image when its public URL is available; otherwise send a clean text notification.</small></span></label>
                  <div className={styles.motivationPreview}><Button size="sm" variant="secondary" disabled={pushBusy || !notificationsReady} onClick={() => void previewMotivation()}><Icon name="bell" size={14} /> Send preview</Button><small>Preview only—never added to your notification history.</small></div>
                </div>
              </details>
            )}
            <div className={`${styles.notificationSchedule} ${!notificationsReady ? styles.disabled : ''}`}>
              <label>
                <span>Daily reminder</span>
                <input
                  type="time"
                  value={deviceNotifications.dailyReminderTime}
                  disabled={!notificationsReady}
                  onChange={(event) => saveDeviceNotifications({ ...deviceNotifications, dailyReminderTime: event.target.value })}
                />
              </label>
              <label>
                <span>Weekly summary</span>
                <select
                  value={deviceNotifications.weeklySummaryDay}
                  disabled={!notificationsReady}
                  onChange={(event) => saveDeviceNotifications({ ...deviceNotifications, weeklySummaryDay: Number(event.target.value) })}
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                    <option value={index} key={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Summary time</span>
                <input
                  type="time"
                  value={deviceNotifications.weeklySummaryTime}
                  disabled={!notificationsReady}
                  onChange={(event) => saveDeviceNotifications({ ...deviceNotifications, weeklySummaryTime: event.target.value })}
                />
              </label>
              <small>This device uses {deviceNotifications.timezone || 'UTC'}.</small>
            </div>
            <div className={styles.pushActions}>
              <Button size="sm" variant="secondary" disabled={pushBusy || !notificationsReady} onClick={() => void testPush()}>
                Send test notification
              </Button>
              {pushMessage && <small role="status">{pushMessage}</small>}
            </div>
          </PreferenceGroup>

        </div>
      )}

      {tab === 'addons' && (
        <div className={styles.preferenceSections}>
          <section className={styles.addonIntro}>
            <span><Icon name="sparkle" size={22} /></span>
            <div><h2>Powerful optional tools</h2><p>Add-ons extend Revision Engine with focused workflows. Enable only what helps you study; more independent tools can be added here later.</p></div>
          </section>
          <section className={styles.addonCard}>
            <span><Icon name="clock" size={20} /></span>
            <div><em>FOCUS & TIME</em><strong>Floating Focus Timer</strong><p>Run timestamp-accurate study sessions across the app, with completed time added to analytics.</p></div>
            <Button variant="primary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('revision-engine:open-focus-timer', { detail: { tab: 'appearance' } }))}>Configure</Button>
          </section>
          <section className={styles.addonCard}>
            <span><Icon name="sparkle" size={20} /></span>
            <div><em>MEMORY & RETENTION</em><strong>Memory Nudges</strong><p>Bring important facts, quotes and mistakes back through weighted, adaptive notifications.</p></div>
            <Button variant="primary" size="sm" disabled={status !== 'authenticated'} onClick={() => setNudgeSettingsOpen(true)}>Configure</Button>
          </section>
          {status !== 'authenticated' && <small className={styles.addonHelp}>Sign in to configure private, synced add-ons.</small>}
        </div>
      )}
      {nudgeSettingsOpen && <NudgeSettingsDialog onClose={closeNudgeSettings} />}
    </Page>
  );
}

const NUDGE_FREQUENCY_PRESETS = [
  { id: 'gentle', label: 'Gentle', detail: 'About once a day', maxPerDay: 1, interval: 1440, cooldown: 168 },
  { id: 'balanced', label: 'Balanced', detail: 'Up to 3 · every 4 hours', maxPerDay: 3, interval: 240, cooldown: 72 },
  { id: 'frequent', label: 'Frequent', detail: 'Up to 6 · every 3 hours', maxPerDay: 6, interval: 180, cooldown: 48 },
  { id: 'intensive', label: 'Intensive', detail: 'Up to 12 · every hour', maxPerDay: 12, interval: 60, cooldown: 24 },
] as const;

function NudgeSettingsDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<NudgePreferences>(DEFAULT_NUDGE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [panel, setPanel] = useState<'frequency' | 'schedule' | 'behaviour'>('frequency');
  useEffect(() => {
    void loadNudgePreferences()
      .then(setValue)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      await saveNudgePreferences({
        ...value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };
  const toggleDay = (day: number) =>
    setValue({
      ...value,
      deliveryDays: value.deliveryDays.includes(day)
        ? value.deliveryDays.filter((item) => item !== day)
        : [...value.deliveryDays, day].sort(),
    });
  const activePreset = NUDGE_FREQUENCY_PRESETS.find(
    (preset) =>
      preset.maxPerDay === value.maxPerDay &&
      preset.interval === value.deliveryIntervalMinutes &&
      preset.cooldown === value.minimumCooldownHours,
  )?.id;
  const applyPreset = (preset: (typeof NUDGE_FREQUENCY_PRESETS)[number]) =>
    setValue({
      ...value,
      enabled: true,
      maxPerDay: preset.maxPerDay,
      deliveryIntervalMinutes: preset.interval,
      minimumCooldownHours: preset.cooldown,
    });
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section
        className={styles.nudgeModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nudge-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Memory Nudges add-on</span>
            <h2 id="nudge-settings-title">Control what returns—and when</h2>
            <p>Weighted selection favours crucial and forgotten items while cooldowns prevent repetition.</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {loading ? (
          <p>Loading preferences…</p>
        ) : (
          <div className={styles.nudgeControls}>
            <ToggleSetting
              title="Enable Memory Nudges"
              description="Allow the dispatcher to select and deliver eligible nudges."
              checked={value.enabled}
              onChange={(enabled) => setValue({ ...value, enabled })}
            />
            <div className={styles.nudgeSummary} aria-label="Current Memory Nudge configuration">
              <div><span>Frequency</span><strong>{NUDGE_FREQUENCY_PRESETS.find((item) => item.id === activePreset)?.label ?? 'Custom'}</strong></div>
              <div><span>Daily limit</span><strong>{value.maxPerDay}</strong></div>
              <div><span>Active days</span><strong>{value.deliveryDays.length}/7</strong></div>
              <div><span>Privacy</span><strong>{value.privacyMode ? 'Private' : 'Preview'}</strong></div>
            </div>
            <div className={styles.nudgeTabs}>
              <Tabs
                items={[{ id: 'frequency', label: 'Frequency' }, { id: 'schedule', label: 'Schedule' }, { id: 'behaviour', label: 'Behaviour' }]}
                value={panel}
                onChange={setPanel}
                aria-label="Memory Nudge settings sections"
              />
            </div>
            {panel === 'frequency' && <div className={styles.nudgePanel}>
            <fieldset>
              <legend>Frequency preset</legend>
              <p className={styles.frequencyHint}>
                Spacing is enforced across all real Memory Nudge deliveries and only runs inside your selected days and delivery windows.
              </p>
              <div className={styles.frequencyPresets}>
                {NUDGE_FREQUENCY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={activePreset === preset.id ? styles.frequencyActive : ''}
                    onClick={() => applyPreset(preset)}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.detail}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={styles.controlGrid}>
              <label>
                Maximum per day
                <select
                  value={value.maxPerDay}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      maxPerDay: Number(event.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 8, 12, 16, 24].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Minimum time between nudges
                <select
                  value={value.deliveryIntervalMinutes}
                  onChange={(event) => setValue({ ...value, deliveryIntervalMinutes: Number(event.target.value) })}
                >
                  {[60, 120, 180, 240, 360, 720, 1440, 2880, 10080].map((minutes) => (
                    <option value={minutes} key={minutes}>
                      {minutes < 1440
                        ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
                        : `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default priority
                <select
                  value={value.defaultPriority}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      defaultPriority: Number(event.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Global minimum cooldown
                <select
                  value={value.minimumCooldownHours}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      minimumCooldownHours: Number(event.target.value),
                    })
                  }
                >
                  {[6, 12, 24, 48, 72, 168].map((item) => (
                    <option value={item} key={item}>
                      {item < 24 ? `${item} hours` : `${item / 24} days`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            </div>}
            {panel === 'schedule' && <div className={styles.nudgePanel}>
            <fieldset>
              <legend>Delivery days</legend>
              <div className={styles.dayPicker}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, day) => (
                  <button
                    type="button"
                    className={value.deliveryDays.includes(day) ? styles.selectedDay : ''}
                    onClick={() => toggleDay(day)}
                    key={`${label}-${day}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Delivery windows</legend>
              <div className={styles.windows}>
                {value.windows.map((window, index) => (
                  <div key={index}>
                    <input
                      type="time"
                      value={window.start}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          windows: value.windows.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, start: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={window.end}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          windows: value.windows.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, end: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    {value.windows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setValue({
                            ...value,
                            windows: value.windows.filter((_, itemIndex) => itemIndex !== index),
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {value.windows.length < 3 && (
                <button
                  type="button"
                  className={styles.addWindow}
                  onClick={() =>
                    setValue({
                      ...value,
                      windows: [...value.windows, { start: '12:00', end: '14:00' }],
                    })
                  }
                >
                  + Add another window
                </button>
              )}
            </fieldset>
            <fieldset>
              <legend>Quiet hours</legend>
              <div className={styles.quiet}>
                <input type="time" value={value.quietStart} onChange={(event) => setValue({ ...value, quietStart: event.target.value })} />
                <span>to</span>
                <input type="time" value={value.quietEnd} onChange={(event) => setValue({ ...value, quietEnd: event.target.value })} />
              </div>
            </fieldset>
            <p className={styles.timezone}>Scheduling timezone: {value.timezone}</p>
            </div>}
            {panel === 'behaviour' && <div className={styles.nudgePanel}>
            <ToggleSetting
              title="Adaptive scheduling"
              description="Remembered items wait longer; forgotten items return sooner."
              checked={value.adaptiveScheduling}
              onChange={(adaptiveScheduling) => setValue({ ...value, adaptiveScheduling })}
            />
            <ToggleSetting
              title="Complete the pool before repeats"
              description="Prefer unseen eligible nudges before starting another cycle."
              checked={value.avoidRepeatsUntilCycle}
              onChange={(avoidRepeatsUntilCycle) => setValue({ ...value, avoidRepeatsUntilCycle })}
            />
            <ToggleSetting
              title="Private lock-screen text"
              description="Hide nudge content until the notification is opened."
              checked={value.privacyMode}
              onChange={(privacyMode) => setValue({ ...value, privacyMode })}
            />
            <div className={styles.behaviourNote}><Icon name="sparkle" size={17} /><p><strong>How selection works</strong><span>Priority, forgotten feedback and time since last delivery influence which eligible nudge returns next.</span></p></div>
            </div>}
          </div>
        )}
        {message && <small className={styles.dialogError}>{message}</small>}
        <footer>
          <Link to={Routes.nudges} onClick={onClose}>
            Manage nudge library
          </Link>
          <div>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={loading || saving || value.deliveryDays.length === 0 || value.windows.length === 0}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save add-on'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PreferenceGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className={styles.preferenceGroup}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function ToggleSetting({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`${styles.toggleRow} ${disabled ? styles.disabled : ''}`}>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
