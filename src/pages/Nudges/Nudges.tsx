import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, EmptyState, Icon } from "../../components/common";
import { Page, PageHeader } from "../../components/layout";
import { useAuth } from "../../context/AuthContext";
import {
  createNudge,
  createNudges,
  deleteNudges,
  getNudge,
  listNudges,
  recordNudgeFeedback,
  recordNudgeOpen,
  sendNudgeNow,
  setNudgeActive,
  updateNudge,
} from "../../services/nudges";
import type { MemoryNudge, NudgeKind } from "../../types";
import styles from "./Nudges.module.css";
import { Routes } from "../../constants/routes";
import { useLibrary } from "../../hooks/useChapters";

const KINDS: NudgeKind[] = [
  "fact",
  "data",
  "quote",
  "definition",
  "mistake",
  "reminder",
];
const blank = {
  kind: "fact" as NudgeKind,
  title: "",
  content: "",
  context: "",
  source: "",
  sourceUrl: "",
  tags: [] as string[],
  priority: 3,
  cooldownHours: 24,
};
type EditorValue = typeof blank;

function titleFromContent(content: string, kind: NudgeKind) {
  const firstThought = content.trim().split(/[.!?\n]/)[0]?.trim();
  if (firstThought) {
    return firstThought.length > 72
      ? `${firstThought.slice(0, 69).trimEnd()}…`
      : firstThought;
  }
  return `${kind[0].toUpperCase()}${kind.slice(1)} to remember`;
}

export function Nudges() {
  const { status, supabaseConfigured, signInWithGoogle } = useAuth();
  const [params, setParams] = useSearchParams();
  const [nudges, setNudges] = useState<MemoryNudge[]>([]);
  const [selected, setSelected] = useState<MemoryNudge | null>(null);
  const [editing, setEditing] = useState<MemoryNudge | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [testTargetId, setTestTargetId] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [deliveryTestOpen, setDeliveryTestOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState("");

  const continueWithGoogle = async () => {
    setSigningIn(true);
    setSignInError("");
    try {
      await signInWithGoogle(Routes.nudges);
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : "Google sign-in could not be started.");
      setSigningIn(false);
    }
  };

  const sendNow = async (nudge: MemoryNudge) => {
    setSendingId(nudge.id);
    setMessage(null);
    try {
      const devices = await sendNudgeNow(nudge.id);
      setMessage(
        `“${nudge.title}” sent to ${devices} active ${
          devices === 1 ? "device" : "devices"
        }.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not send this nudge."
      );
    } finally {
      setSendingId(null);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      setNudges(await listNudges());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load nudges."
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (status === "authenticated") void refresh();
    else setLoading(false);
  }, [status]);
  useEffect(() => {
    const id = params.get("id");
    if (!id || status !== "authenticated") {
      setSelected(null);
      return;
    }
    void Promise.all([getNudge(id), recordNudgeOpen(id)]).then(([nudge]) =>
      setSelected(nudge)
    );
  }, [params, status]);
  const visible = useMemo(
    () =>
      nudges.filter((nudge) =>
        `${nudge.title} ${nudge.content} ${nudge.tags.join(" ")}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      ),
    [nudges, filter]
  );
  const testTarget =
    nudges.find((nudge) => nudge.id === testTargetId) ?? nudges[0];
  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };
  const deleteSelected = async () => {
    setDeleting(true);
    try {
      await deleteNudges([...selectedIds]);
      const count = selectedIds.size;
      setDeleteOpen(false);
      exitSelection();
      setSelected(null);
      setParams({});
      setMessage(
        `${count} ${count === 1 ? "nudge" : "nudges"} permanently deleted.`
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete the selected nudges."
      );
    } finally {
      setDeleting(false);
    }
  };

  if (status === "loading")
    return (
      <Page narrow>
        <div className={styles.authLoading} role='status'><span /><p>Checking your account…</p></div>
      </Page>
    );
  if (status !== "authenticated")
    return (
      <Page narrow>
        <section className={styles.authGate} aria-labelledby='nudge-sign-in-title'>
          <div className={styles.authIcon}><Icon name='sparkle' size={25} /></div>
          <span className={styles.authEyebrow}>Memory Nudges</span>
          <h1 id='nudge-sign-in-title'>Remember what matters</h1>
          <p>Sign in once to keep your private reminders synced and receive them on the devices you choose.</p>
          <div className={styles.authBenefits}>
            <span><Icon name='check' size={14} /> Private to your account</span>
            <span><Icon name='check' size={14} /> Synced across devices</span>
          </div>
          <Button className={styles.googleButton} disabled={!supabaseConfigured || signingIn} onClick={() => void continueWithGoogle()}>
            <span className={styles.googleMark}>G</span>{signingIn ? "Opening Google…" : "Continue with Google"}
          </Button>
          {!supabaseConfigured && <small className={styles.authError}>Google sign-in is not configured.</small>}
          {signInError && <small className={styles.authError} role='alert'>{signInError}</small>}
          <Link className={styles.authBack} to={Routes.dashboard}>Not now — return home</Link>
        </section>
      </Page>
    );
  return (
    <Page narrow>
      <PageHeader
        eyebrow='Memory Nudges'
        title='Keep important ideas alive'
        description='Capture facts, data and reminders, then let weighted repetition bring them back at the right time.'
        actions={
          <div className={styles.headerActions}>
            <div className={styles.desktopTools}>
              <Link
                className={styles.settingsLink}
                to={`${Routes.settings}?tab=addons&nudge=1`}
              >
                <Icon name='settings' size={15} /> Notification settings
              </Link>
              <Button
                size='sm'
                onClick={() =>
                  selecting ? exitSelection() : setSelecting(true)
                }
              >
                {selecting ? "Done" : "Manage"}
              </Button>
              <Button size='sm' onClick={() => setImportOpen(true)}>
                Import
              </Button>
            </div>
            <div className={styles.mobileTools}>
              <Button
                size='sm'
                aria-expanded={mobileToolsOpen}
                aria-haspopup='menu'
                onClick={() => setMobileToolsOpen((open) => !open)}
              >
                <Icon name='settings' size={15} /> Tools
              </Button>
              {mobileToolsOpen && (
                <div className={styles.mobileToolsMenu} role='menu'>
                  <Link
                    role='menuitem'
                    to={`${Routes.settings}?tab=addons&nudge=1`}
                    onClick={() => setMobileToolsOpen(false)}
                  >
                    <Icon name='settings' size={15} /> Notification settings
                  </Link>
                  <button
                    type='button'
                    role='menuitem'
                    onClick={() => {
                      if (selecting) exitSelection();
                      else setSelecting(true);
                      setMobileToolsOpen(false);
                    }}
                  >
                    <Icon name='check' size={15} />
                    {selecting ? "Finish managing" : "Manage nudges"}
                  </button>
                  <button
                    type='button'
                    role='menuitem'
                    onClick={() => {
                      setImportOpen(true);
                      setMobileToolsOpen(false);
                    }}
                  >
                    <Icon name='plus' size={15} /> Import nudges
                  </button>
                </div>
              )}
            </div>
            <Button
              size='sm'
              variant='primary'
              onClick={() => setEditing("new")}
            >
              <Icon name='plus' size={15} /> Add nudge
            </Button>
          </div>
        }
      />
      <section className={styles.deliveryTest}>
        <button
          className={styles.deliveryToggle}
          type='button'
          aria-expanded={deliveryTestOpen}
          onClick={() => setDeliveryTestOpen((open) => !open)}
        >
          <span className={styles.deliveryIcon}>
            <Icon name='sparkle' size={16} />
          </span>
          <span>
            <strong>Test notification delivery</strong>
            <small>Send one preview without changing its schedule</small>
          </span>
          <Icon
            className={deliveryTestOpen ? styles.chevronOpen : ""}
            name='chevronRight'
            size={16}
          />
        </button>
        {deliveryTestOpen && (
          <div className={styles.deliveryPanel}>
            {testTarget ? (
              <div className={styles.deliveryControls}>
                <select
                  aria-label='Nudge to test'
                  value={testTarget.id}
                  onChange={(event) => setTestTargetId(event.target.value)}
                >
                  {nudges.map((nudge) => (
                    <option key={nudge.id} value={nudge.id}>
                      {nudge.title}
                    </option>
                  ))}
                </select>
                <Button
                  variant='primary'
                  disabled={sendingId !== null}
                  onClick={() => void sendNow(testTarget)}
                >
                  {sendingId === testTarget.id ? "Sending…" : "Send test"}
                </Button>
              </div>
            ) : (
              <Button variant='primary' onClick={() => setEditing("new")}>
                Add your first nudge
              </Button>
            )}
          </div>
        )}
      </section>
      {message && (
        <p className={styles.message} role='status'>
          {message}
        </p>
      )}
      {selected && (
        <ReviewCard
          nudge={selected}
          onDone={async (action, hours) => {
            await recordNudgeFeedback(selected, action, hours);
            setParams({});
            setMessage(
              action === "remembered"
                ? "Marked remembered. Its interval is now longer."
                : action === "forgot"
                ? "Marked for an earlier return."
                : action === "archive"
                ? "Nudge archived."
                : "Nudge snoozed."
            );
            await refresh();
          }}
        />
      )}
      <div className={styles.toolbar}>
        <label>
          <Icon name='search' size={16} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder='Filter nudges…'
          />
        </label>
        {selecting ? (
          <div className={styles.bulkActions}>
            <strong>{selectedIds.size} selected</strong>
            <button
              type='button'
              onClick={() =>
                setSelectedIds((current) =>
                  visible.every((item) => current.has(item.id))
                    ? new Set()
                    : new Set(visible.map((item) => item.id))
                )
              }
            >
              {visible.length > 0 &&
              visible.every((item) => selectedIds.has(item.id))
                ? "Clear all"
                : "Select all shown"}
            </button>
            <Button
              size='sm'
              variant='danger'
              disabled={selectedIds.size === 0}
              onClick={() => setDeleteOpen(true)}
            >
              <Icon name='trash' size={14} /> Delete
            </Button>
          </div>
        ) : (
          <span>
            {nudges.filter((item) => item.active).length} active ·{" "}
            {nudges.length} total
          </span>
        )}
      </div>
      {!loading && visible.length === 0 ? (
        <EmptyState
          icon='sparkle'
          title='No memory nudges yet'
          description='Add one important fact, quote or mistake you never want to forget.'
          action={
            <Button variant='primary' onClick={() => setEditing("new")}>
              Create first nudge
            </Button>
          }
        />
      ) : (
        <div className={styles.grid}>
          {visible.map((nudge) => (
            <article
              className={`${styles.card} ${
                !nudge.active ? styles.paused : ""
              } ${selectedIds.has(nudge.id) ? styles.cardSelected : ""}`}
              key={nudge.id}
              onClick={selecting ? () => toggleSelected(nudge.id) : undefined}
            >
              <header>
                <div className={styles.cardType}>
                  {selecting && (
                    <label
                      className={styles.selector}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type='checkbox'
                        checked={selectedIds.has(nudge.id)}
                        onChange={() => toggleSelected(nudge.id)}
                        aria-label={`Select ${nudge.title}`}
                      />
                      <span>
                        <Icon name='check' size={12} />
                      </span>
                    </label>
                  )}
                  <span>{nudge.kind}</span>
                </div>
                <div aria-label={`Priority ${nudge.priority}`}>
                  {"●".repeat(nudge.priority)}
                  <i>{"●".repeat(5 - nudge.priority)}</i>
                </div>
              </header>
              <h2>{nudge.title}</h2>
              <p>{nudge.content}</p>
              {nudge.tags.length > 0 && (
                <div className={styles.tags}>
                  {nudge.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              )}
              <footer>
                <small>
                  {nudge.sendCount} deliveries · {nudge.cooldownHours}h cooldown
                </small>
                {!selecting && (
                  <div>
                    <button
                      className={styles.sendNow}
                      disabled={sendingId !== null}
                      onClick={() => void sendNow(nudge)}
                    >
                      {sendingId === nudge.id ? "Sending…" : "Send now"}
                    </button>
                    <button
                      onClick={() => {
                        setSelected(nudge);
                        setParams({ id: nudge.id });
                      }}
                    >
                      Review
                    </button>
                    <button onClick={() => setEditing(nudge)}>Edit</button>
                    <button
                      onClick={async () => {
                        await setNudgeActive(nudge.id, !nudge.active);
                        await refresh();
                      }}
                    >
                      {nudge.active ? "Pause" : "Resume"}
                    </button>
                  </div>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <NudgeEditor
          nudge={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            if (editing === "new") await createNudge(value);
            else await updateNudge(editing.id, value);
            setEditing(null);
            setMessage("Nudge saved.");
            await refresh();
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImport={async (items) => {
            await createNudges(items);
            setImportOpen(false);
            setMessage(`${items.length} nudges imported.`);
            await refresh();
          }}
        />
      )}
      {deleteOpen && (
        <DeleteNudgesDialog
          count={selectedIds.size}
          deleting={deleting}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void deleteSelected()}
        />
      )}
    </Page>
  );
}

function DeleteNudgesDialog({
  count,
  deleting,
  onCancel,
  onConfirm,
}: {
  count: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.backdrop} onMouseDown={onCancel}>
      <section
        className={styles.deleteDialog}
        role='alertdialog'
        aria-modal='true'
        aria-labelledby='delete-nudges-title'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={styles.dangerIcon}>
          <Icon name='trash' size={22} />
        </span>
        <h2 id='delete-nudges-title'>
          Delete {count} {count === 1 ? "nudge" : "nudges"}?
        </h2>
        <p>
          This permanently removes the selected content and its review history.
          This action cannot be undone.
        </p>
        <footer>
          <Button disabled={deleting} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant='danger' disabled={deleting} onClick={onConfirm}>
            {deleting ? "Deleting…" : `Delete ${count}`}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function ReviewCard({
  nudge,
  onDone,
}: {
  nudge: MemoryNudge;
  onDone: (
    action: "remembered" | "forgot" | "snooze" | "archive",
    hours?: number
  ) => Promise<void>;
}) {
  return (
    <section className={styles.review}>
      <span>
        {nudge.kind} · priority {nudge.priority}
      </span>
      <h2>{nudge.title}</h2>
      <blockquote>{nudge.content}</blockquote>
      {nudge.context && <p>{nudge.context}</p>}
      {nudge.source && <small>Source: {nudge.source}</small>}
      <p className={styles.reviewPrompt}>How well did you recall this?</p>
      <div className={styles.reviewActions}>
        <button type='button' onClick={() => void onDone("remembered")}>
          <strong>Remembered</strong>
          <small>Show less often</small>
        </button>
        <button type='button' onClick={() => void onDone("forgot")}>
          <strong>Forgot it</strong>
          <small>Bring it back sooner</small>
        </button>
        <button type='button' onClick={() => void onDone("snooze", 24)}>
          <strong>Remind tomorrow</strong>
          <small>Snooze for 24 hours</small>
        </button>
        <button type='button' onClick={() => void onDone("archive")}>
          <strong>Archive</strong>
          <small>Stop reminders, keep saved</small>
        </button>
      </div>
    </section>
  );
}

function NudgeEditor({
  nudge,
  onClose,
  onSave,
}: {
  nudge: MemoryNudge | null;
  onClose: () => void;
  onSave: (value: EditorValue) => Promise<void>;
}) {
  const library = useLibrary();
  const [value, setValue] = useState<EditorValue>(
    nudge
      ? {
          kind: nudge.kind,
          title: nudge.title,
          content: nudge.content,
          context: nudge.context,
          source: nudge.source,
          sourceUrl: nudge.sourceUrl,
          tags: nudge.tags,
          priority: nudge.priority,
          cooldownHours: nudge.cooldownHours,
        }
      : blank
  );
  const initialChapterId = nudge?.sourceUrl?.startsWith("/chapter/")
    ? nudge.sourceUrl.replace("/chapter/", "")
    : "";
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"none" | "chapter" | "external">(
    initialChapterId ? "chapter" : nudge?.source || nudge?.sourceUrl ? "external" : "none"
  );
  const [chapterId, setChapterId] = useState(initialChapterId);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...value,
        title: value.title.trim() || titleFromContent(value.content, value.kind),
        source: sourceMode === "none" ? "" : value.source.trim(),
        sourceUrl: sourceMode === "none" ? "" : value.sourceUrl.trim(),
        tags: value.tags.filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <form
        className={styles.editor}
        onSubmit={(event) => void submit(event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Memory nudge</span>
            <h2>{nudge ? "Edit nudge" : "Add something worth remembering"}</h2>
          </div>
          <button type='button' onClick={onClose}>
            <Icon name='close' />
          </button>
        </header>
        <p className={styles.quickHint}>
          Only the memory is required. Everything else has a sensible default.
        </p>
        <div className={styles.quickFields}>
          <label>
            What should return later? <strong>Required</strong>
            <textarea
              autoFocus
              required
              maxLength={500}
              rows={5}
              value={value.content}
              onChange={(event) =>
                setValue({ ...value, content: event.target.value })
              }
              placeholder='Paste a fact, insight, mistake, quote, or anything you do not want to forget…'
            />
            <small>{value.content.length}/500</small>
          </label>
          <fieldset className={styles.kindPicker}>
            <legend>Type <span>Optional</span></legend>
            {KINDS.map((kind) => (
              <button
                type='button'
                key={kind}
                className={value.kind === kind ? styles.kindActive : ""}
                onClick={() => setValue({ ...value, kind })}
              >
                {kind}
              </button>
            ))}
          </fieldset>
        </div>
        <button
          className={styles.advancedToggle}
          type='button'
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span>
            <Icon name='settings' size={16} />
            <span><strong>Customize</strong><small>Title, context, source and delivery</small></span>
          </span>
          <Icon className={advancedOpen ? styles.chevronOpen : ""} name='chevronRight' size={16} />
        </button>
        {advancedOpen && (
          <div className={styles.advancedFields}>
            <label>
              Custom title <span>Optional</span>
              <input
                maxLength={120}
                value={value.title}
                placeholder={titleFromContent(value.content, value.kind)}
                onChange={(event) => setValue({ ...value, title: event.target.value })}
              />
            </label>
            <label>
              Helpful context <span>Optional</span>
              <textarea
                rows={2}
                value={value.context}
                placeholder='Why this matters or where it applies'
                onChange={(event) => setValue({ ...value, context: event.target.value })}
              />
            </label>
            <label>
              Source
              <select
                value={sourceMode}
                onChange={(event) => {
                  const mode = event.target.value as typeof sourceMode;
                  setSourceMode(mode);
                  if (mode === "none") setValue({ ...value, source: "", sourceUrl: "" });
                }}
              >
                <option value='none'>No source</option>
                <option value='chapter'>Chapter in my library</option>
                <option value='external'>External link or reference</option>
              </select>
            </label>
            {sourceMode === "chapter" && (
              <label>
                Library chapter
                <select
                  value={chapterId}
                  onChange={(event) => {
                    const id = event.target.value;
                    const chapter = library.status === "success"
                      ? library.data.find((item) => item.id === id)
                      : undefined;
                    setChapterId(id);
                    setValue({
                      ...value,
                      source: chapter?.title ?? "",
                      sourceUrl: id ? Routes.chapter(id) : "",
                    });
                  }}
                >
                  <option value=''>Select a chapter…</option>
                  {library.status === "success" && library.data.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.subject} · {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sourceMode === "external" && (
              <div className={styles.sourcePair}>
                <label>
                  Source name <span>Optional</span>
                  <input
                    value={value.source}
                    placeholder='Book, article, lecture…'
                    onChange={(event) => setValue({ ...value, source: event.target.value })}
                  />
                </label>
                <label>
                  URL <span>Optional</span>
                  <input
                    type='url'
                    value={value.sourceUrl}
                    placeholder='https://…'
                    onChange={(event) => setValue({ ...value, sourceUrl: event.target.value })}
                  />
                </label>
              </div>
            )}
            <div className={styles.sourcePair}>
              <label>
                Tags <span>Optional</span>
                <input
                  value={value.tags.join(", ")}
                  onChange={(event) => setValue({ ...value, tags: event.target.value.split(",").map((item) => item.trim()) })}
                  placeholder='history, economy'
                />
              </label>
              <label>
                Priority
                <select value={value.priority} onChange={(event) => setValue({ ...value, priority: Number(event.target.value) })}>
                  {[1, 2, 3, 4, 5].map((item) => (
                    <option value={item} key={item}>{item} — {item === 5 ? "Crucial" : item === 1 ? "Occasional" : "Normal"}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Minimum time before repeating
              <select value={value.cooldownHours} onChange={(event) => setValue({ ...value, cooldownHours: Number(event.target.value) })}>
                {[6, 12, 24, 48, 72, 168, 336, 720].map((item) => (
                  <option value={item} key={item}>{item < 24 ? `${item} hours` : `${item / 24} days`}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant='primary' type='submit' disabled={saving}>
            {saving ? "Saving…" : "Save nudge"}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (items: EditorValue[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const submit = async () => {
    if (importing) return;
    setError("");
    try {
      let raw: Partial<EditorValue>[];
      if (text.trim().startsWith("["))
        raw = JSON.parse(text) as Partial<EditorValue>[];
      else {
        const [header, ...rows] = text
          .trim()
          .split(/\r?\n/)
          .map((line) => line.split(",").map((cell) => cell.trim()));
        if (!header?.length || rows.length === 0)
          throw new Error("Paste a JSON array or CSV rows.");
        raw = rows.map((row) =>
          Object.fromEntries(
            header.map((key, index) => [
              key,
              key === "priority" || key === "cooldownHours"
                ? Number(row[index])
                : key === "tags"
                ? (row[index] ?? "").split("|")
                : row[index],
            ])
          )
        );
      }
      if (!Array.isArray(raw) || raw.length === 0)
        throw new Error("The import contains no nudges.");
      const items = raw.map((item) => ({
        ...blank,
        ...item,
        tags: Array.isArray(item.tags) ? item.tags : [],
      }));
      if (items.some((item) => !item.title?.trim() || !item.content?.trim()))
        throw new Error("Every item needs title and content.");
      if (items.some((item) => !KINDS.includes(item.kind)))
        throw new Error(`Type must be one of: ${KINDS.join(", ")}.`);
      if (items.some((item) => item.priority < 1 || item.priority > 5))
        throw new Error("Priority must be between 1 and 5.");
      setImportCount(items.length);
      setImporting(true);
      await onImport(items);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Invalid import data."
      );
      setImporting(false);
    }
  };
  return (
    <div
      className={styles.backdrop}
      onMouseDown={() => {
        if (!importing) onClose();
      }}
    >
      <section
        className={styles.importDialog}
        aria-busy={importing}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>Import nudges</h2>
        <p>
          Paste a JSON array or CSV with title and content columns. Separate CSV
          tags with |.
        </p>
        <textarea
          rows={12}
          disabled={importing}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='[{"title":"Battle of Buxar","content":"Fought in 1764","priority":5}]'
        />
        {importing && (
          <div className={styles.importProgress} role='status'>
            <span />
            <div>
              <strong>Importing {importCount} nudges…</strong>
              <small>
                Please keep this window open while they are saved securely.
              </small>
            </div>
          </div>
        )}
        {error && <small>{error}</small>}
        <footer>
          <Button disabled={importing} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant='primary'
            disabled={importing || !text.trim()}
            onClick={() => void submit()}
          >
            {importing ? "Importing…" : "Import nudges"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
