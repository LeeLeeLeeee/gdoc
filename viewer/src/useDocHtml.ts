import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocSummary } from '../../shared/buildTree';
import { fetchDocHtml } from './supabase';
import { HIGHLIGHT_BRIDGE_SCRIPT } from './highlightBridge';

const THEME_BRIDGE = `
<script data-gdoc-theme-bridge>
(function(){
  var root = document.documentElement;
  var validThemes = { dark:true, light:true, system:true };
  function systemTheme(){
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function normalizeTheme(value){
    value = String(value || '').toLowerCase();
    return validThemes[value] ? value : null;
  }
  function applyTheme(value){
    var normalized = normalizeTheme(value) || 'system';
    var resolved = normalized === 'system' ? systemTheme() : normalized;
    root.dataset.theme = resolved;
    root.dataset.themeSource = normalized;
    root.style.colorScheme = resolved;
  }
  window.addEventListener('message', function(event){
    var data = event.data;
    if (!data || data.type !== 'set-theme') return;
    if (!normalizeTheme(data.theme)) return;
    applyTheme(data.theme);
  });
  if (window.matchMedia){
    var media = window.matchMedia('(prefers-color-scheme: light)');
    var update = function(){ if (root.dataset.themeSource === 'system') applyTheme('system'); };
    if (media.addEventListener) media.addEventListener('change', update);
    else if (media.addListener) media.addListener(update);
  }
})();
</script>`;

export function injectHighlightBridge(html: string) {
  if (html.includes('data-gdoc-highlight-bridge')) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${HIGHLIGHT_BRIDGE_SCRIPT}\n</body>`);
  }
  return `${html}\n${HIGHLIGHT_BRIDGE_SCRIPT}`;
}

export function injectThemeBridge(html: string) {
  if (html.includes('data-gdoc-theme-bridge') || html.includes("type !== 'set-theme'") || html.includes('type !== "set-theme"')) {
    return html;
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${THEME_BRIDGE}\n</body>`);
  }

  return `${html}\n${THEME_BRIDGE}`;
}

export function useDocHtml(selected: DocSummary | null, session: Session | null) {
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    if (!selected) {
      setDocHtml(null);
      setLoadError(false);
      return () => ac.abort();
    }

    setDocHtml(null);
    setLoadError(false);
    fetchDocHtml(selected, session?.access_token, reload, ac.signal)
      .then((html) => {
        if (!cancelled) setDocHtml(injectHighlightBridge(injectThemeBridge(html)));
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        console.error(e);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selected, session?.access_token, reload]);

  return {
    docHtml,
    loadError,
    retry: () => setReload((n) => n + 1),
  };
}
