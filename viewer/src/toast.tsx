import { useEffect, useState } from 'react';

// Minimal dependency-free toast: a module-level pub/sub + a <Toaster/> rendered once.
type ToastItem = { id: number; msg: string; kind: 'success' | 'error' };
let nextId = 0;
const subscribers = new Set<(t: ToastItem) => void>();

export function toast(msg: string, kind: 'success' | 'error' = 'success') {
  const item: ToastItem = { id: ++nextId, msg, kind };
  subscribers.forEach((fn) => fn(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems((cur) => [...cur, t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 2200);
    };
    subscribers.add(onToast);
    return () => { subscribers.delete(onToast); };
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}
