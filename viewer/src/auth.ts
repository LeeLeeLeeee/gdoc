import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';

/** Track the Supabase auth session. The client persists it, so login survives reloads. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready };
}
