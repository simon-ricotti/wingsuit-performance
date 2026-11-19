import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { League_Spartan, Lato } from 'next/font/google';
import './globals.css';

const spartan = League_Spartan({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-spartan' });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato' });

export const metadata: Metadata = {
  title: 'Wingsuit Performance',
  description: 'Puntaje FAI de Wingsuit Performance: tiempo, distancia y velocidad.',
};

export const viewport: Viewport = { themeColor: '#701968' };

// Static bar (no session read) so public pages stay on the CDN; /admin sends to login or to the pilot page.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={`${spartan.variable} ${lato.variable}`}>
      <body>
        <header className="appbar noprint">
          <div className="in">
            <Link href="/" className="brandmark" aria-label="Wingsuit Performance, inicio">
              <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 3 29 26 16 20 3 26Z" fill="#fff" />
                <path d="M16 20v9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span translate="no">Wingsuit Performance</span>
            </Link>
            <nav aria-label="Principal">
              <Link href="/results">Resultados</Link>
              <Link href="/ranking">Ranking</Link>
              <Link href="/tracks">Tracks</Link>
              <Link href="/help">Ayuda</Link>
              <Link href="/admin">Mi panel</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
