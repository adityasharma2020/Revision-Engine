import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon } from '../../common';
import { useAuth } from '../../../context/AuthContext';
import { listInboxNotifications, markInboxRead, type InboxNotification } from '../../../services/notifications';
import styles from './NotificationInbox.module.css';

const sameLocalDay = (value: string, now = new Date()) => {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};
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
    return () => { active = false; window.clearInterval(timer); };
  }, [status]);

  const todayUnread = useMemo(() => items.filter((item) => !item.readAt && sameLocalDay(item.deliveredAt)), [items]);
  if (!items.length) return null;

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
    <section className={styles.inbox} aria-label='Today’s notifications'>
      <div className={styles.head}>
        <div><span className={styles.bell}><Icon name='sparkle' size={16} />{todayUnread.length > 0 && <b>{todayUnread.length}</b>}</span><div><strong>{todayUnread.length ? 'Today’s updates' : 'You’re caught up'}</strong><small>{todayUnread.length ? 'Study notifications you have not opened yet.' : 'No unread study notifications today.'}</small></div></div>
        <div>{todayUnread.length > 0 && <button disabled={busy} onClick={() => void markRead(todayUnread.map((item) => item.id))}>Mark today read</button>}<button onClick={() => setHistoryOpen(true)}>View history</button></div>
      </div>
      {todayUnread.length > 0 && <div className={styles.preview}>{todayUnread.slice(0, 3).map((item) => <Link key={item.id} to={destination(item.url)} onClick={() => void markRead([item.id])}><span><Icon name={iconFor(item.type)} size={16} /></span><div><strong>{item.title}</strong><p>{item.body}</p></div><time>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(item.deliveredAt))}</time></Link>)}</div>}
    </section>
    {historyOpen && <div className={styles.backdrop} onMouseDown={() => setHistoryOpen(false)}><section className={styles.modal} role='dialog' aria-modal='true' aria-labelledby='notification-history-title' onMouseDown={(event) => event.stopPropagation()}><header><div><span>Notification inbox</span><h2 id='notification-history-title'>Study update history</h2><p>Your latest reminders and nudges, kept here even after the system notification disappears.</p></div><button aria-label='Close history' onClick={() => setHistoryOpen(false)}><Icon name='close' /></button></header><div className={styles.modalActions}><span>{items.filter((item) => !item.readAt).length} unread</span><Button size='sm' disabled={busy || items.every((item) => item.readAt)} onClick={() => void markRead(items.filter((item) => !item.readAt).map((item) => item.id))}>Mark all read</Button></div><ol className={styles.history}>{items.map((item) => <li key={item.id} className={item.readAt ? styles.read : ''}><Link to={destination(item.url)} onClick={() => { void markRead([item.id]); setHistoryOpen(false); }}><span className={styles.historyIcon}><Icon name={iconFor(item.type)} size={17} /></span><div><span>{item.title}{!item.readAt && <i>New</i>}</span><p>{item.body}</p><time>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(item.deliveredAt))}</time></div><Icon name='chevronRight' size={16} /></Link></li>)}</ol></section></div>}
  </>;
}
