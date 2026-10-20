import { useEffect, useState, type FormEvent } from 'react';
import { useDraft } from '../lib/drafts';
import { listTechnicians, saveTechnician, type Technician } from '../lib/maintenance';

const EMPTY = { name: '', phone: '', trade: '', active: true };

/** Technicians tickets can be assigned to. They don't log in. */
export default function Technicians() {
  const [list, setList] = useState<Technician[] | null>(null);
  const [editing, setEditing, editingDraft] = useDraft<(typeof EMPTY & { id?: number }) | null>('technician-form', null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listTechnicians().then(setList).catch(() => setError('Could not load technicians.'));
  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      await saveTechnician(editing);
      editingDraft.discard();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="page-head">
        <a href="#/maintenance" className="back">← Maintenance</a>
        <button className="btn primary small" onClick={() => setEditing({ ...EMPTY })}>+ Add technician</button>
      </div>
      <h2>Technicians</h2>

      {editing && (
        <form className="card form" onSubmit={submit} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <label>
              Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required autoFocus />
            </label>
            <label>
              Trade
              <input value={editing.trade} placeholder="Electrical, Plumbing, HVAC…" onChange={(e) => setEditing({ ...editing, trade: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active (can be assigned)
            </label>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>{editing.id ? 'Save' : 'Add'}</button>
            <button type="button" className="btn ghost" onClick={editingDraft.discard}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {list?.length === 0 && <p className="muted empty">No technicians yet.</p>}
      <ul className="ticket-list">
        {list?.map((t) => (
          <li key={t.id}>
            <button
              className={`card ticket-row tech-row ${t.active ? '' : 'inactive'}`}
              onClick={() => setEditing({ id: t.id, name: t.name, phone: t.phone ?? '', trade: t.trade ?? '', active: t.active })}
            >
              <strong>{t.name}</strong>
              <span className="muted small">{[t.trade, t.phone, !t.active && 'Inactive'].filter(Boolean).join(' · ') || '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
