import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';

/** Email+password login bar. Signed in → owner (sees private docs via RLS). */
export function AuthBar({ session }: { session: Session | null }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <div className="authbar">
        <span className="small muted">{session.user.email}</span>
        <button onClick={() => sb.auth.signOut()}>로그아웃</button>
      </div>
    );
  }

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <form className="authbar login" onSubmit={signIn}>
      <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} required />
      <button disabled={busy}>{busy ? '…' : '로그인'}</button>
      {err && <span className="error small">{err}</span>}
    </form>
  );
}
