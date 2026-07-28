/**
 * Inline SVG icon strings, ported directly from the RN version's
 * src/components/TabIcon.tsx and MicButton.tsx path data, so the visual
 * language matches exactly rather than approximating it with a different
 * icon set.
 */
const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 11L12 4L21 11V20a1 1 0 01-1 1H4a1 1 0 01-1-1V11z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 21V13h6v8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,

  notes: `<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,

  groceries: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h2l2 12h11l2-8H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="21" r="1.4" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="21" r="1.4" stroke="currentColor" stroke-width="1.6"/></svg>`,

  calendar: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,

  settings: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 13a7.97 7.97 0 000-2l2-1.5-2-3.4-2.3.9a8 8 0 00-1.7-1L15 3h-6l-.4 2.6a8 8 0 00-1.7 1l-2.3-.9-2 3.4L4.6 11a7.97 7.97 0 000 2l-2 1.5 2 3.4 2.3-.9a8 8 0 001.7 1L9 21h6l.4-2.6a8 8 0 001.7-1l2.3.9 2-3.4-2-1.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,

  mic: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

function iconHtml(name, colorVar) {
  const svg = ICONS[name] || '';
  return svg;
}
