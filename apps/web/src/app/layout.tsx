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
  // No maximumScale/userScalable lock: disabling zoom fails WCAG 1.4.4 and hurts
  // low-vision users. The layout is responsive, so pinch-zoom is purely additive.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
