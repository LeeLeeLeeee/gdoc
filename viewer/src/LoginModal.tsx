import { useState, type FormEvent } from 'react';
import { sb } from './supabase';
import { Logo, X, Mail, Lock } from './icons';

/** Email+password login modal (matches the design's overlay). */
export function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr(error.message);
    else onClose(); // session change refetches docs
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" aria-label="닫기" onClick={onClose}>
          <X size={16} />
        </button>
        <h2>
          <Logo size={22} /> 로그인
        </h2>
        <div className="desc">로그인하면 비공개 문서까지 모두 볼 수 있어요.</div>
        <form className="form" onSubmit={signIn}>
          <div className="field">
            <span className="ico"><Mail /></span>
            <input className="gd-input" style={{ height: 40 }} type="email" placeholder="이메일"
              value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <span className="ico"><Lock /></span>
            <input className="gd-input" style={{ height: 40 }} type="password" placeholder="비밀번호"
              value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
          {err && <span className="error-text">{err}</span>}
          <button className="btn btn-primary btn-full" disabled={busy}>{busy ? '…' : '로그인'}</button>
        </form>
      </div>
    </div>
  );
}
