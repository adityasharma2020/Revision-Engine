import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon } from '../../common';
import { useAuth } from '../../../context/AuthContext';
import { listInboxNotifications, markInboxRead, type InboxNotification } from '../../../services/notifications';
import styles from './NotificationInbox.module.css';

const destination = (url: string) => url ? (url.startsWith('/') ? url : `/${url}`) : '/';
const iconFor = (type: string) => type === 'memory-nudge' ? 'sparkle' : type === 'weekly-summary' || type === 'milestone' ? 'chart' : 'target';

export function NotificationInbox() {
  const { status } = useAuth();
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') { setItems([]); return; }
    let active = true;
    const load = () => void listInboxNotifications().then((next) => { if (active) setItems(next); }).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener('focus', load);
    window.addEventListener('revision-engine:notifications-changed', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      window.removeEventListener('revision-engine:notifications-changed', load);
    };
  }, [status]);

  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setHistoryOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [historyOpen]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  if (status !== 'authenticated') return null;

  const markRead = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      await markInboxRead(ids);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, readAt } : item));
    } finally { setBusy(false); }
  };

  return <>
    <div className={styles.dock}>
      <button
        type='button'
        className={styles.bellButton}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        title='Notifications'
        onClick={() => setHistoryOpen(true)}
      >
        <Icon name='bell' size={19} />
        {unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}
      </button>
    </div>
    {historyOpen && <div className={styles.backdrop} onMouseDown={() => setHistoryOpen(false)}><section className={styles.modal} role='dialog' aria-modal='true' aria-labelledby='notification-history-title' onMouseDown={(event) => event.stopPropagation()}><header><div><span>Notifications</span><h2 id='notification-history-title'>Study updates</h2><p>Reminders and nudges stay here after the system notification disappears.</p></div><button aria-label='Close notifications' onClick={() => setHistoryOpen(false)}><Icon name='close' /></button></header><div className={styles.modalActions}><span>{unreadCount} unread</span><Button size='sm' disabled={busy || unreadCount === 0} onClick={() => void markRead(items.filter((item) => !item.readAt).map((item) => item.id))}>Mark all read</Button></div>{items.length ? <ol className={styles.history}>{items.map((item) => <li key={item.id} className={item.readAt ? styles.read : ''}><Link to={destination(item.url)} onClick={() => { void markRead([item.id]); setHistoryOpen(false); }}><span className={styles.historyIcon}><Icon name={iconFor(item.type)} size={17} /></span><div><span>{item.title}{!item.readAt && <i>New</i>}</span><p>{item.body}</p><time>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(item.deliveredAt))}</time></div><Icon name='chevronRight' size={16} /></Link></li>)}</ol> : <div className={styles.empty}><Icon name='bell' size={24} /><strong>No notifications yet</strong><p>Your study reminders and memory nudges will appear here.</p></div>}</section></div>}
  </>;
}
