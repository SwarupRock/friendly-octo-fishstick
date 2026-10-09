import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AudioLines, Check, Copy, Download, History, LogOut, Pencil, Plus, Send, Sparkles, X,
} from 'lucide-react';
import {
  createAudioCampaign, createPlan, createTextCampaign, errorMessage, exportCampaign,
  fetchAssetObjectUrl, generateCaptions, generatePosters, getCampaign, humanVerifyAsset,
  listAssets, listCampaigns, loadSession, lockFactSheet, openSttStream, patchFactSheet,
  verifyCampaign,
} from '../lib/api';
import { useAuth } from '../AuthContext';
import ThemeToggle from '../ThemeToggle';
import Wordmark from '../Wordmark.jsx';
import VoicePill from '../voice/VoicePill';
import { useMicRecorder } from '../voice/useMicRecorder';
import '../auth.css';
import './voice-workspace.css';

/**
 * The shopkeeper's workspace: a microphone and a thread.
 *
 * There is no pipeline to understand. Hold the mic, speak, let go — the offer
 * is transcribed, confirmed, and turned into ready-to-share posts. Past
 * sessions stay in the side rail.
 */

function summarize(facts) {
  const business = facts?.business ?? {};
  const offer = facts?.offer ?? {};
  const rows = [];
  if (business.name) rows.push({ label: 'Business', value: business.name });
  const product = (offer.product ?? []).filter(Boolean);
  if (product.length) rows.push({ label: 'Offer', value: product.join(', ') });
  if (offer.discount_percent) rows.push({ label: 'Discount', value: `${offer.discount_percent}% off` });
  if (offer.discount_flat) rows.push({ label: 'Discount', value: `${offer.discount_flat} off` });
  if (offer.price) rows.push({ label: 'Price', value: String(offer.price) });
  if ((offer.days ?? []).length) rows.push({ label: 'Days', value: offer.days.join(', ') });
  const time = [offer.start_time, offer.end_time].filter(Boolean).join(' – ');
  if (time) rows.push({ label: 'Time', value: time });
  if (offer.location) rows.push({ label: 'Where', value: offer.location });
  if ((offer.conditions ?? []).length) rows.push({ label: 'Conditions', value: offer.conditions.join(', ') });
  return rows;
}

function shortLabel(campaign) {
  const name = campaign.factsheet?.facts?.business?.name;
  if (name) return name;
  return campaign.input_type === 'audio' ? 'Voice note' : 'Typed offer';
}

export default function VoiceWorkspace() {
  const { user, checking, logout } = useAuth();
  const navigate = useNavigate();
  const mic = useMicRecorder();

  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [assets, setAssets] = useState([]);
  const [posterUrl, setPosterUrl] = useState(null);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const [typed, setTyped] = useState('');
  // Live transcription preview while the speaker is still talking.
  const [liveText, setLiveText] = useState('');
  const [liveNote, setLiveNote] = useState('');
  const [liveIsMock, setLiveIsMock] = useState(false);
  const streamRef = useRef(null);
  const threadRef = useRef(null);

  // A signed-out visitor must land on the login page — rendering `null` here
  // would leave a blank screen with no way forward.
  useEffect(() => {
    if (!checking && !user) navigate('/login', { replace: true });
  }, [checking, user, navigate]);

  const loadSessions = useCallback(async (signal) => {
    try {
      setSessions(await listCampaigns({ signal }));
    } catch {
      /* the offline banner already covers this */
    }
  }, []);

  useEffect(() => {
    // Nothing to fetch until there is a session; this also avoids a stray
    // 401 while a signed-out visitor is being redirected to /login.
    if (!user) return undefined;
    const controller = new AbortController();
    loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions, user]);

  const openSession = useCallback(async (campaign) => {
    setHistoryOpen(false);
    setError('');
    setLog([]);
    setBusy('');
    setFixOpen(false);
    setSession(campaign);
    setAssets(campaign.assets ?? []);
    setPosterUrl(null);
    try {
      const fresh = await getCampaign(campaign.id);
      setSession(fresh);
      const list = await listAssets(fresh.id);
      setAssets(list);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const startNew = useCallback(() => {
    setSession(null);
    setAssets([]);
    setPosterUrl(null);
    setLog([]);
    setError('');
    setBusy('');
    setFixOpen(false);
    setHistoryOpen(false);
  }, []);

  // Turn the newest poster into an object URL (asset bytes need the token, so
  // a plain <img src> cannot fetch them).
  useEffect(() => {
    const poster = assets.find((a) => a.kind === 'poster');
    if (!poster || !session) {
      setPosterUrl(null);
      return undefined;
    }
    let revoked = false;
    let url = '';
    fetchAssetObjectUrl(poster.id)
      .then((next) => {
        if (revoked) {
          URL.revokeObjectURL(next);
          return;
        }
        url = next;
        setPosterUrl(next);
      })
      .catch(() => setPosterUrl(null));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assets, session]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [busy, log, session, assets]);

  // ── recording ─────────────────────────────────────────────────────────
  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  const handleStart = useCallback(async () => {
    setLiveText('');
    setLiveNote('');
    await mic.start({ onChunk: (buffer) => streamRef.current?.send(buffer) });
    // Open the preview only once the microphone is actually live.
    streamRef.current = openSttStream({
      token: loadSession()?.token,
      language: 'en',
      onEvent: (event) => {
        if (event.type === 'ready') {
          setLiveIsMock(Boolean(event.is_mock));
        } else if (event.type === 'partial' || event.type === 'final') {
          if (event.text) setLiveText(event.text);
        } else if (event.type === 'unavailable') {
          setLiveNote(event.reason || '');
        } else if (event.type === 'error') {
          setLiveNote(event.message || '');
        }
      },
    });
  }, [mic]);

  const handleStop = useCallback(
    async ({ reason }) => {
      if (reason === 'cancel' || reason === 'escape') {
        mic.cancel();
        closeStream();
        setLiveText('');
        setLiveNote('');
        return;
      }
      // 'unmount'/'disabled'/'error' mean nothing was captured to save.
      if (reason === 'unmount' || reason === 'disabled' || reason === 'error') return;

      setError('');
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.stop(); // preview is done; the clip below is authoritative
      const blob = await mic.stop();
      if (!blob) {
        stream?.close();
        setLiveText('');
        setError('Nothing was recorded. Hold the mic and speak.');
        return;
      }
      setBusy('Listening to what you said…');
      try {
        const created = await createAudioCampaign({ blob, mimeType: blob.type });
        setSession(created);
        setAssets(created.assets ?? []);
        setLog([{ label: 'Offer captured', detail: 'Transcribed and checked' }]);
        loadSessions();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        stream?.close();
        setLiveText('');
        setLiveNote('');
        setBusy('');
      }
    },
    [mic, loadSessions, closeStream],
  );

  const submitTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    setError('');
    setBusy('Reading your offer…');
    try {
      const created = await createTextCampaign({ text });
      setSession(created);
      setAssets(created.assets ?? []);
      setLog([{ label: 'Offer captured', detail: 'Read and checked' }]);
      setTyped('');
      loadSessions();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }, [typed, loadSessions]);

  // ── one-tap confirm: seal facts, then make the posts ──────────────────
  const confirmAndCreate = useCallback(async () => {
    if (!session?.factsheet) return;
    setError('');
    setFixOpen(false);
    setLog([]);
    const steps = [
      ['Locking your offer', () => lockFactSheet(session.factsheet.id)],
      ['Writing your posts', () => createPlan(session.id)],
      ['Drafting the captions', () => generateCaptions(session.id)],
      ['Designing the poster', () => generatePosters(session.id, 1)],
      ['Checking every number', () => verifyCampaign(session.id)],
    ];
    for (const [label, run] of steps) {
      setBusy(label);
      try {
        await run();
        setLog((prev) => [...prev, { label, detail: 'Done' }]);
      } catch (err) {
        setLog((prev) => [...prev, { label, detail: errorMessage(err), failed: true }]);
        setError(errorMessage(err));
        break;
      }
    }
    setBusy('');
    try {
      const fresh = await getCampaign(session.id);
      setSession(fresh);
      setAssets(await listAssets(session.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [session]);

  const saveEdits = useCallback(async () => {
    if (!session?.factsheet) return;
    const patch = {};
    if (draft.businessName !== undefined) patch.business = { name: draft.businessName.trim() || null };
    if (draft.product !== undefined) patch.offer = { product: draft.product.split(',').map((v) => v.trim()).filter(Boolean) };
    if (Object.keys(patch).length === 0) {
      setFixOpen(false);
      return;
    }
    setBusy('Saving your correction…');
    try {
      const sheet = await patchFactSheet(session.factsheet.id, patch);
      const fresh = await getCampaign(session.id);
      setSession({ ...fresh, factsheet: sheet });
      setFixOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }, [session, draft]);

  const acceptResults = useCallback(async () => {
    // Only assets Guardian actually reached a verdict on can be accepted;
    // human-verify refuses anything unverified.
    const pending = assets.filter((a) => a.asset_status === 'needs_review');
    if (!pending.length) return;
    setBusy('Saving your review…');
    try {
      for (const asset of pending) {
        await humanVerifyAsset(asset.id, 'Reviewed in the voice workspace.');
      }
      setAssets(await listAssets(session.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }, [assets, session]);

  const downloadPack = useCallback(async () => {
    setBusy('Preparing your download…');
    try {
      const bundle = await exportCampaign(session.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `svarah-offer-${session.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }, [session]);

  const facts = session?.factsheet?.facts;
  const rows = useMemo(() => summarize(facts), [facts]);
  const locked = session?.factsheet?.status === 'locked' || session?.factsheet?.status === 'superseded';
  const captions = assets.filter((a) => a.kind === 'caption' && a.text_content);
  const master = captions.find((c) => c.locale === 'en-IN') ?? captions[0];
  const poster = assets.find((a) => a.kind === 'poster');
  const needsReview = assets.some((a) => a.status === 'needs_review' || a.asset_status === 'needs_review');
  const ready = Boolean(poster) && assets.length > 0 && !needsReview;

  if (checking) {
    return <div className="vw-loading">One moment…</div>;
  }
  if (!user) return null;

  return (
    <div className="vw-root">
      <header className="vw-head">
        <Wordmark className="vw-head-logo" />

        <button type="button" className="vw-ghost" onClick={startNew} title="Start a new offer">
          <Plus size={15} /> New offer
        </button>

        <button type="button" className="vw-ghost" onClick={() => setHistoryOpen((v) => !v)}>
          <History size={15} /> History
        </button>

        <span className="vw-grow" />

        <ThemeToggle />
        <span className="vw-avatar" title={user.name}>{user.avatar}</span>
        <button
          type="button"
          className="vw-ghost"
          onClick={() => {
            logout();
            // Leave the workspace explicitly: without this the route keeps
            // rendering with no user and the screen goes blank.
            navigate('/', { replace: true });
          }}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={15} />
          <span className="vw-signout-label">Sign out</span>
        </button>
      </header>

      <div className="vw-body">
        {historyOpen ? (
          <aside className="vw-rail">
            <span className="vw-rail-label">Past offers</span>
            {sessions.length === 0 ? (
              <p className="vw-rail-empty">Nothing yet. Your first offer will appear here.</p>
            ) : (
              sessions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`vw-rail-item ${session?.id === item.id ? 'is-on' : ''}`}
                  onClick={() => openSession(item)}
                >
                  <b>{shortLabel(item)}</b>
                  <small>{new Date(item.created_at).toLocaleDateString()}</small>
                </button>
              ))
            )}
          </aside>
        ) : null}

        <main className="vw-thread" ref={threadRef}>
          {!session && !busy ? (
            <div className="vw-hello">
              <span className="vw-hello-mark"><AudioLines size={26} /></span>
              <h1>What are you offering today?</h1>
              <p>Hold the microphone and say it in your own words.</p>
            </div>
          ) : null}

          {mic.recording || liveText ? (
            <div className="vw-row is-user">
              <div className="vw-bubble is-user is-live">
                <span className="vw-tag">
                  <span className="vw-live-dot" /> Live{liveIsMock ? ' · demo transcript' : ''}
                </span>
                {liveText || liveNote || 'Listening…'}
                {liveText ? <span className="vw-caret" aria-hidden="true" /> : null}
              </div>
            </div>
          ) : null}

          {session?.transcript?.raw ? (
            <div className="vw-row is-user">
              <div className="vw-bubble is-user">
                <span className="vw-tag">You said</span>
                {session.transcript.raw}
              </div>
            </div>
          ) : null}

          {session && !session.transcript?.raw && session.input_type === 'audio' ? (
            <div className="vw-row is-user">
              <div className="vw-bubble is-user is-muted">Voice note — no words were detected.</div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="vw-row">
              <div className="vw-bubble is-app">
                <span className="vw-tag"><Sparkles size={11} /> Here is what I understood</span>
                <dl className="vw-facts">
                  {rows.map((row) => (
                    <React.Fragment key={row.label + row.value}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>

                {fixOpen ? (
                  <div className="vw-fix">
                    <label>
                      Business name
                      <input
                        type="text"
                        value={draft.businessName ?? facts?.business?.name ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
                      />
                    </label>
                    <label>
                      Offer
                      <input
                        type="text"
                        value={draft.product ?? (facts?.offer?.product ?? []).join(', ')}
                        onChange={(e) => setDraft((d) => ({ ...d, product: e.target.value }))}
                      />
                    </label>
                    <div className="vw-actions">
                      <button type="button" className="vw-btn is-primary" onClick={saveEdits} disabled={Boolean(busy)}>
                        <Check size={14} /> Save
                      </button>
                      <button type="button" className="vw-ghost" onClick={() => { setFixOpen(false); setDraft({}); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {!locked && !fixOpen ? (
                  <div className="vw-actions">
                    <button type="button" className="vw-btn is-primary" onClick={confirmAndCreate} disabled={Boolean(busy)}>
                      <Check size={14} /> Looks right — make my posts
                    </button>
                    <button type="button" className="vw-ghost" onClick={() => setFixOpen(true)} disabled={Boolean(busy)}>
                      <Pencil size={13} /> Fix something
                    </button>
                  </div>
                ) : null}

                {locked && !poster && !busy ? (
                  <div className="vw-actions">
                    <button type="button" className="vw-btn is-primary" onClick={confirmAndCreate}>
                      <Sparkles size={14} /> Make my posts
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {log.length > 0 ? (
            <div className="vw-row">
              <div className="vw-progress">
                {log.map((line) => (
                  <span key={line.label} className={`vw-step ${line.failed ? 'is-bad' : ''}`}>
                    {line.failed ? <X size={12} /> : <Check size={12} />} {line.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {busy ? (
            <div className="vw-row">
              <div className="vw-bubble is-app is-thinking">
                <span className="vw-dots"><i /><i /><i /></span> {busy}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="vw-row">
              <div className="vw-bubble is-warn">{error}</div>
            </div>
          ) : null}

          {poster && captions.length > 0 ? (
            <div className="vw-row">
              <div className="vw-bubble is-app">
                <span className="vw-tag"><Sparkles size={11} /> Ready to share</span>
                {posterUrl ? (
                  <img className="vw-poster" src={posterUrl} alt="Your promotional poster" />
                ) : (
                  <div className="vw-poster is-loading" />
                )}
                {master ? <p className="vw-caption">{master.text_content}</p> : null}
                <div className="vw-actions">
                  {master ? (
                    <button
                      type="button"
                      className="vw-ghost"
                      onClick={() => navigator.clipboard?.writeText(master.text_content)}
                    >
                      <Copy size={13} /> Copy caption
                    </button>
                  ) : null}
                  <button type="button" className="vw-btn is-primary" onClick={downloadPack} disabled={Boolean(busy)}>
                    <Download size={14} /> Download
                  </button>
                </div>
                {needsReview ? (
                  <>
                    <p className="vw-note">
                      One check could not finish by itself, so please glance at the poster above.
                    </p>
                    <button type="button" className="vw-btn is-primary" onClick={acceptResults} disabled={Boolean(busy)}>
                      <Check size={14} /> Looks right to me
                    </button>
                  </>
                ) : ready ? (
                  <p className="vw-note is-good"><Check size={13} /> Every number matches your offer.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {captions.length > 0 && !poster ? (
            <div className="vw-row">
              <div className="vw-bubble is-app">
                <span className="vw-tag">Your captions</span>
                {captions.slice(0, 3).map((c) => (
                  <p key={c.id} className="vw-caption">{c.text_content}</p>
                ))}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <footer className="vw-dock">
        {mic.supported ? (
          <VoicePill
            accentColor="#f5f5f5"
            iconColor="#a1a1aa"
            background="#27272a"
            size={44}
            shape="pill"
            reach={8}
            showTime
            waveform
            slideToCancel
            cancelDistance={64}
            attack={40}
            release={240}
            sensitivity={1}
            floor={0.1}
            openDuration={200}
            pressScale={0.95}
            mode="auto"
            holdAfter={300}
            reactive="external"
            maxSeconds={120}
            iconSize={30}
            ariaLabel="Hold or tap to speak"
            getLevel={mic.getLevel}
            disabled={Boolean(busy)}
            onStart={handleStart}
            onStop={handleStop}
          />
        ) : (
          <div className="vw-type">
            <input
              type="text"
              value={typed}
              placeholder="Type your offer instead…"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }}
            />
            <button type="button" className="vw-btn is-primary" onClick={submitTyped} disabled={Boolean(busy) || !typed.trim()}>
              <Send size={14} />
            </button>
          </div>
        )}
        {mic.error ? <p className="vw-note is-bad">{mic.error}</p> : null}
      </footer>
    </div>
  );
}
