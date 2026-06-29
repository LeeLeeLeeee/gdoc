import { describe, it, expect } from 'vitest';
import { injectHighlightBridge } from './useDocHtml';

const HTML = '<html><head></head><body><p>hi</p></body></html>';

describe('injectHighlightBridge', () => {
  it('injects the bridge marker before </body>', () => {
    const out = injectHighlightBridge(HTML);
    expect(out).toContain('data-gdoc-highlight-bridge');
    expect(out.indexOf('data-gdoc-highlight-bridge')).toBeLessThan(out.indexOf('</body>'));
  });

  it('is idempotent (does not double-inject)', () => {
    const once = injectHighlightBridge(HTML);
    const twice = injectHighlightBridge(once);
    const count = twice.split('data-gdoc-highlight-bridge').length - 1;
    expect(count).toBe(1);
  });
});
