/** Sandboxed live preview. `sandbox="allow-scripts"` (no same-origin) — student code can't touch Bodhin's page, cookies or storage. */
import React from 'react';

export function PreviewFrame({ doc, title, height = 320 }: { doc: string; title: string; height?: number }) {
  return React.createElement('iframe', { title, srcDoc: doc, sandbox: 'allow-scripts', style: { width: '100%', height, border: 0, borderRadius: 12, background: '#fff' } });
}
