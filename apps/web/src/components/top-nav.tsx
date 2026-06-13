'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';

const LINKS = [
  { href: '/play', label: 'Play' },
  { href: '/social', label: 'Social' },
  { href: '/market', label: 'Market' },
  { href: '/profile', label: 'You' },
  { href: '/settings', label: 'Settings' },
];

export function TopNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const links = showAdmin ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS;

  return (
    <nav className="nav">
      <Link href="/play" className="brand">
        <span className="un">Unlikely</span>Land
      </Link>
      <div className="links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
        <a onClick={logout} style={{ cursor: 'pointer' }}>
          Out
        </a>
      </div>
    </nav>
  );
}
