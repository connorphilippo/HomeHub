/**
 * Render functions for each screen. Called by navigateTo() in app.js
 * whenever a screen becomes active, and also re-called after any mutation
 * (creating a note, toggling a checkbox, etc.) so the UI reflects the
 * current data state — this app re-renders the whole active screen on
 * change rather than doing granular DOM patching, which is simpler and
 * fast enough at the data volumes a household app actually has.
 */

function renderScreen(screenName) {
  switch (screenName) {
    case 'home': return renderHomeScreen();
    case 'notes': return renderNotesScreen();
    case 'groceries': return renderGroceriesScreen();
    case 'calendar': return renderCalendarScreen();
    case 'settings': return renderSettingsScreen();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function categoryById(id) {
  return DB.listCategories().find(c => c.id === id);
}

// ---------- Home ----------

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function renderHomeScreen() {
  const el = document.getElementById('screen-home');
  const dueToday = DB.listDueToday();
  const overdue = DB.listOverdue();
  const categories = DB.listCategories();

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  let overdueHtml = '';
  if (overdue.length > 0) {
    overdueHtml = `
      <div class="mt-lg">
        <div class="section-label" style="color: var(--danger)">Overdue (${overdue.length})</div>
        ${overdue.slice(0, 3).map(note => {
          const cat = categoryById(note.categoryId);
          return renderNoteCard(note, cat, `Was due ${note.dueDate}`);
        }).join('')}
      </div>`;
  }

  const todayHtml = dueToday.length === 0
    ? `<div class="card card-empty">Nothing due today. Tap the microphone below to add something.</div>`
    : dueToday.map(note => {
        const cat = categoryById(note.categoryId);
        const priorityDot = note.priority
          ? `<div style="width:10px;height:10px;border-radius:5px;margin-left:8px;background:${
              note.priority === 'high' ? 'var(--danger)' : note.priority === 'medium' ? 'var(--warning)' : 'var(--success)'
            }"></div>`
          : '';
        return renderNoteCard(note, cat, note.dueTime || '', priorityDot);
      }).join('');

  const quickAccessHtml = categories.slice(0, 4).map(cat => `
    <div class="card pressable" style="width:47%; background:${cat.color}14" onclick="navigateTo('notes', {categoryFilter: '${cat.id}'})">
      <div style="font-size:28px">${cat.icon}</div>
      <div style="font-weight:600; font-size:14px; margin-top:4px">${escapeHtml(cat.label)}</div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="screen-header">
      <div>
        <h1 class="screen-title">${greetingForNow()}</h1>
        <div class="text-dim" style="font-size:14px">${todayStr}</div>
      </div>
    </div>
    ${overdueHtml}
    <div class="mt-lg">
      <div class="section-label">Today ${dueToday.length > 0 ? `(${dueToday.length})` : ''}</div>
      ${todayHtml}
    </div>
    <div class="mt-lg">
      <div class="section-label">Quick access</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px">${quickAccessHtml}</div>
    </div>
  `;

  // Floating mic button — rendered once per screen visit, not duplicated
  // if it already exists in the DOM from a previous render pass.
  if (!document.querySelector('.fab-mic')) {
    const fab = document.createElement('div');
    fab.className = 'fab-mic';
    fab.innerHTML = renderMicButtonHtml('fab-mic-btn', 'small');
    document.getElementById('app').appendChild(fab);
    document.getElementById('fab-mic-btn').addEventListener('click', () => openVoiceCapture());
  }
}

function renderNoteCard(note, cat, metaText, extraHtml = '') {
  const icon = cat ? cat.icon : '📌';
  const color = cat ? cat.color : 'var(--border)';
  return `
    <div class="card pressable accent-left" style="border-left-color:${color}" onclick="openNoteDetail('${note.id}')">
      <div class="flex-row" style="justify-content:space-between">
        <div class="flex-1">
          <div style="font-weight:600; font-size:16px">${icon} ${escapeHtml(note.title || 'Untitled')}</div>
          ${metaText ? `<div class="text-faint" style="font-size:12px; margin-top:2px">${escapeHtml(metaText)}</div>` : ''}
        </div>
        ${extraHtml}
      </div>
    </div>
  `;
}

function renderMicButtonHtml(id, size) {
  const sizeClass = size === 'small' ? 'mic-button-small' : '';
  return `
    <div class="mic-button-wrapper" id="${id}-wrapper">
      <div class="mic-ring mic-ring-1"></div>
      <div class="mic-ring mic-ring-2"></div>
      <button class="mic-button ${sizeClass}" id="${id}" aria-label="Record voice note">
        ${ICONS.mic}
      </button>
    </div>
  `;
}

// ---------- Notes ----------

function renderNotesScreen() {
  const el = document.getElementById('screen-notes');
  const categories = DB.listCategories();
  const existingInput = document.getElementById('notes-search-input');
  const searchText = existingInput ? existingInput.value : '';
  const filterId = AppState.currentCategoryFilter;

  el.innerHTML = `
    <div class="screen-header">
      <h1 class="screen-title">Notes</h1>
      <button onclick="openVoiceCapture(${filterId ? `'${filterId}'` : 'null'})" style="font-size:28px; color:var(--accent)">＋</button>
    </div>
    <input type="text" class="text-input" id="notes-search-input" placeholder="Search notes…" value="${escapeHtml(searchText)}" style="margin-bottom:8px" />
    <div class="pill-row mt-sm" id="notes-pill-row"></div>
    <div class="mt-md" id="notes-results"></div>
  `;

  renderNotesPills(categories, filterId);
  renderNotesResults(searchText, filterId);

  // Wire input listener AFTER the innerHTML above has run, and only ONCE
  // per full-screen render — it updates just the results div on each
  // keystroke rather than re-rendering this whole function, which is what
  // previously destroyed and recreated the input itself on every
  // keystroke and broke typing (cursor jumping to the end, or losing
  // focus entirely depending on browser).
  const input = document.getElementById('notes-search-input');
  input.addEventListener('input', () => {
    renderNotesResults(input.value, AppState.currentCategoryFilter);
  });
  input.focus();
  input.setSelectionRange(searchText.length, searchText.length);
}

function renderNotesPills(categories, filterId) {
  const pillRow = document.getElementById('notes-pill-row');
  pillRow.innerHTML = categories.map(cat => `
    <button class="pill ${filterId === cat.id ? 'selected' : ''}"
            style="${filterId === cat.id ? `background:${cat.color}` : ''}"
            onclick="toggleNotesFilter('${cat.id}')">
      ${cat.icon} ${escapeHtml(cat.label)}
    </button>
  `).join('');
}

function renderNotesResults(searchText, filterId) {
  const resultsEl = document.getElementById('notes-results');
  if (!resultsEl) return; // guards against a stray call after navigating away mid-typing
  const notes = DB.searchNotes({ text: searchText, categoryId: filterId || undefined });

  resultsEl.innerHTML = notes.length === 0
    ? `<div class="card card-empty">${
        searchText || filterId ? 'No notes match your search.' : 'No notes yet. Tap the microphone on Home to add your first one.'
      }</div>`
    : notes.map(note => {
        const cat = categoryById(note.categoryId);
        let meta = '';
        if (note.dueDate) meta += note.dueDate + (note.dueTime ? ` · ${note.dueTime}` : '');
        if (note.completed) meta += (meta ? ' · ' : '') + '✓ Done';
        return `
          <div class="card pressable accent-left" style="border-left-color:${cat ? cat.color : 'var(--border)'}" onclick="openNoteDetail('${note.id}')">
            <div style="font-weight:600">${cat ? cat.icon : '📌'} ${escapeHtml(note.title || 'Untitled note')}</div>
            ${note.body ? `<div class="text-dim" style="font-size:14px; margin-top:2px">${escapeHtml(note.body.slice(0, 120))}</div>` : ''}
            ${meta ? `<div class="text-faint" style="font-size:12px; margin-top:4px">${escapeHtml(meta)}</div>` : ''}
          </div>
        `;
      }).join('');
}

function toggleNotesFilter(categoryId) {
  AppState.currentCategoryFilter = AppState.currentCategoryFilter === categoryId ? null : categoryId;
  const filterId = AppState.currentCategoryFilter;
  renderNotesPills(DB.listCategories(), filterId);
  const input = document.getElementById('notes-search-input');
  renderNotesResults(input ? input.value : '', filterId);
}

// ---------- Groceries ----------

const SECTION_ORDER = ['produce', 'dairy', 'meat', 'frozen', 'drinks', 'household', 'snacks', 'other'];
const SECTION_LABELS = {
  produce: 'Fruit & Vegetables', dairy: 'Dairy', meat: 'Meat', frozen: 'Frozen',
  drinks: 'Drinks', household: 'Household', snacks: 'Snacks', other: 'Other',
};

let groceriesSortBySection = true;
let groceriesActiveNoteId = null;

function getGroceriesCategory() {
  return DB.listCategories().find(c => c.key === 'groceries');
}

function getGroceryItems() {
  const cat = getGroceriesCategory();
  if (!cat) return { items: [], noteId: null };
  const notes = DB.listNotesByCategory(cat.id, true).filter(n => n.isChecklist && !n.completed);
  if (notes.length === 0) return { items: [], noteId: null };

  const primary = notes[0];
  groceriesActiveNoteId = primary.id;
  let items = [];
  notes.forEach(n => {
    items = items.concat(DB.getChecklistItems(n.id));
  });
  return { items, noteId: primary.id };
}

function renderGroceriesScreen() {
  const el = document.getElementById('screen-groceries');
  const cat = getGroceriesCategory();
  const { items } = getGroceryItems();
  const doneCount = items.filter(i => i.done).length;

  el.innerHTML = `
    <div class="screen-header">
      <div>
        <h1 class="screen-title">Groceries</h1>
        ${items.length > 0 ? `<div class="text-dim" style="font-size:14px">${doneCount} of ${items.length} done</div>` : ''}
      </div>
      <button onclick="toggleGrocerySortMode()" style="color:var(--accent); font-weight:600; font-size:14px">
        ${groceriesSortBySection ? 'View as list' : 'Sort by aisle'}
      </button>
    </div>
    <div class="flex-row" style="gap:8px; margin-bottom:8px">
      <input type="text" class="text-input" id="grocery-add-input" placeholder="Add an item…" style="flex:1" />
      <button onclick="openVoiceCapture('${cat ? cat.id : ''}')" style="width:44px; height:44px; border-radius:14px; background:${cat ? cat.color : 'var(--accent)'}; display:flex; align-items:center; justify-content:center; font-size:18px">🎙️</button>
    </div>
    <div id="grocery-suggestions"></div>
    <div id="grocery-list-content"></div>
  `;

  const addInput = document.getElementById('grocery-add-input');
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGroceryAdd();
  });

  renderGrocerySuggestions(items);
  renderGroceryListContent(items, cat);
}

function renderGrocerySuggestions(items) {
  const container = document.getElementById('grocery-suggestions');
  const suggestions = NLP.suggestMissingItems(items.filter(i => !i.done).map(i => i.text));
  if (suggestions.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="banner" style="background:var(--accent-tint)">
      <div style="color:var(--accent-deep); font-weight:600; font-size:12px">You might also need:</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px">
        ${suggestions.map(s => `
          <button onclick="addSuggestedGroceryItem('${escapeHtml(s).replace(/'/g, "\\'")}')"
                  style="border:1px solid var(--accent); border-radius:999px; padding:4px 10px; color:var(--accent-deep); font-size:12px">
            + ${escapeHtml(s)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderGroceryListContent(items, cat) {
  const container = document.getElementById('grocery-list-content');
  if (items.length === 0) {
    container.innerHTML = `<div class="card card-empty">No items yet. Add one above, or say "Add milk and eggs to groceries."</div>`;
    return;
  }

  const catColor = cat ? cat.color : 'var(--accent)';

  if (groceriesSortBySection) {
    const sections = SECTION_ORDER
      .map(section => ({ title: SECTION_LABELS[section], items: items.filter(i => (i.supermarketSection || 'other') === section) }))
      .filter(s => s.items.length > 0);

    container.innerHTML = sections.map(section => `
      <div class="section-label mt-md">${section.title}</div>
      ${section.items.map(item => renderGroceryRow(item, catColor)).join('')}
    `).join('');
  } else {
    container.innerHTML = items.map(item => renderGroceryRow(item, catColor)).join('');
  }
}

function renderGroceryRow(item, catColor) {
  return `
    <div class="checklist-row" onclick="toggleGroceryItem('${item.id}')">
      <div class="checkbox ${item.done ? 'checked' : ''}" style="border-color:${catColor}; ${item.done ? `background:${catColor}` : ''}">
        ${item.done ? '✓' : ''}
      </div>
      <div class="checklist-text ${item.done ? 'done' : ''}">${escapeHtml(item.text)}</div>
    </div>
  `;
}

function handleGroceryAdd() {
  const input = document.getElementById('grocery-add-input');
  const text = input.value.trim();
  if (!text) return;

  let cat = getGroceriesCategory();
  let noteId = groceriesActiveNoteId;
  if (!noteId) {
    const note = DB.createNote({ categoryId: cat.id, title: 'Grocery list', isChecklist: true });
    noteId = note.id;
    groceriesActiveNoteId = noteId;
  }

  const section = NLP.guessSection(text);
  DB.addChecklistItem(noteId, text, section);
  input.value = '';

  const { items } = getGroceryItems();
  renderGrocerySuggestions(items);
  renderGroceryListContent(items, cat);
  updateNavBadgesIfAny();
}

function addSuggestedGroceryItem(text) {
  if (!groceriesActiveNoteId) return;
  const section = NLP.guessSection(text);
  DB.addChecklistItem(groceriesActiveNoteId, text, section);
  const { items } = getGroceryItems();
  const cat = getGroceriesCategory();
  renderGrocerySuggestions(items);
  renderGroceryListContent(items, cat);
}

function toggleGroceryItem(itemId) {
  const { items } = getGroceryItems();
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  DB.toggleChecklistItem(itemId, !item.done);
  renderGroceriesScreen();
}

function toggleGrocerySortMode() {
  groceriesSortBySection = !groceriesSortBySection;
  renderGroceriesScreen();
}

function updateNavBadgesIfAny() {
  // Placeholder hook for future nav-badge counts (e.g. "3" on the
  // Groceries tab). Not part of the current spec scope — kept as a named
  // no-op rather than scattering TODOs, so call sites that will want this
  // later already exist.
}

// ---------- Calendar ----------

let calendarViewMonth = new Date().getMonth();
let calendarViewYear = new Date().getFullYear();
let calendarSelectedDate = DB.todayIso();

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderCalendarScreen() {
  const el = document.getElementById('screen-calendar');

  const firstOfMonth = new Date(calendarViewYear, calendarViewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarViewYear, calendarViewMonth, 0).getDate();

  // Build a 6-row grid (42 cells) starting from the Sunday on/before the
  // 1st, so partial weeks at the start/end of the month still show
  // context from adjacent months rather than empty gaps.
  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, otherMonth: true, y: calendarViewYear, m: calendarViewMonth - 1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, otherMonth: false, y: calendarViewYear, m: calendarViewMonth });
  }
  while (cells.length < 42) {
    const next = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day: next, otherMonth: true, y: calendarViewYear, m: calendarViewMonth + 1 });
  }

  const rangeStart = isoDate(cells[0].y, ((cells[0].m % 12) + 12) % 12, cells[0].day);
  const lastCell = cells[cells.length - 1];
  const rangeEnd = isoDate(lastCell.y, ((lastCell.m % 12) + 12) % 12, lastCell.day);
  const notesInRange = DB.listBetweenDates(rangeStart, rangeEnd);
  const categories = DB.listCategories();

  const todayIso = DB.todayIso();
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dayCellsHtml = cells.map(cell => {
    const normalizedMonth = ((cell.m % 12) + 12) % 12;
    const yearAdjust = cell.m < 0 ? cell.y - 1 : cell.m > 11 ? cell.y + 1 : cell.y;
    const cellIso = isoDate(yearAdjust, normalizedMonth, cell.day);
    const dayNotes = notesInRange.filter(n => n.dueDate === cellIso);
    const isToday = cellIso === todayIso;
    const isSelected = cellIso === calendarSelectedDate;

    const dots = dayNotes.slice(0, 3).map(n => {
      const cat = categories.find(c => c.id === n.categoryId);
      return `<div class="calendar-dot" style="background:${cat ? cat.color : 'var(--accent)'}"></div>`;
    }).join('');

    return `
      <div onclick="selectCalendarDate('${cellIso}')">
        <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${cell.otherMonth ? 'other-month' : ''}">
          ${cell.day}
        </div>
        <div class="calendar-dots" style="justify-content:center">${dots}</div>
      </div>
    `;
  }).join('');

  const selectedDayNotes = notesInRange.filter(n => n.dueDate === calendarSelectedDate);
  const selectedDateLabel = new Date(calendarSelectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const agendaHtml = selectedDayNotes.length === 0
    ? `<div class="text-faint mt-sm">Nothing scheduled.</div>`
    : selectedDayNotes.map(note => {
        const cat = categories.find(c => c.id === note.categoryId);
        return `
          <div class="card pressable accent-left" style="border-left-color:${cat ? cat.color : 'var(--border)'}" onclick="openNoteDetail('${note.id}')">
            <div style="font-weight:600">${cat ? cat.icon : '📌'} ${escapeHtml(note.title)}</div>
            ${note.dueTime ? `<div class="text-faint" style="font-size:12px; margin-top:2px">${note.dueTime}</div>` : ''}
          </div>
        `;
      }).join('');

  el.innerHTML = `
    <div class="calendar-header">
      <button onclick="changeCalendarMonth(-1)" style="font-size:20px; color:var(--accent)">‹</button>
      <div style="font-weight:700; font-size:18px">${monthLabel}</div>
      <button onclick="changeCalendarMonth(1)" style="font-size:20px; color:var(--accent)">›</button>
    </div>
    <div class="calendar-grid" style="margin-bottom:4px">
      ${['S','M','T','W','T','F','S'].map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
    </div>
    <div class="calendar-grid">${dayCellsHtml}</div>
    <div class="mt-lg">
      <div style="font-weight:700; font-size:16px">${selectedDateLabel}</div>
      ${agendaHtml}
    </div>
  `;
}

function changeCalendarMonth(delta) {
  calendarViewMonth += delta;
  if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
  if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
  renderCalendarScreen();
}

function selectCalendarDate(iso) {
  calendarSelectedDate = iso;
  renderCalendarScreen();
}

// ---------- Settings ----------

function renderSettingsScreen() {
  const el = document.getElementById('screen-settings');
  const categories = DB.listCategories();
  const currentThemePref = getThemePreference();

  const categoryRowsHtml = categories.map(cat => `
    <div class="flex-row" style="padding:12px; border-bottom:1px solid var(--border); cursor:pointer" onclick="openCategoryEditor('${cat.id}')">
      <div style="font-size:18px">${cat.icon}</div>
      <div class="flex-1" style="margin-left:8px">${escapeHtml(cat.label)}</div>
      <div style="width:16px; height:16px; border-radius:8px; background:${cat.color}"></div>
      <div class="text-faint" style="margin-left:8px">›</div>
    </div>
  `).join('');

  el.innerHTML = `
    <h1 class="screen-title mt-sm" style="margin-bottom:16px">Settings</h1>

    <div class="section-label mt-lg">Appearance</div>
    <div class="card" style="padding:0; overflow:hidden">
      <div class="flex-row" style="gap:8px; padding:12px">
        ${['light', 'dark', 'system'].map(opt => `
          <button onclick="handleThemeChange('${opt}')"
                  style="flex:1; padding:8px; border-radius:8px; text-align:center; font-weight:600; text-transform:capitalize;
                         background:${currentThemePref === opt ? 'var(--accent)' : 'var(--bg-sunken)'};
                         color:${currentThemePref === opt ? 'var(--on-accent)' : 'var(--text-dim)'}">
            ${opt}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section-label mt-lg">Categories</div>
    <div class="card" style="padding:0; overflow:hidden">
      ${categoryRowsHtml}
      <div style="padding:12px; cursor:pointer; color:var(--accent); font-weight:600" onclick="openCategoryEditor(null)">
        + Add custom category
      </div>
    </div>

    <div class="section-label mt-lg">Backup &amp; sync</div>
    <div class="card">
      <div class="text-dim" style="font-size:14px; line-height:20px">
        This web version stores data in your browser only (localStorage) —
        it does not sync to Google Drive, iCloud, or between devices.
        Clearing your browser's site data for this page will delete it.
        Exporting/importing a backup file is not yet built in this pass.
      </div>
    </div>

    <div class="section-label mt-lg">About this build</div>
    <div class="card">
      <div class="text-dim" style="font-size:13px; line-height:19px">
        This is a browser-based version of HomeHub. Voice input uses your
        browser's speech recognition (requires internet — unlike a native
        app's on-device recognition) and works best in Chrome or Safari.
        There's no home-screen widget or native alarm-style notifications
        in this version.
      </div>
    </div>
  `;
}

function handleThemeChange(pref) {
  setThemePreference(pref);
  renderSettingsScreen();
}

// ---------- Note detail (shown as a full-screen overlay, not a nav tab) ----------

function openNoteDetail(noteId) {
  AppState.editingNoteId = noteId;
  document.getElementById('note-detail-overlay').classList.add('active');
  renderNoteDetail();
}

function closeNoteDetail() {
  document.getElementById('note-detail-overlay').classList.remove('active');
  AppState.editingNoteId = null;
  // Whatever screen is behind this overlay may show data that just
  // changed (e.g. Home's "today" list after marking a note complete) —
  // re-render it so the person doesn't see stale state underneath.
  renderScreen(AppState.currentScreen);
}

function renderNoteDetail() {
  const note = DB.getNoteById(AppState.editingNoteId);
  const container = document.getElementById('note-detail-content');
  if (!note) {
    container.innerHTML = '<div class="text-dim" style="padding:16px">Note not found.</div>';
    return;
  }
  const cat = categoryById(note.categoryId);
  const items = note.isChecklist ? DB.getChecklistItems(note.id) : [];

  const checklistHtml = note.isChecklist ? `
    <div class="mt-md">
      ${items.map(item => `
        <div class="checklist-row" onclick="toggleNoteChecklistItem('${item.id}')">
          <div class="checkbox ${item.done ? 'checked' : ''}" style="border-color:${cat ? cat.color : 'var(--accent)'}; ${item.done ? `background:${cat ? cat.color : 'var(--accent)'}` : ''}">${item.done ? '✓' : ''}</div>
          <div class="checklist-text ${item.done ? 'done' : ''}" style="flex:1">${escapeHtml(item.text)}</div>
          <button onclick="event.stopPropagation(); deleteNoteChecklistItem('${item.id}')" style="color:var(--text-faint); font-size:20px; padding:0 4px">×</button>
        </div>
      `).join('')}
      <div class="flex-row" style="gap:8px; margin-top:8px">
        <input type="text" class="text-input" id="note-detail-add-item" placeholder="Add item…" style="flex:1" />
        <button onclick="handleAddNoteChecklistItem()" style="background:var(--accent); color:var(--on-accent); padding:10px 16px; border-radius:8px; font-weight:700">Add</button>
      </div>
    </div>
  ` : `
    <textarea class="textarea-input mt-sm" id="note-detail-body" placeholder="Add details…">${escapeHtml(note.body)}</textarea>
  `;

  const priorityRowHtml = ['low', 'medium', 'high'].map(p => `
    <button onclick="setNotePriority('${p}')" class="priority-chip ${note.priority === p ? 'selected-' + p : ''}">${p}</button>
  `).join('');

  container.innerHTML = `
    <input type="text" class="text-input" id="note-detail-title" value="${escapeHtml(note.title)}" placeholder="Note title" style="font-size:20px; font-weight:700; border:none; padding:0; background:transparent" />
    ${checklistHtml}

    <div class="card mt-lg">
      <div style="font-weight:700; margin-bottom:8px">Reminder</div>
      <div class="flex-row" style="justify-content:space-between; padding:4px 0">
        <div class="text-dim">Notify me</div>
        <input type="checkbox" id="note-detail-notify" ${note.notify ? 'checked' : ''} onchange="toggleNoteNotify()" style="width:20px; height:20px; accent-color:var(--accent)" />
      </div>
      ${note.notify ? `
        <div class="flex-row" style="justify-content:space-between; padding:4px 0">
          <div class="text-dim">Date</div>
          <input type="date" id="note-detail-date" value="${note.dueDate || ''}" onchange="setNoteDueDate(this.value)" style="border:1px solid var(--border); border-radius:6px; padding:4px; background:var(--bg-raised); color:var(--text)" />
        </div>
        <div class="flex-row" style="justify-content:space-between; padding:4px 0">
          <div class="text-dim">Time</div>
          <input type="time" id="note-detail-time" value="${note.dueTime || ''}" onchange="setNoteDueTime(this.value)" style="border:1px solid var(--border); border-radius:6px; padding:4px; background:var(--bg-raised); color:var(--text)" />
        </div>
        <div style="font-weight:700; margin-top:12px; margin-bottom:4px">Priority</div>
        <div class="priority-row">${priorityRowHtml}</div>
      ` : ''}
    </div>

    <button onclick="toggleNoteCompleted()" style="width:100%; margin-top:16px; padding:12px; border-radius:14px; font-weight:700;
             background:${note.completed ? 'var(--bg-sunken)' : 'var(--success)'}; color:${note.completed ? 'var(--text-dim)' : '#FFFFFF'}">
      ${note.completed ? 'Mark as not done' : 'Mark as done'}
    </button>

    <button onclick="handleDeleteNote()" style="width:100%; margin-top:24px; padding:12px; text-align:center; color:var(--danger); font-weight:600">
      Delete note
    </button>
  `;

  document.getElementById('note-detail-title').addEventListener('blur', () => {
    DB.updateNote(note.id, { title: document.getElementById('note-detail-title').value });
  });
  const bodyEl = document.getElementById('note-detail-body');
  if (bodyEl) {
    bodyEl.addEventListener('blur', () => {
      DB.updateNote(note.id, { body: bodyEl.value });
    });
  }
  const addItemEl = document.getElementById('note-detail-add-item');
  if (addItemEl) {
    addItemEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddNoteChecklistItem();
    });
  }
}

function toggleNoteChecklistItem(itemId) {
  const items = DB.getChecklistItems(AppState.editingNoteId);
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  DB.toggleChecklistItem(itemId, !item.done);
  renderNoteDetail();
}

function deleteNoteChecklistItem(itemId) {
  DB.deleteChecklistItem(itemId);
  renderNoteDetail();
}

function handleAddNoteChecklistItem() {
  const input = document.getElementById('note-detail-add-item');
  const text = input.value.trim();
  if (!text) return;
  DB.addChecklistItem(AppState.editingNoteId, text, NLP.guessSection(text));
  renderNoteDetail();
}

function toggleNoteNotify() {
  const checked = document.getElementById('note-detail-notify').checked;
  DB.updateNote(AppState.editingNoteId, { notify: checked });
  renderNoteDetail();
}

function setNoteDueDate(value) {
  DB.updateNote(AppState.editingNoteId, { dueDate: value || null });
}

function setNoteDueTime(value) {
  DB.updateNote(AppState.editingNoteId, { dueTime: value || null });
}

function setNotePriority(priority) {
  DB.updateNote(AppState.editingNoteId, { priority });
  renderNoteDetail();
}

function toggleNoteCompleted() {
  const note = DB.getNoteById(AppState.editingNoteId);
  DB.updateNote(note.id, { completed: !note.completed, completedAt: !note.completed ? new Date().toISOString() : null });
  renderNoteDetail();
}

function handleDeleteNote() {
  if (!confirm('Delete this note? This cannot be undone.')) return;
  DB.deleteNote(AppState.editingNoteId);
  closeNoteDetail();
}

// ---------- Category editor (shown as an overlay) ----------

const ICON_CHOICES = ['📌', '🛒', '🧹', '🔨', '💡', '📅', '🏡', '💰', '📦', '🐕', '🚗', '💊', '📚', '🎉', '✈️', '🎂'];
const COLOR_CHOICES = ['#4F8F63', '#3D8FA6', '#B5602C', '#8A5FB0', '#C08A3E', '#6B9B37', '#3E6E8E', '#8C8985', '#C0524A', '#5B7A6B'];

let categoryEditorState = { id: null, icon: ICON_CHOICES[0], color: COLOR_CHOICES[0] };

function openCategoryEditor(categoryId) {
  const existing = categoryId ? categoryById(categoryId) : null;
  categoryEditorState = {
    id: categoryId,
    icon: existing ? existing.icon : ICON_CHOICES[0],
    color: existing ? existing.color : COLOR_CHOICES[0],
  };
  document.getElementById('category-editor-overlay').classList.add('active');
  renderCategoryEditor();
}

function closeCategoryEditor() {
  document.getElementById('category-editor-overlay').classList.remove('active');
  renderSettingsScreen();
}

function renderCategoryEditor() {
  const existing = categoryEditorState.id ? categoryById(categoryEditorState.id) : null;
  const container = document.getElementById('category-editor-content');

  container.innerHTML = `
    <input type="text" class="text-input" id="category-editor-label" placeholder="Category name"
           value="${existing ? escapeHtml(existing.label) : ''}" ${existing && existing.isBuiltIn ? 'disabled' : ''}
           style="font-size:18px; margin-bottom:4px" />
    ${existing && existing.isBuiltIn ? `<div class="text-faint" style="font-size:12px; margin-bottom:12px">Built-in category names can't be changed, but you can still customize the icon and color.</div>` : ''}

    <div class="section-label mt-lg">Icon</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px">
      ${ICON_CHOICES.map(icon => `
        <button onclick="setCategoryEditorIcon('${icon}')"
                style="width:44px; height:44px; border-radius:12px; font-size:20px;
                       background:${categoryEditorState.icon === icon ? 'var(--accent-tint)' : 'var(--bg-sunken)'};
                       border:${categoryEditorState.icon === icon ? '2px solid var(--accent)' : 'none'}">
          ${icon}
        </button>
      `).join('')}
    </div>

    <div class="section-label">Color</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px">
      ${COLOR_CHOICES.map(color => `
        <button onclick="setCategoryEditorColor('${color}')"
                style="width:36px; height:36px; border-radius:18px; background:${color};
                       border:${categoryEditorState.color === color ? '3px solid var(--text)' : 'none'}">
        </button>
      `).join('')}
    </div>

    ${existing && !existing.isBuiltIn ? `
      <button onclick="handleDeleteCategory()" style="width:100%; padding:12px; text-align:center; color:var(--danger); font-weight:600; margin-top:16px">
        Delete category
      </button>
    ` : ''}
  `;
}

function setCategoryEditorIcon(icon) {
  categoryEditorState.icon = icon;
  renderCategoryEditor();
}

function setCategoryEditorColor(color) {
  categoryEditorState.color = color;
  renderCategoryEditor();
}

function handleSaveCategory() {
  const labelInput = document.getElementById('category-editor-label');
  const label = labelInput.value.trim();
  if (!label) return;

  if (categoryEditorState.id) {
    DB.updateCategory(categoryEditorState.id, { icon: categoryEditorState.icon, color: categoryEditorState.color, label });
  } else {
    DB.createCategory({ label, icon: categoryEditorState.icon, color: categoryEditorState.color });
  }
  closeCategoryEditor();
}

function handleDeleteCategory() {
  if (!confirm('Delete this category? Notes in it will move to Miscellaneous.')) return;
  try {
    DB.deleteCategory(categoryEditorState.id);
    closeCategoryEditor();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Voice capture modal ----------

let voiceCaptureState = {
  transcript: '',
  categoryOverride: null,
  initialCategoryId: null,
};

function initVoiceCaptureModal(initialCategoryId) {
  voiceCaptureState = {
    transcript: '',
    categoryOverride: null,
    initialCategoryId: initialCategoryId || null,
  };

  // If opened from within a specific category (e.g. the mic button on the
  // Groceries screen), that category should win over the NLP's guess by
  // default — same reasoning as the native build's fix for this exact gap.
  if (initialCategoryId) {
    const cat = categoryById(initialCategoryId);
    if (cat) voiceCaptureState.categoryOverride = cat.key;
  }

  renderVoiceCaptureModal();

  voiceService.setCallbacks({
    onStateChange: (state) => {
      const wrapper = document.getElementById('voice-mic-wrapper');
      if (wrapper) wrapper.classList.toggle('listening', state === 'listening');
    },
    onPartialResult: (text) => {
      document.getElementById('voice-transcript-input').value = voiceCaptureState.transcript
        ? voiceCaptureState.transcript + ' ' + text
        : text;
    },
    onFinalResult: (text) => {
      voiceCaptureState.transcript = voiceCaptureState.transcript
        ? voiceCaptureState.transcript + ' ' + text
        : text;
      renderVoiceCaptureModal();
    },
    onError: (message) => {
      if (message) showVoiceCaptureError(message);
    },
  });
}

function showVoiceCaptureError(message) {
  const el = document.getElementById('voice-error-banner');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function handleVoiceMicPress() {
  const state = voiceService.getState();
  if (state === 'listening') {
    voiceService.stop();
  } else {
    document.getElementById('voice-error-banner').classList.add('hidden');
    voiceService.start();
  }
}

function renderVoiceCaptureModal() {
  const container = document.getElementById('voice-modal-body');
  const categories = DB.listCategories();
  const parsed = voiceCaptureState.transcript.trim() ? NLP.parseVoiceInput(voiceCaptureState.transcript) : null;
  const effectiveCategoryKey = voiceCaptureState.categoryOverride || (parsed ? parsed.categoryGuess : 'miscellaneous');

  const pillsHtml = categories.map(cat => `
    <button class="pill ${cat.key === effectiveCategoryKey ? 'selected' : ''}"
            style="${cat.key === effectiveCategoryKey ? `background:${cat.color}` : ''}"
            onclick="setVoiceCaptureCategory('${cat.key}')">
      ${cat.icon} ${escapeHtml(cat.label)}
    </button>
  `).join('');

  let parsedSectionHtml = '';
  if (parsed) {
    let whenHtml = '';
    if (parsed.dueDate) {
      const dateLabel = new Date(parsed.dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const timeLabel = parsed.dueTime ? ` at ${formatTimeLabel(parsed.dueTime)}` : '';
      const hasExplicitMeridiem = /\b(am|pm)\b/i.test(parsed.rawText);

      whenHtml = `
        <div class="mt-lg">
          <div class="section-label">When</div>
          <div>${dateLabel}${timeLabel}</div>
          ${parsed.dueTime && !hasExplicitMeridiem ? `
            <div class="banner banner-warning">
              ⚠️ You didn't say "AM" or "PM" — I guessed ${formatTimeLabel(parsed.dueTime)}.
              Tap a category above then adjust the time after saving if that's wrong.
            </div>
          ` : ''}
          ${parsed.repeat ? `<div class="text-dim mt-sm" style="font-size:14px">Repeats: ${describeRepeat(parsed.repeat)}</div>` : ''}
        </div>
      `;
    }

    let itemsHtml = '';
    if (parsed.isLikelyChecklist && parsed.checklistItems.length > 0) {
      itemsHtml = `
        <div class="mt-lg">
          <div class="section-label">Items (${parsed.checklistItems.length})</div>
          ${parsed.checklistItems.map(item => `<div style="margin-top:2px">• ${escapeHtml(item)}</div>`).join('')}
        </div>
      `;
    }

    parsedSectionHtml = `
      <div class="mt-lg">
        <div class="section-label">Category</div>
        <div class="pill-row">${pillsHtml}</div>
        ${whenHtml}
        ${itemsHtml}
      </div>
    `;
  }

  container.innerHTML = `
    <textarea class="textarea-input" id="voice-transcript-input" placeholder="Tap the microphone and start speaking…" style="min-height:120px; font-size:18px">${escapeHtml(voiceCaptureState.transcript)}</textarea>
    <div id="voice-error-banner" class="banner banner-danger hidden"></div>
    ${parsedSectionHtml}
  `;

  document.getElementById('voice-transcript-input').addEventListener('input', (e) => {
    voiceCaptureState.transcript = e.target.value;
  });
  document.getElementById('voice-transcript-input').addEventListener('blur', () => {
    renderVoiceCaptureModal();
  });

  // Enable/disable the Save button based on whether there's any transcript
  const saveBtn = document.getElementById('voice-modal-save');
  const hasText = voiceCaptureState.transcript.trim().length > 0;
  saveBtn.style.color = hasText ? 'var(--accent)' : 'var(--text-faint)';
  saveBtn.disabled = !hasText;

  if (!voiceService.supported) {
    showVoiceCaptureError("Voice input isn't supported in this browser. Try Chrome or Safari, or type your note above.");
  }
}

function setVoiceCaptureCategory(categoryKey) {
  voiceCaptureState.categoryOverride = categoryKey;
  renderVoiceCaptureModal();
}

function formatTimeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`;
}

function describeRepeat(repeat) {
  switch (repeat.frequency) {
    case 'daily': return 'Every day';
    case 'weekly': return 'Every week';
    case 'monthly': return 'Every month';
    case 'custom': return repeat.intervalDays ? `Every ${repeat.intervalDays} days` : 'Custom';
    default: return 'Once';
  }
}

function handleSaveVoiceNote() {
  const transcript = voiceCaptureState.transcript.trim();
  if (!transcript) return;

  const parsed = NLP.parseVoiceInput(transcript);
  const effectiveCategoryKey = voiceCaptureState.categoryOverride || parsed.categoryGuess;
  const category = DB.listCategories().find(c => c.key === effectiveCategoryKey) || DB.listCategories()[0];

  DB.createNote({
    categoryId: category.id,
    title: parsed.isLikelyChecklist ? 'Grocery list' : parsed.cleanedText,
    body: '',
    isChecklist: parsed.isLikelyChecklist,
    checklistItems: parsed.isLikelyChecklist ? parsed.checklistItems : undefined,
    guessSection: NLP.guessSection,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    repeat: parsed.repeat,
    notify: !!parsed.dueDate,
    priority: parsed.dueDate ? 'medium' : null,
  });

  closeVoiceCapture();
  renderScreen(AppState.currentScreen);
}
