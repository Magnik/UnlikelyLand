'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatMessageView } from '@unlikelyland/contracts';
import { api, ApiError, getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api.chat.list();
      setMessages(m);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [router, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.chat.send(trimmed);
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Global chat</h1>
        <div className="card" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <div className="empty">Quiet in here. Say something — the haunted clipboard is listening.</div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {messages.map((m) => (
                <div key={m.id}>
                  <span
                    className="tiny"
                    style={{ fontWeight: 700, color: m.mine ? 'var(--accent)' : 'var(--muted)' }}
                  >
                    {m.displayName}
                  </span>{' '}
                  <span className="small">{m.body}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
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
