'use client';
import { useState } from 'react';

export function BackupButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/admin/events/${id}/export/backup`, { method: 'POST' });
      const body = await r.json().catch(() => ({ error: 'No pude armar la copia. Probá de nuevo.' }));
      if (body.url) window.location.href = body.url; else setError(body.error);
    } catch { setError('No pude armar la copia. Revisá la conexión y probá de nuevo.'); }
    setBusy(false);
  }
  return (
    <>
      <button type="button" onClick={run} disabled={busy}>{busy ? 'Preparando la copia…' : 'Descargar copia completa'}</button>
      <span aria-live="polite">{error && <span className="error small">{error}</span>}</span>
    </>
  );
}
