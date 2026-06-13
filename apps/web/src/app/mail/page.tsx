'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MailboxView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function MailPage() {
  const router = useRouter();
  const [box, setBox] = useState<MailboxView | null>(null);
  const [tab, setTab] = useState<'inbox' | 'outbox'>('inbox');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);

  const refresh = useCallback(async () => {
    setBox(await api.mail.box());
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    refresh().catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router, refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.mail.send({ recipientName: to, subject: subject || undefined, body });
      setTo('');
      setSubject('');
      setBody('');
      setComposing(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  if (!box) {
    return (
      <>
        <TopNav />
        <div className="container">
          <div className="spinner">Loading…</div>
        </div>
      </>
    );
  }

  const list = tab === 'inbox' ? box.inbox : box.outbox;

  return (
    <>
      <TopNav />
      <div className="container">
        <div className="row between mb">
          <h1 style={{ margin: 0 }}>Mail{box.unread > 0 ? ` (${box.unread})` : ''}</h1>
          <button className="btn inline btn-primary" onClick={() => setComposing((c) => !c)}>
            {composing ? 'Close' : 'Compose'}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}

        {composing ? (
          <form className="card" onSubmit={send}>
            <div className="field">
              <label>To (player name)</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="field">
              <label>Subject (optional)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={busy || !to || !body.trim()}>
              Send
            </button>
          </form>
        ) : null}

        <div className="row mb">
          <button className={`btn inline ${tab === 'inbox' ? 'btn-primary' : ''}`} onClick={() => setTab('inbox')}>
            Inbox
          </button>
          <button className={`btn inline ${tab === 'outbox' ? 'btn-primary' : ''}`} onClick={() => setTab('outbox')}>
            Sent
          </button>
        </div>

        <div className="card">
          {list.length === 0 ? (
            <div className="empty">Empty. Nobody loves you yet. (Or you them.)</div>
          ) : (
            <div className="col">
              {list.map((m) => (
                <div
                  key={m.id}
                  className="stat"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, opacity: m.direction === 'in' && !m.read ? 1 : 0.85 }}
                >
                  <div className="row between">
                    <b>
                      {m.subject || '(no subject)'} {m.direction === 'in' && !m.read ? <span className="badge">new</span> : null}
                    </b>
                    <span className="tiny muted">
                      {m.direction === 'in' ? 'from' : 'to'} {m.otherName}
                    </span>
                  </div>
                  <span className="small">{m.body}</span>
                  <div className="row">
                    {m.direction === 'in' && !m.read ? (
                      <button className="btn inline" disabled={busy} onClick={() => act(() => api.mail.read(m.id))}>
                        Mark read
                      </button>
                    ) : null}
                    <button className="btn inline" disabled={busy} onClick={() => act(() => api.mail.remove(m.id))}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
