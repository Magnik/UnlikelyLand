'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearToken, getToken } from '@/lib/api';

const LINKS = [
  { href: '/play', label: 'Play' },
  { href: '/inventory', label: 'Bag' },
  { href: '/social', label: 'Social' },
  { href: '/market', label: 'Market' },
  { href: '/profile', label: 'You' },
  { href: '/settings', label: 'Settings' },
];

export function TopNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  // Unread mail + incoming friend requests, surfaced as a badge on "Social".
  const [notifs, setNotifs] = useState(0);
  // Whether the signed-in user can see moderation tooling.
  const [showMod, setShowMod] = useState(false);
  // Re-entrancy guard so a slow poll can't overlap the next tick.
  const busy = useRef(false);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  useEffect(() => {
    // Not logged in: nothing to fetch, no badge.
    if (!getToken()) return;

    let alive = true;

    async function role() {
      try {
        const me = await api.me();
        if (alive) setShowMod(me.role === 'moderator' || me.role === 'admin');
      } catch {
        // Swallow: an unauthenticated/expired session simply shows no Mod link.
      }
    }

    async function poll() {
      if (busy.current) return;
      busy.current = true;
      try {
        const [box, social] = await Promise.all([api.mail.box(), api.social.overview()]);
        if (alive) setNotifs(box.unread + social.incoming.length);
      } catch {
        // Swallow: keep last known count rather than crashing the nav.
      } finally {
        busy.current = false;
      }
    }

    role();
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const links = [...LINKS];
  if (showMod) links.push({ href: '/moderation', label: 'Mod' });
  if (showAdmin) links.push({ href: '/admin', label: 'Admin' });

  return (
    <nav className="nav">
      <Link href="/play" className="brand">
        <span className="un">Unlikely</span>Land
      </Link>
      <div className="links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
            {l.label}
            {l.href === '/social' && notifs > 0 ? (
              <span className="badge" style={{ marginLeft: 4, verticalAlign: 'super', fontSize: '0.7em' }}>
                {notifs > 99 ? '99+' : notifs}
              </span>
            ) : null}
          </Link>
        ))}
        <button type="button" onClick={logout} className="navlink-button" aria-label="Log out">
          Out
        </button>
      </div>
    </nav>
  );
}
