'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) router.replace('/play');
  }, [router]);

  return (
    <div className="container">
      <div className="hero">
        <div className="big">
          <span style={{ color: 'var(--accent)' }}>Unlikely</span>Land
        </div>
        <div className="tag">
          You washed up on a strange island. The locals are bureaucratic, the furniture is hostile, and your shadow may
          have expired. Spend stamina, make questionable choices, and try — eventually — to escape.
        </div>
      </div>

      <div className="card">
        <div className="col">
          <Link href="/register" className="btn btn-primary">
            Start your sentence
          </Link>
          <Link href="/login" className="btn">
            I already live here
          </Link>
        </div>
      </div>

      <p className="center muted small">
        A persistent, text-driven multiplayer comedy RPG. Plays in your browser and installs as an app.
      </p>
    </div>
  );
}
