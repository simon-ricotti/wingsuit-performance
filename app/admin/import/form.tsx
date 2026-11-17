'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { requestUpload, runImport, type ImportResult } from './actions';

export function ImportForm() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) return;
    setResult(null);
    setBusy('Subiendo la copia…');
    const ticket = await requestUpload(file.name, file.size);
    if ('error' in ticket) { setBusy(null); setResult({ ok: false, error: ticket.error }); return; }
    const up = await createClient().storage.from('imports').uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: 'application/json' });
    if (up.error) { setBusy(null); setResult({ ok: false, error: 'No pude subir el archivo. Revisá la conexión y probá de nuevo.' }); return; }
    setBusy('Importando saltos, tracks y archivos originales…');
    setResult(await runImport(ticket.path, file.name));
    setBusy(null);
  }

  return (
    <div className="stack">
      <form onSubmit={onSubmit} className="stack">
        <label className="stack">
          Copia completa (.json)
          <input name="file" type="file" accept=".json,application/json" required disabled={!!busy} />
        </label>
        <button type="submit" disabled={!!busy}>{busy ?? 'Importar'}</button>
      </form>
      {result && !result.ok && <p className="error">{result.error}</p>}
      {result?.ok && (
        <div className="stack">
          <p>Listo: se importó <b>{result.eventName}</b> con {result.jumps} saltos y {result.originals} archivos originales.
            Pilotos nuevos: {result.newPilots}; ya existentes (se dejaron como estaban): {result.existingPilots}.
            La jornada quedó <b>sin publicar</b>.</p>
          {result.warnings.length > 0 && (
            <>
              <p>Avisos:</p>
              <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
