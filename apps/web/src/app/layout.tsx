import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnlikelyLand',
  description: 'A persistent weird-comedy multiplayer text adventure. You are trapped. Good luck.',
  manifest: '/manifest.webmanifest',
  applicationName: 'UnlikelyLand',
  appleWebApp: { capable: true, title: 'UnlikelyLand', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0e1014',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
