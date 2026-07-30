/**
 * Light/dark/system theme switching. "System" (the default) relies on the
 * @media (prefers-color-scheme) rules in css/tokens.css and applies no
 * override attribute. Explicit Light/Dark choices set data-theme on the
 * root element, which the CSS in tokens.css targets with higher
 * specificity than the media query.
 */

const THEME_STORAGE_KEY = 'homehub_theme_pref';

function getThemePreference() {
  return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
}

function setThemePreference(pref) {
  localStorage.setItem(THEME_STORAGE_KEY, pref);
  applyTheme(pref);
}

function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
  // Keep the browser chrome color (address bar tint on mobile) in sync
  // with the resolved theme, matching the native app's StatusBar handling.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', isDark ? '#17181A' : '#FAFAF8');
  }
}

function initTheme() {
  applyTheme(getThemePreference());
}
