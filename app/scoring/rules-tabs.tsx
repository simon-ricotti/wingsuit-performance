// Tabs of the "Reglamento" section: scoring for pilots and public, rules for judges.
import Link from 'next/link';

export function RulesTabs({ current }: { current: 'scoring' | 'judging' }) {
  return (
    <nav className="seg" aria-label="Reglamento">
      <Link href="/scoring" aria-current={current === 'scoring' ? 'page' : undefined}>Cómo se puntúa</Link>
      <Link href="/judging" aria-current={current === 'judging' ? 'page' : undefined}>Para jueces</Link>
    </nav>
  );
}
