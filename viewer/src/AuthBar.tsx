import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import { Logout } from './icons';

/** Logged-out: a glass card with a 로그인 button (opens the modal).
 *  Logged-in: avatar + email + owner badge + 로그아웃. */
export function AuthBar({ session, onLogin }: { session: Session | null; onLogin: () => void }) {
  if (!session) {
    return (
      <div className="auth-logged-out">
        <div className="hint">공개 문서만 보는 중</div>
        <button className="btn btn-primary btn-pill-sm" onClick={onLogin}>로그인</button>
      </div>
    );
  }
  const email = session.user.email ?? '소유자';
  return (
    <div className="auth-bar">
      <div className="avatar">{email.slice(0, 1).toUpperCase()}</div>
      <div className="who">
        <div className="email">{email}</div>
        <div className="role">소유자 · 로그인됨</div>
      </div>
      <button className="btn btn-ghost btn-pill-sm" onClick={() => sb.auth.signOut()}>
        <Logout /> 로그아웃
      </button>
    </div>
  );
}
