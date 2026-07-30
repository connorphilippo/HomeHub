/**
 * NLP logic ported from the tested and bug-fixed RN version
 * (src/services/nlp/categoryClassifier.ts and dateTimeExtractor.ts).
 * The classifyCategory logic below is copied verbatim in structure and
 * check-order — including the fix for the "buy paint" vs "buy milk"
 * category-collision bug found during the native build — since re-deriving
 * this from scratch would risk quietly reintroducing that exact bug.
 *
 * date-fns is NOT used here (no bundler in this build to resolve npm
 * packages cleanly via a plain <script> tag), so date math below is
 * reimplemented with native Date methods. Each function names which
 * date-fns call it stands in for, so the two can be diffed against each
 * other if either is changed later.
 */

// ---------- Category classifier ----------

const CATEGORY_KEYWORDS = {
  groceries: [
    'milk', 'eggs', 'bread', 'cheese', 'butter', 'yogurt', 'chicken', 'beef',
    'pork', 'fish', 'rice', 'pasta', 'cereal', 'coffee', 'tea', 'sugar',
    'flour', 'oil', 'sauce', 'fruit', 'vegetable', 'vegetables', 'apples',
    'bananas', 'onions', 'potatoes', 'tomatoes', 'grocery', 'groceries',
    'supermarket', 'shopping list',
  ],
  cleaning: [
    'vacuum', 'mop', 'dust', 'dusting', 'clean the', 'cleaning', 'laundry',
    'wash the', 'scrub', 'wipe down', 'bathroom', 'kitchen counter',
    'windows', 'declutter', 'tidy',
  ],
  maintenance: [
    'smoke detector', 'battery', 'batteries', 'hvac', 'filter', 'furnace',
    'paint', 'fence', 'gutter', 'gutters', 'roof', 'leak', 'plumbing',
    'electrical', 'repair', 'fix the', 'replace the', 'maintenance',
    'water heater', 'sump pump',
  ],
  thingsToBuy: ['buy', 'purchase', 'order', 'need to get', 'pick up', 'new'],
  reminders: [
    'remind me', 'reminder', "don't forget", 'remember to', 'bins',
    'trash', 'garbage', 'recycling', 'appointment', 'call', 'email',
  ],
  garden: [
    'water the plants', 'plants', 'garden', 'lawn', 'mow', 'weed', 'weeds',
    'prune', 'seeds', 'planting', 'soil', 'fertilize', 'hose',
  ],
  bills: [
    'bill', 'bills', 'pay', 'invoice', 'rent', 'mortgage', 'insurance',
    'subscription', 'electricity bill', 'water bill', 'credit card',
  ],
  miscellaneous: [],
};

const CHECK_ORDER = [
  'groceries', 'cleaning', 'maintenance', 'garden', 'bills', 'reminders',
  'thingsToBuy', 'miscellaneous',
];

const PURCHASE_INTENT_PATTERN = /\b(buy|purchase|order|pick up|need to get)\b/;

function classifyCategory(text) {
  const lower = text.toLowerCase();

  // Food-specific nouns win over a generic purchase verb even when both
  // are present — "buy milk and eggs" must file under Groceries, not
  // Things to Buy. This is the fix for the second bug found in the native
  // build; it must run BEFORE the purchase-intent check below.
  for (const groceryKeyword of CATEGORY_KEYWORDS.groceries) {
    if (lower.includes(groceryKeyword)) {
      return { category: 'groceries', confidence: 0.8, matchedKeyword: groceryKeyword };
    }
  }

  if (PURCHASE_INTENT_PATTERN.test(lower)) {
    const match = lower.match(PURCHASE_INTENT_PATTERN)[0];
    return { category: 'thingsToBuy', confidence: 0.8, matchedKeyword: match };
  }

  for (const category of CHECK_ORDER) {
    if (category === 'thingsToBuy' || category === 'groceries') continue;
    const keywords = CATEGORY_KEYWORDS[category];
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return {
          category,
          confidence: keyword.split(' ').length > 1 ? 0.85 : 0.65,
          matchedKeyword: keyword,
        };
      }
    }
  }

  return { category: 'miscellaneous', confidence: 0.3, matchedKeyword: null };
}

function splitListItems(text) {
  return text
    .replace(/\band\b/gi, ',')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(capitalizeFirst);
}

function capitalizeFirst(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------- Date/time extractor ----------

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Stands in for date-fns' addDays(date, n)
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Stands in for date-fns' addWeeks(date, n)
function addWeeks(date, n) {
  return addDays(date, n * 7);
}

// Stands in for date-fns' addMonths(date, n)
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Stands in for date-fns' nextDay(date, dayIndex) — "the next occurrence
// of this weekday, strictly after today" (date-fns' nextDay never returns
// the same day, always at least 1 day ahead, which this replicates via
// the `|| 7` fallback when diff would otherwise be 0).
function nextDay(date, targetDow) {
  const d = new Date(date);
  const diff = (targetDow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Stands in for date-fns' format(date, 'yyyy-MM-dd')
function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function wordToNumber(token) {
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return words[token] !== undefined ? words[token] : parseInt(token, 10);
}

/**
 * Rule-based date/time extractor — logic and check-order copied exactly
 * from the tested RN version. See that file's own comments for why this
 * is deliberately rule-based rather than a general NLU model, and for the
 * documented "at 7 defaults to PM" heuristic below.
 */
function extractDateTime(text, now) {
  now = now || new Date();
  const lower = text.toLowerCase();
  const matchedSpans = [];

  let repeat = null;
  let targetDate = null;
  let dueTime = null;

  const everyNDaysMatch = lower.match(/every\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+days?/);
  if (everyNDaysMatch) {
    const n = wordToNumber(everyNDaysMatch[1]);
    repeat = { frequency: 'custom', intervalDays: n };
    matchedSpans.push(everyNDaysMatch[0]);
    targetDate = addDays(now, n);
  }

  const everyNWeeksMatch = lower.match(/every\s+(\d+|two|three|four)\s+weeks?/);
  if (!repeat && everyNWeeksMatch) {
    const n = wordToNumber(everyNWeeksMatch[1]);
    repeat = { frequency: 'custom', intervalDays: n * 7 };
    matchedSpans.push(everyNWeeksMatch[0]);
    targetDate = addWeeks(now, n);
  }

  const everyWeekdayMatch = lower.match(/every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (!repeat && everyWeekdayMatch) {
    const dayIndex = WEEKDAY_NAMES.indexOf(everyWeekdayMatch[1]);
    repeat = { frequency: 'weekly', daysOfWeek: [dayIndex] };
    matchedSpans.push(everyWeekdayMatch[0]);
    targetDate = nextDay(now, dayIndex);
  }

  if (!repeat && /\b(monthly|every month)\b/.test(lower)) {
    repeat = { frequency: 'monthly' };
    matchedSpans.push(lower.match(/\b(monthly|every month)\b/)[0]);
    targetDate = addMonths(now, 1);
  }

  if (!repeat && /\b(daily|every day)\b/.test(lower)) {
    repeat = { frequency: 'daily' };
    matchedSpans.push(lower.match(/\b(daily|every day)\b/)[0]);
    targetDate = addDays(now, 1);
  }

  if (!targetDate) {
    if (/\btomorrow\b/.test(lower)) {
      targetDate = addDays(now, 1);
      matchedSpans.push('tomorrow');
    } else if (/\btoday\b|\btonight\b/.test(lower)) {
      targetDate = now;
      matchedSpans.push(lower.includes('tonight') ? 'tonight' : 'today');
    } else {
      const nextWeekdayMatch = lower.match(
        /\b(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
      );
      if (nextWeekdayMatch) {
        const dayIndex = WEEKDAY_NAMES.indexOf(nextWeekdayMatch[2]);
        targetDate = nextDay(now, dayIndex);
        matchedSpans.push(nextWeekdayMatch[0].trim());
      }
    }
  }

  const timeMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    // Deliberate guess, not a certainty — see the correction banner this
    // powers in the voice capture UI (js/app.js renderParsedPreview).
    if (!meridiem && hour >= 1 && hour <= 7) hour += 12;

    dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    matchedSpans.push(timeMatch[0]);

    if (targetDate) {
      targetDate = new Date(targetDate);
      targetDate.setHours(hour, minute, 0, 0);
    }
  }

  return {
    dueDate: targetDate ? formatIsoDate(targetDate) : null,
    dueTime,
    repeat,
    matchedSpans,
  };
}

// ---------- Orchestrator (ported from services/nlp/index.ts) ----------

const LIST_INDICATOR_PATTERN = /,| and |\bto (groceries|the list|my list)\b/i;

function correctPunctuation(text) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
  const endsWithPunctuation = /[.!?]$/.test(capitalized);
  return endsWithPunctuation ? capitalized : capitalized + '.';
}

function extractListPortion(text) {
  const stripped = text
    .replace(/^(add|put)\s+/i, '')
    .replace(/\s+to\s+(the\s+)?(groceries|grocery list|my list|the list)\.?$/i, '')
    .trim();
  return splitListItems(stripped);
}

function parseVoiceInput(rawText, now) {
  const cleanedText = correctPunctuation(rawText);
  const { dueDate, dueTime, repeat } = extractDateTime(rawText, now);
  const { category, confidence } = classifyCategory(rawText);

  const isLikelyChecklist = category === 'groceries' && LIST_INDICATOR_PATTERN.test(rawText) && !dueDate;
  const checklistItems = isLikelyChecklist ? extractListPortion(rawText) : [];

  return {
    rawText,
    categoryGuess: category,
    categoryConfidence: confidence,
    dueDate,
    dueTime,
    repeat,
    isLikelyChecklist,
    checklistItems,
    cleanedText,
  };
}

const PAIRING_SUGGESTIONS = {
  pasta: ['Pasta sauce', 'Parmesan'],
  cereal: ['Milk'],
  bread: ['Butter', 'Jam'],
  coffee: ['Milk', 'Sugar'],
  taco: ['Tortillas', 'Salsa', 'Cheese'],
  burger: ['Buns', 'Ketchup'],
};

function suggestMissingItems(currentItems) {
  const lowerItems = currentItems.map(i => i.toLowerCase());
  const suggestions = new Set();
  for (const item of lowerItems) {
    for (const [key, pairs] of Object.entries(PAIRING_SUGGESTIONS)) {
      if (item.includes(key)) {
        pairs.forEach(p => {
          if (!lowerItems.some(li => li.includes(p.toLowerCase()))) suggestions.add(p);
        });
      }
    }
  }
  return Array.from(suggestions);
}

const SECTION_KEYWORDS = {
  apple: 'produce', banana: 'produce', lettuce: 'produce', tomato: 'produce',
  onion: 'produce', potato: 'produce', carrot: 'produce', spinach: 'produce',
  milk: 'dairy', cheese: 'dairy', yogurt: 'dairy', butter: 'dairy', cream: 'dairy', eggs: 'dairy',
  chicken: 'meat', beef: 'meat', pork: 'meat', bacon: 'meat', sausage: 'meat', fish: 'meat',
  'ice cream': 'frozen', frozen: 'frozen', pizza: 'frozen',
  water: 'drinks', juice: 'drinks', soda: 'drinks', beer: 'drinks', wine: 'drinks', coffee: 'drinks', tea: 'drinks',
  detergent: 'household', 'paper towel': 'household', soap: 'household', 'toilet paper': 'household',
  chips: 'snacks', crackers: 'snacks', cookies: 'snacks', nuts: 'snacks',
};

function guessSection(itemText) {
  const lower = itemText.toLowerCase();
  for (const [keyword, section] of Object.entries(SECTION_KEYWORDS)) {
    if (lower.includes(keyword)) return section;
  }
  return 'other';
}

const NLP = {
  classifyCategory,
  splitListItems,
  extractDateTime,
  parseVoiceInput,
  suggestMissingItems,
  guessSection,
};
