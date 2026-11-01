import { useCallback, useEffect, useState, ReactNode } from 'react';

export const fmt = (n: any) => 'Rs ' + Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
export const dt = (d: any) => (d ? new Date(d).toLocaleString('en-GB') : '');
export const dOnly = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
export const today = () => new Date().toISOString().slice(0, 10);

type T = { id: number; msg: string; kind: string };
let listeners: ((t: T) => void)[] = [];
let tid = 0;
export const toast = (msg: string, kind = 'ok') => listeners.forEach((l) => l({ id: ++tid, msg, kind }));

export function Toasts() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    const l = (t: T) => {
      setList((x) => [...x, t]);
      setTimeout(() => setList((x) => x.filter((y) => y.id !== t.id)), 4500);
    };
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}
    </div>
  );
}

export function useLoad<T = any>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    setLoading(true);
    fn().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

export const State = ({ loading, error }: { loading?: boolean; error?: string }) =>
  loading ? <p className="muted">Load ho raha hai…</p> : error ? <p className="err">{error}</p> : null;

export async function run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e: any) { toast(e.message, 'err'); return undefined; }
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h"><h3>{title}</h3><button className="btn ghost" onClick={onClose} aria-label="Band karein">✕</button></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="f"><span>{label}</span>{children}</label>
);

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export const confirmBox = (msg: string) => window.confirm(msg);
