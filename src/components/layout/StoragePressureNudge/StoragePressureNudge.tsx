import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../common';
import { Routes } from '../../../constants/routes';
import { useAuth } from '../../../context/AuthContext';
import styles from './StoragePressureNudge.module.css';

type PressureLevel = 'warning' | 'urgent';
interface Pressure { level: PressureLevel; bytes: number; ratio: number | null }
const DISMISS_KEY = 'revision-engine:storage-pressure-dismissed';
const MIB = 1024 * 1024;

function appStorageBytes() {
  let bytes = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith('ure:')) continue;
    bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  }
  return bytes;
}

async function measurePressure(): Promise<Pressure | null> {
  const bytes = appStorageBytes();
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const ratio = estimate?.quota && estimate.usage ? estimate.usage / estimate.quota : null;
  if (bytes >= 3.5 * MIB || (ratio !== null && ratio >= .9)) return { level: 'urgent', bytes, ratio };
  if (bytes >= 1.5 * MIB || (ratio !== null && ratio >= .75)) return { level: 'warning', bytes, ratio };
  return null;
}

export function StoragePressureNudge() {
  const { status, supabaseConfigured } = useAuth();
  const [pressure, setPressure] = useState<Pressure | null>(null);
  const check = useCallback(async () => {
    if (status !== 'guest') { setPressure(null); return; }
    const next = await measurePressure();
    if (!next) { setPressure(null); return; }
    try {
      const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null') as { level?: PressureLevel; at?: number } | null;
      const cooldown = next.level === 'urgent' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const escalated = next.level === 'urgent' && dismissed?.level === 'warning';
      if (!escalated && dismissed?.at && Date.now() - dismissed.at < cooldown) { setPressure(null); return; }
    } catch { /* show the safety message when dismissal data is invalid */ }
    setPressure(next);
  }, [status]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    window.addEventListener('revision-engine:storage-change', check);
    window.addEventListener('storage', check);
    return () => { window.clearInterval(timer); window.removeEventListener('revision-engine:storage-change', check); window.removeEventListener('storage', check); };
  }, [check]);

  if (!pressure) return null;
  const amount = pressure.bytes >= MIB ? `${(pressure.bytes / MIB).toFixed(1)} MB` : `${Math.ceil(pressure.bytes / 1024)} KB`;
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ level: pressure.level, at: Date.now() }));
    setPressure(null);
  };
  return <aside className={`${styles.nudge} ${pressure.level === 'urgent' ? styles.urgent : ''}`} role='status'>
    <span className={styles.icon}><Icon name={pressure.level === 'urgent' ? 'clock' : 'sync'} size={20} /></span>
    <div><strong>{pressure.level === 'urgent' ? 'Your local study storage is nearly full' : 'Protect your growing study history'}</strong><p>{amount} of study data is stored only in this browser. {supabaseConfigured ? 'Sign in to sync it before storage limits affect saves or performance.' : 'Export or remove older data before the browser reaches its limit.'}</p><div>{supabaseConfigured && <Link to={`${Routes.settings}?tab=general`}>Sign in & sync</Link>}<button type='button' onClick={dismiss}>Remind me {pressure.level === 'urgent' ? 'tomorrow' : 'next week'}</button></div></div>
    <button className={styles.close} type='button' aria-label='Dismiss storage warning' onClick={dismiss}><Icon name='close' size={15} /></button>
  </aside>;
}
