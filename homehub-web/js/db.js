/**
 * Data persistence for the web build. Uses localStorage rather than
 * SQLite/IndexedDB — this is a real, worth-knowing tradeoff versus the
 * native RN version, not a hidden downgrade:
 *   - Data lives only in this browser, on this device. No sync.
 *   - The OS/browser can clear it under storage pressure, and clearing
 *     "site data" or browsing data in the browser's settings deletes it.
 *   - localStorage has a per-origin size cap (typically 5-10MB depending
 *     on browser) — more than enough for thousands of notes as plain
 *     text, but worth knowing it's not unlimited.
 * This module exposes the same shape of functions as the native
 * src/db/notesRepository.ts so the rest of the app's logic (NLP, screens)
 * didn't need to be re-thought, only re-plumbed.
 */

const STORAGE_KEY = 'homehub_data_v1';

const BUILT_IN_CATEGORIES = [
  { key: 'groceries', label: 'Groceries', icon: '🛒', color: 'var(--cat-groceries)', colorHex: '#4F8F63' },
  { key: 'cleaning', label: 'Cleaning', icon: '🧹', color: 'var(--cat-cleaning)', colorHex: '#3D8FA6' },
  { key: 'maintenance', label: 'Home Maintenance', icon: '🔨', color: 'var(--cat-maintenance)', colorHex: '#B5602C' },
  { key: 'thingsToBuy', label: 'Things to Buy', icon: '💡', color: 'var(--cat-thingstobuy)', colorHex: '#8A5FB0' },
  { key: 'reminders', label: 'Reminders', icon: '📅', color: 'var(--cat-reminders)', colorHex: '#C08A3E' },
  { key: 'garden', label: 'Garden', icon: '🏡', color: 'var(--cat-garden)', colorHex: '#6B9B37' },
  { key: 'bills', label: 'Bills', icon: '💰', color: 'var(--cat-bills)', colorHex: '#3E6E8E' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: '📦', color: 'var(--cat-miscellaneous)', colorHex: '#8C8985' },
];

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    // Malformed JSON (e.g. from a future version's incompatible shape, or
    // storage corruption) should never crash the whole app on load —
    // treat it as "no data yet" rather than throwing, and log it so it's
    // at least discoverable in devtools.
    console.error('HomeHub: stored data was unreadable, starting fresh.', e);
    return null;
  }
}

function saveRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    // Most commonly QuotaExceededError. Surfacing this matters — silently
    // failing to save would mean a person dictates a note, sees it appear
    // in the UI (since UI state updates regardless), and only discovers
    // it never actually persisted the next time they open the app.
    console.error('HomeHub: failed to save data.', e);
    return false;
  }
}

function seedIfEmpty() {
  let data = loadRaw();
  if (data && data.categories && data.categories.length > 0) return data;

  const now = new Date().toISOString();
  data = {
    categories: BUILT_IN_CATEGORIES.map((cat, i) => ({
      id: genId('cat'),
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      color: cat.colorHex,
      isBuiltIn: true,
      sortOrder: i,
      createdAt: now,
    })),
    notes: [],
    checklistItems: [],
  };
  saveRaw(data);
  return data;
}

// In-memory cache of the full store, re-synced to localStorage on every
// mutation. For an app this size (hundreds, not millions, of notes) this
// read-everything/write-everything approach is simpler and fast enough;
// it would need to change if this were ever backing a much larger dataset.
let store = seedIfEmpty();

function persist() {
  saveRaw(store);
}

// ---------- Categories ----------

function listCategories() {
  return [...store.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

function createCategory({ label, icon, color }) {
  const cat = {
    id: genId('cat'),
    key: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    icon,
    color,
    isBuiltIn: false,
    sortOrder: store.categories.length,
    createdAt: new Date().toISOString(),
  };
  store.categories.push(cat);
  persist();
  return cat;
}

function updateCategory(id, patch) {
  const cat = store.categories.find(c => c.id === id);
  if (!cat) return null;
  Object.assign(cat, patch);
  persist();
  return cat;
}

function deleteCategory(id) {
  const cat = store.categories.find(c => c.id === id);
  if (cat && cat.isBuiltIn) {
    throw new Error('Built-in categories cannot be deleted, only customized.');
  }
  // Reassign notes to Miscellaneous rather than cascade-deleting them —
  // same defensive choice as the native version, so deleting a category
  // never silently destroys someone's notes.
  const misc = store.categories.find(c => c.key === 'miscellaneous');
  if (misc) {
    store.notes.forEach(n => {
      if (n.categoryId === id) n.categoryId = misc.id;
    });
  }
  store.categories = store.categories.filter(c => c.id !== id);
  persist();
}

// ---------- Notes ----------

function createNote(input) {
  const now = new Date().toISOString();
  const note = {
    id: genId('note'),
    categoryId: input.categoryId,
    title: input.title || '',
    body: input.body || '',
    isChecklist: !!input.isChecklist,
    createdAt: now,
    updatedAt: now,
    dueDate: input.dueDate || null,
    dueTime: input.dueTime || null,
    repeat: input.repeat || null,
    notify: !!input.notify,
    priority: input.priority || null,
    photoDataUrls: [],
    completed: false,
    completedAt: null,
    archivedAt: null,
  };
  store.notes.push(note);

  if (input.checklistItems && input.checklistItems.length) {
    input.checklistItems.forEach((text, i) => {
      store.checklistItems.push({
        id: genId('item'),
        noteId: note.id,
        text,
        done: false,
        sortOrder: i,
        supermarketSection: input.guessSection ? input.guessSection(text) : null,
      });
    });
  }

  persist();
  return note;
}

function getNoteById(id) {
  return store.notes.find(n => n.id === id) || null;
}

function updateNote(id, patch) {
  const note = store.notes.find(n => n.id === id);
  if (!note) return null;
  Object.assign(note, patch, { updatedAt: new Date().toISOString() });
  persist();
  return note;
}

function deleteNote(id) {
  store.notes = store.notes.filter(n => n.id !== id);
  store.checklistItems = store.checklistItems.filter(i => i.noteId !== id);
  persist();
}

function listNotesByCategory(categoryId, includeCompleted = true) {
  return store.notes
    .filter(n => n.categoryId === categoryId && !n.archivedAt && (includeCompleted || !n.completed))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listAllNotes() {
  return store.notes.filter(n => !n.archivedAt);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function listDueToday() {
  const today = todayIso();
  return store.notes
    .filter(n => n.dueDate === today && !n.completed && !n.archivedAt)
    .sort((a, b) => {
      if (!a.dueTime) return 1;
      if (!b.dueTime) return -1;
      return a.dueTime.localeCompare(b.dueTime);
    });
}

function listOverdue() {
  const today = todayIso();
  return store.notes
    .filter(n => n.dueDate && n.dueDate < today && !n.completed && !n.archivedAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function listBetweenDates(startIso, endIso) {
  return store.notes
    .filter(n => n.dueDate && n.dueDate >= startIso && n.dueDate <= endIso && !n.archivedAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function searchNotes({ text, categoryId, dateIso }) {
  let results = store.notes.filter(n => !n.archivedAt);
  if (categoryId) results = results.filter(n => n.categoryId === categoryId);
  if (dateIso) results = results.filter(n => n.dueDate === dateIso);
  if (text && text.trim()) {
    const q = text.trim().toLowerCase();
    results = results.filter(
      n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
    );
  }
  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---------- Checklist items ----------

function getChecklistItems(noteId) {
  return store.checklistItems
    .filter(i => i.noteId === noteId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function addChecklistItem(noteId, text, supermarketSection = null) {
  const count = store.checklistItems.filter(i => i.noteId === noteId).length;
  const item = {
    id: genId('item'),
    noteId,
    text,
    done: false,
    sortOrder: count,
    supermarketSection,
  };
  store.checklistItems.push(item);
  persist();
  return item;
}

function toggleChecklistItem(itemId, done) {
  const item = store.checklistItems.find(i => i.id === itemId);
  if (item) {
    item.done = done;
    persist();
  }
}

function deleteChecklistItem(itemId) {
  store.checklistItems = store.checklistItems.filter(i => i.id !== itemId);
  persist();
}

const DB = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createNote,
  getNoteById,
  updateNote,
  deleteNote,
  listNotesByCategory,
  listAllNotes,
  listDueToday,
  listOverdue,
  listBetweenDates,
  searchNotes,
  getChecklistItems,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  todayIso,
};
