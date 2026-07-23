import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useStorage } from '../../../context/StorageContext';
import { Button } from '../../common/Button';
import { Icon } from '../../common/Icon';
import { UserAvatar } from '../../common/UserAvatar';
import styles from './AccountPanel.module.css';

// Keep passwordless email authentication implemented, but out of the primary
// sign-in experience until it is intentionally enabled again.
const SHOW_EMAIL_LINK_SIGN_IN = false;

/**
 * Account + sync surface for Settings. Handles all auth states: signed in,
 * guest (with sign-in options), and cloud-auth-not-configured.
 */
export function AccountPanel() {
  const { status, user, supabaseConfigured, signInWithGoogle, signInWithEmail, signOut } =
    useAuth();
  const { syncing, online } = useStorage();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!supabaseConfigured) {
    return (
      <div className={styles.note}>
        Account and cloud backup services are currently unavailable. Your study
        data will continue to be saved safely on this device.
      </div>
    );
  }

  if (status === 'authenticated' && user) {
    return (
      <div className={styles.account}>
        <div className={styles.identity}>
          <UserAvatar
            src={user.avatarUrl}
            name={user.displayName}
            email={user.email}
            className={styles.avatar}
            fallbackClassName={styles.avatarFallback}
          />
          <div className={styles.identityText}>
            <span className={styles.name}>{user.displayName ?? 'Signed in'}</span>
            {user.email && <span className={styles.email}>{user.email}</span>}
          </div>
        </div>
        <div className={styles.syncRow}>
          <span className={styles.syncBadge}>
            <span className={online ? styles.dotOnline : styles.dotOffline} />
            {syncing ? 'Syncing…' : online ? 'Synced' : 'Offline — changes queued'}
          </span>
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const res = await signInWithEmail(email.trim());
    setSending(false);
    if (res.sent) setSentTo(email.trim());
    else setError(res.error ?? 'Could not send the link.');
  };

  if (SHOW_EMAIL_LINK_SIGN_IN && sentTo) {
    return (
      <div className={styles.note}>
        <Icon name="check" size={16} /> Magic link sent to <strong>{sentTo}</strong>.
        Open it on this device to finish signing in.
      </div>
    );
  }

  return (
    <div className={styles.signin}>
      <p className={styles.signinLead}>
        Sign in to sync your progress, bookmarks and uploads across devices. Your
        current local data merges into your account.
      </p>
      <Button variant="secondary" fullWidth className={styles.googleSignIn} onClick={() => void signInWithGoogle()}>
        <Icon name="sparkle" size={16} /> Continue with Google
      </Button>
      {SHOW_EMAIL_LINK_SIGN_IN && (
        <>
          <div className={styles.divider}>
            <span>or</span>
          </div>
          <form className={styles.emailForm} onSubmit={submitEmail}>
            <input
              type="email"
              required
              className={styles.emailInput}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button variant="primary" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}
    </div>
  );
}
