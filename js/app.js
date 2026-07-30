/**
 * App shell: screen switching, bottom nav, and the voice-capture modal.
 * Individual screen render functions live in js/screens.js — this file
 * owns navigation state and wiring, screens.js owns what each screen
 * looks like.
 */

const AppState = {
  currentScreen: 'home',
  currentCategoryFilter: null, // set when navigating into Notes from a category tap
  editingNoteId: null,
  categoryPickerNoteId: null, // used by the voice-capture modal's category override
};

function navigateTo(screenName, opts = {}) {
  AppState.currentScreen = screenName;
  if (opts.categoryFilter !== undefined) AppState.currentCategoryFilter = opts.categoryFilter;

  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const screenEl = document.getElementById(`screen-${screenName}`);
  const navEl = document.querySelector(`.nav-item[data-screen="${screenName}"]`);
  if (screenEl) screenEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  renderScreen(screenName);
}

function openVoiceCapture(categoryId) {
  AppState.categoryPickerNoteId = null;
  document.getElementById('voice-modal').classList.add('active');
  initVoiceCaptureModal(categoryId || null);
}

function closeVoiceCapture() {
  document.getElementById('voice-modal').classList.remove('active');
  voiceService.stop();
}

function populateNavIcons() {
  document.querySelectorAll('.nav-icon').forEach(span => {
    const iconName = span.dataset.icon;
    if (ICONS[iconName]) span.innerHTML = ICONS[iconName];
  });
  const modalMicBtn = document.getElementById('voice-modal-mic-btn');
  if (modalMicBtn) modalMicBtn.innerHTML = ICONS.mic;
}

function initApp() {
  populateNavIcons();

  // Bottom nav wiring
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.screen));
  });

  // Voice modal close/cancel
  document.getElementById('voice-modal-cancel').addEventListener('click', closeVoiceCapture);
  document.getElementById('voice-modal-overlay-bg').addEventListener('click', (e) => {
    if (e.target.id === 'voice-modal-overlay-bg') closeVoiceCapture();
  });

  // Theme toggle wiring lives in theme.js, called here so it runs on load
  initTheme();

  // Service worker registration for offline support / installability.
  // Wrapped defensively — some browsers (or contexts like a plain file://
  // preview without a real server) don't support service workers, and that
  // should degrade to "no offline support" rather than break the app.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Service worker registration failed (app still works, just without offline support):', err);
      });
    });
  }

  navigateTo('home');
}

document.addEventListener('DOMContentLoaded', initApp);
