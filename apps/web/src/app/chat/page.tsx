'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChatChannel, ChatMessageView, ReportReason } from '@unlikelyland/contracts';
import { REPORT_REASONS, REPORT_REASON_LABEL } from '@unlikelyland/contracts';

const CHANNELS: { key: ChatChannel; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'region', label: 'Region' },
  { key: 'guild', label: 'Guild' },
];
import { api, ApiError, clearToken, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function ChatPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<ChatChannel>('global');
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Which message (if any) currently has its report reason picker open.
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  // Re-entrancy guard so the 5s poll never overlaps with itself or a manual load.
  const polling = useRef(false);

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        router.replace('/login');
        return true;
      }
      return false;
    },
    [router],
  );

  // Poll the newest page. Merge (dedup by id) so any already-loaded older
  // messages are preserved across refreshes.
  const load = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const page = await api.chat.list(channel);
      setMessages((prev) => {
        const seen = new Set(page.messages.map((m) => m.id));
        // Keep older (lower) messages we already had that aren't in this page.
        const kept = prev.filter((m) => !seen.has(m.id));
        return [...kept, ...page.messages];
      });
      // hasOlder reflects whether more history exists before the loaded set.
      setHasOlder((prev) => page.hasOlder || prev);
    } catch (e) {
      handleAuthError(e);
    } finally {
      polling.current = false;
    }
  }, [handleAuthError, channel]);

  // Switch channels: clear the feed so the new channel's messages don't merge
  // with the previous one's.
  function switchChannel(next: ChatChannel) {
    if (next === channel) return;
    setMessages([]);
    setHasOlder(false);
    setError(null);
    setChannel(next);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [router, load]);

  // Near-realtime: an SSE pulse on this channel triggers an immediate refetch.
  // Polling above remains the fallback if the stream drops.
  useEffect(() => {
    if (!getToken()) return;
    const es = new EventSource('/api/chat/stream');
    es.onmessage = (ev) => {
      try {
        const pulse = JSON.parse(ev.data) as { channelType?: string };
        if (pulse.channelType === channel) void load();
      } catch {
        /* ignore malformed pulse */
      }
    };
    // On error the browser auto-reconnects; the 5s poll covers any gap.
    return () => es.close();
  }, [channel, load]);

  // Auto-scroll to the newest message when the message list grows at the bottom.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const page = await api.chat.list(channel, oldest.id);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
      setHasOlder(page.hasOlder);
    } catch (e) {
      if (!handleAuthError(e)) {
        setError(e instanceof ApiError ? e.message : 'Could not load older messages');
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.chat.send(trimmed, channel);
      setBody('');
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof ApiError ? err.message : 'Could not send');
      }
    } finally {
      setBusy(false);
    }
  }

  async function report(messageId: string, reason: ReportReason) {
    setBusy(true);
    setError(null);
    try {
      await api.report({ targetType: 'chat', targetMessageId: messageId, reason });
      setReporting(null);
      setReportNote('Reported. The haunted clipboard will take a look.');
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof ApiError ? err.message : 'Could not report');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Chat</h1>
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              className={`btn inline ${channel === c.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => switchChannel(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="card" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {hasOlder ? (
            <div className="row" style={{ justifyContent: 'center', marginBottom: 8 }}>
              <button className="btn btn-ghost inline" disabled={loadingOlder} onClick={loadOlder}>
                {loadingOlder ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="empty">
              {channel === 'guild'
                ? 'No guild chat yet — join a guild to talk with your members.'
                : channel === 'region'
                  ? 'No one in your region set has spoken yet.'
                  : 'Quiet in here. Say something — the haunted clipboard is listening.'}
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {messages.map((m) => (
                <div key={m.id}>
                  <div className="row wrap" style={{ gap: 6, alignItems: 'baseline' }}>
                    {m.guildTag ? <span className="badge">{m.guildTag}</span> : null}
                    {m.mine ? (
                      <span className="tiny" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {m.displayName}
                      </span>
                    ) : (
                      <Link
                        href={`/u/${m.characterId}`}
                        className="tiny"
                        style={{ fontWeight: 700, color: 'var(--muted)' }}
                      >
                        {m.displayName}
                      </Link>
                    )}
                    <span className="tiny muted">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    {!m.mine ? (
                      <button
                        className="btn btn-ghost inline tiny"
                        title="Report this message"
                        disabled={busy}
                        onClick={() => {
                          setReportNote(null);
                          setReporting((cur) => (cur === m.id ? null : m.id));
                        }}
                      >
                        ⚑
                      </button>
                    ) : null}
                  </div>
                  <span className="small">{m.body}</span>
                  {reporting === m.id ? (
                    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      <select
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => {
                          const reason = e.target.value as ReportReason;
                          if (reason) void report(m.id, reason);
                        }}
                      >
                        <option value="" disabled>
                          Reason…
                        </option>
                        {REPORT_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {REPORT_REASON_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost inline" disabled={busy} onClick={() => setReporting(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
        {reportNote ? <div className="notice">{reportNote}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        <form className="row" onSubmit={send}>
          <input
            className="grow"
            maxLength={300}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Be nice. PG-13. The clipboard audits everything."
          />
          <button className="btn inline btn-primary" disabled={busy || !body.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}
