import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: 'TECHNOVA HUB — Learn. Practice. Prove. Achieve.', template: '%s | TECHNOVA HUB' },
  description: 'Learn technology, practise real skills, complete daily challenges and prove your progress with TECHNOVA HUB.',
  applicationName: 'TECHNOVA HUB',
  keywords: ['technology learning','daily coding challenge','web development','programming','cybersecurity','TECHNOVA HUB'],
  openGraph: { title: 'TECHNOVA HUB', description: 'Learn to think like a problem solver. Learn. Think. Build.', siteName: 'TECHNOVA HUB', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'TECHNOVA HUB', description: 'Learn. Practice. Prove. Achieve.' },
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }], shortcut: '/favicon.svg', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#080B14', colorScheme: 'dark', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
