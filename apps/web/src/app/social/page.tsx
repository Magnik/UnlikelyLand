'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { TopNav } from '@/components/top-nav';

const CARDS = [
  { href: '/chat', label: 'Global Chat', blurb: 'Talk to everyone. The haunted clipboard is listening.' },
  { href: '/friends', label: 'Friends & Blocking', blurb: 'Add allies, field requests, block the goblins.' },
  { href: '/mail', label: 'Mail', blurb: 'Private inbox and outbox.' },
  { href: '/guilds', label: 'Guilds', blurb: 'Band together against the furniture.' },
  { href: '/leaderboards', label: 'Leaderboards', blurb: 'Who is winning at being unlikely.' },
];

export default function SocialHub() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  return (
    <>
      <TopNav />
      <div className="container">
        <h1>Social</h1>
        <div className="col">
          {CARDS.map((c) => (
            <Link key={c.href} href={c.href} className="card" style={{ textDecoration: 'none', display: 'block' }}>
              <div className="row between">
                <b style={{ color: 'var(--text)' }}>{c.label}</b>
                <span className="muted">→</span>
              </div>
              <span className="tiny muted">{c.blurb}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
