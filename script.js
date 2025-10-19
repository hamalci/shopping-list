/* script.js — גרסה מלאה משולבת
   תומכת: choose grid, create items, localStorage, network/branch fetch,
   apiPrices + manualPrices, normalized matching (עברית), edit-on-click price,
   price layout currency+amount, total rendering, category toggle (mobile+desktop).
*/

/* ====== Inicial setup ====== */
if (!localStorage.getItem('rootFontBoostedBy3')) {
  const prev = parseInt(localStorage.getItem('rootFontPx')) || 16;
  localStorage.setItem('rootFontPx', String(prev + 3));
  localStorage.setItem('rootFontBoostedBy3', '1');
}
let rootFontPx = parseInt(localStorage.getItem("rootFontPx")) || 19;
document.documentElement.style.fontSize = rootFontPx + "px";
if (localStorage.getItem("viewMode") === "dark") document.body.classList.add("dark-mode");

/* ====== categories + defaults ====== */
let categoriesOrder = JSON.parse(localStorage.getItem("categoriesOrder")) || [
  "פירות וירקות","מוצרי חלב","מאפים ולחמים","בשר ועופות","מזווה ויבשים","אחרים"
];
const categories = {
  "פירות וירקות": ["גזר","מלפפונים","עגבניות"],
  "מוצרי חלב": ["חלב","גבינה"],
  "מאפים ולחמים": ["לחם"],
  "בשר ועופות": ["עוף"],
  "מזווה ויבשים": ["אורז","קפה"]
};
const savedCategories = localStorage.getItem("categoriesMap");
if (savedCategories) Object.assign(categories, JSON.parse(savedCategories));

/* ====== store map דמה ====== */
const storeMap = {
  yohananof: [{ id: 'gd', name: 'יוחננוף גדרה' }, { id: 'tlv', name: 'יוחננוף תל אביב' }],
  shufersal: [{ id: 'rd', name: 'שופרסל רמת דוד' }],
  rami: [{ id: 'hl', name: 'רמי לוי חולון' }]
};

/* ====== price maps (api/manual) ====== */
function saveApiPrices(map) { localStorage.setItem('apiPrices', JSON.stringify(map || {})); }
function loadApiPrices() { return JSON.parse(localStorage.getItem('apiPrices') || '{}'); }
function saveManualPrices(map) { localStorage.setItem('manualPrices', JSON.stringify(map || {})); }
function loadManualPrices() { return JSON.parse(localStorage.getItem('manualPrices') || '{}'); }

/* Migrate legacy itemPrices -> manualPrices once */
(function migrateOldItemPrices() {
  const old = JSON.parse(localStorage.getItem('itemPrices') || 'null');
  if (old && !localStorage.getItem('manualPrices')) {
    saveManualPrices(old);
    localStorage.removeItem('itemPrices');
  }
})();

/* ====== Normalization (Hebrew) + fuzzy helper ====== */
function normalizeName(s) {
  if (!s) return "";
  s = String(s).trim().toLowerCase();
  s = s.replace(/[\u0591-\u05C7]/g, ""); // remove nikud
  s = s.replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ");
  s = s.replace(/[^א-ת0-9\s]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/ות$/,"").replace(/ים$/,"").replace(/יות$/,""
  );
  s = s.replace(/^ה\s*/,"");
  return s;
}
function buildNormalizedPriceMap(apiPrices) {
  const map = {};
  Object.keys(apiPrices || {}).forEach(orig => {
    const key = normalizeName(orig);
    map[key] = apiPrices[orig];
  });
  return map;
}
function levenshtein(a,b){
  const m=a.length, n=b.length;
  if(m===0) return n; if(n===0) return m;
  const dp = Array.from({length:m+1}, (_,i)=> i);
  for(let j=1;j<=n;j++){
    let prev = dp[0];
    dp[0] = j;
    for(let i=1;i<=m;i++){
      const temp = dp[i];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i] = Math.min(dp[i]+1, dp[i-1]+1, prev+cost);
      prev = temp;
    }
  }
  return dp[m];
}
function findClosestNormalized(target, candidates, maxDist){
  let best = null, bestD = Infinity;
  candidates.forEach(c => {
    const d = levenshtein(target, c);
    if (d < bestD) { bestD = d; best = c; }
  });
  return bestD <= maxDist ? best : null;
}

/* ====== price resolution (manual priority) ====== */
function getPriceForItem(name) {
  const manual = loadManualPrices();
  const api = loadApiPrices();

  const manualNorm = {};
  Object.keys(manual || {}).forEach(k => manualNorm[normalizeName(k)] = manual[k]);

  const apiNorm = buildNormalizedPriceMap(api);

  const n = normalizeName(name);
  if (manualNorm[n] !== undefined) return manualNorm[n];
  if (apiNorm[n] !== undefined) return apiNorm[n];

  const candidate = findClosestNormalized(n, Object.keys(apiNorm), 2);
  if (candidate) return apiNorm[candidate];

  return null;
}

/* ====== fetch prices for branch (saves apiPrices + normalized cache) ====== */
async function fetchPricesForBranch(network, branchId) {
  if (!network || !branchId) return null;
  const url = `/data/prices/${encodeURIComponent(network)}/${encodeURIComponent(branchId)}.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !json.prices) throw new Error("Invalid price data");

    saveApiPrices(json.prices || {});
    const normMap = buildNormalizedPriceMap(json.prices || {});
    localStorage.setItem('apiPricesNormalized', JSON.stringify(normMap));
    localStorage.setItem('lastFetchedPrices', JSON.stringify({ network, branchId, updated: json.updated || new Date().toISOString() }));
    renderAllPrices();
    renderTotal();
    return json.prices;
  } catch (err) {
    console.error("Failed to fetch prices for branch:", err);
    return null;
  }
}

/* ====== UI helpers: create choose button ====== */
function makeChooseButton(item) {
  const btn = document.createElement("div");
  btn.className = "choose-item";
  btn.setAttribute('data-icon', item.icon);
  btn.textContent = item.name;

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "0";
  badge.style.display = "none";
  btn.appendChild(badge);

  btn.addEventListener("click", () => {
    const listGrid = document.getElementById("listGrid");
    const existing = Array.from(listGrid.querySelectorAll(".item"))
      .find(el => el.querySelector(".name")?.textContent.includes(item.name));

    if (existing) {
      const qtyEl = existing.querySelector(".qty");
      let [num, ...rest] = qtyEl.textContent.split(" ").map(s => s.trim()).filter(s => s !== "");
      num = parseInt(num || "0", 10) + 1;
      const unitText = rest.join(" ") || item.unit || "";
      qtyEl.textContent = `${num} ${unitText}`.trim();
      badge.textContent = String(num);
      badge.style.display = "inline-flex";
    } else {
      createListItem(item.name, item.icon, 1, item.unit);
      badge.textContent = "1";
      badge.style.display = "inline-flex";
    }

    btn.classList.add("selected", "pulse");
    setTimeout(() => btn.classList.remove("pulse"), 420);
    saveListToStorage();
    
    // Don't close the modal - allow multiple selections
    // closeChooseModal();
    renderAllPrices();
    renderTotal();
  });

  // Attach long press handler for context menu on choose items
  attachLongPressToChooseItem(btn, item);

  return btn;
}

/* ====== createListItem (price as currency left, amount right inside fixed column) ====== */
function createListItem(name, icon = "🛒", quantity = 1, unit = "יח'", skipSave = false, price = null, note = "") {
  const cleanName = String(name || "").trim();
  const cleanIcon = String(icon || "🛒").trim();
  const num = parseFloat(quantity) || 1;
  const cleanUnit = String(unit || "יח'").trim();

  const row = document.createElement("div");
  row.className = "item fade-in";

  const nameSpan = document.createElement("span");
  nameSpan.className = "name";
  nameSpan.textContent = `${cleanIcon} ${cleanName}`.trim();

  // qty+unit as a single span for compactness
  const qty = document.createElement("span");
  qty.className = "qty";
  qty.textContent = `${num} ${cleanUnit}`.trim();

  // Note icon button
  const noteIcon = document.createElement("span");
  noteIcon.className = "note-icon";
  noteIcon.textContent = "📝";
  noteIcon.title = "הוסף הערה";
  noteIcon.style.cursor = "pointer";
  
  // הערה קצרה - מוסתרת כברירת מחדל
  const noteDiv = document.createElement("div");
  noteDiv.className = "item-note-row";
  if (!note || note.trim() === "") {
    noteDiv.style.display = "none"; // מוסתר אם אין הערה
  }
  
  const noteInput = document.createElement("input");
  noteInput.className = "item-note";
  noteInput.type = "text";
  noteInput.placeholder = "הוסף הערה...";
  noteInput.value = note || "";
  noteInput.setAttribute("aria-label", "הערה לפריט");
  
  noteInput.addEventListener("change", () => {
    // אם ההערה ריקה, הסתר את השדה
    if (noteInput.value.trim() === "") {
      noteDiv.style.display = "none";
      noteIcon.textContent = "📝";
    } else {
      noteIcon.textContent = "📝✓";
    }
    saveListToStorage();
  });
  
  noteInput.addEventListener("blur", () => {
    // אם ההערה ריקה בעת איבוד פוקוס, הסתר
    if (noteInput.value.trim() === "") {
      noteDiv.style.display = "none";
      noteIcon.textContent = "📝";
    }
  });
  
  noteDiv.appendChild(noteInput);
  
  // Toggle note visibility on icon click
  noteIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    if (noteDiv.style.display === "none") {
      noteDiv.style.display = "flex";
      noteInput.focus();
    } else {
      if (noteInput.value.trim() === "") {
        noteDiv.style.display = "none";
      }
    }
  });
  
  // Update icon if note exists
  if (note && note.trim() !== "") {
    noteIcon.textContent = "📝✓";
  }

  // price element: amount and currency, compact
  const priceSpan = document.createElement("span");
  priceSpan.className = "price";
  const amountSpan = document.createElement("span");
  amountSpan.className = "amount";
  amountSpan.textContent = (price != null && price !== "") ? String(price) : "";
  const currencySpan = document.createElement("span");
  currencySpan.className = "currency";
  currencySpan.textContent = "₪";
  priceSpan.appendChild(amountSpan);
  priceSpan.appendChild(currencySpan);

  // edit on click for amount
  priceSpan.style.cursor = "pointer";
  priceSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    const current = amountSpan.textContent || "";
    const p = prompt("הכנס מחיר בפריטים בשקלים (ללא סימן):", current);
    if (p === null) return;
  const cleaned = (p === "") ? "" : String(p).replace(/[^\d.]/g,'');
    amountSpan.textContent = cleaned;
    savePriceForItem(cleanName, cleaned);
    renderAllPrices();
    renderTotal();
  });

  // מבנה חדש: שם, כמות, מחיר, אייקון הערה בשורה אחת - הערה בשורה נפרדת
  row.appendChild(nameSpan);
  row.appendChild(qty);
  row.appendChild(priceSpan);
  row.appendChild(noteIcon);
  row.appendChild(noteDiv);

  // שמירת נתונים ותוספות אירועים
  row.addEventListener("click", (e) => {
    // אם אנחנו במצב בחירה, אל תבצע את הפעולה הרגילה
    if (selectionMode || row.dataset.selectionMode) return;
    
    // אם לחצת על ה priceSpan או על כפתורי qty או note-icon, אל תטפל ב־toggle של השורה
    if (e.target.closest('.price') || e.target.closest('.qty') || e.target.closest('.item-note') || e.target.closest('.note-icon')) return;
    row.classList.toggle("checked");
    const listGrid = document.getElementById("listGrid");
    row.classList.add("moving");
    setTimeout(() => { listGrid.appendChild(row); row.classList.remove("moving"); saveListToStorage(); }, 300);
  });

  document.getElementById("listGrid").appendChild(row);
  
  // Attach long press handler for context menu
  attachLongPressToItem(row);
  
  if (!skipSave) saveListToStorage();
  renderAllPrices();
  renderTotal();
  return row;
}

// ===== compute total (now price * quantity) =====
function computeTotalFromDOM() {
  let total = 0;
  document.querySelectorAll('#listGrid .item').forEach(el => {
    const amtText = el.querySelector('.price .amount')?.textContent || "";
    const price = parseFloat((amtText + "").replace(/[^\d.]/g,'')) || 0;

    // quantity from .q-amount or fallback to .qty text
    let qty = 1;
    const qEl = el.querySelector('.qty .q-amount');
    if (qEl) qty = parseFloat((qEl.textContent + "").replace(/[^\d.]/g,'')) || 1;
    else {
      const rawQty = el.querySelector('.qty')?.textContent || "1";
      qty = parseFloat((rawQty + "").replace(/[^\d.]/g,'')) || 1;
    }

    total += price * qty;
  });
  return total;
}

// renderTotal unchanged except it calls computeTotalFromDOM
function renderTotal() {
  const el = document.getElementById('totalAmount');
  if (!el) return;
  const total = computeTotalFromDOM();
  const display = Number.isInteger(total) ? `${total} ₪` : `${total.toFixed(2)} ₪`;
  el.textContent = display;
}


/* ====== load choose items ====== */
function loadDefaultChooseItems() {
  const chooseGrid = document.getElementById("chooseGrid");
  if (!chooseGrid) return;
  chooseGrid.innerHTML = "";

  // Organized items by categories
  const categorizedItems = {
    'פירות וירקות': [
      { name:"גזר",icon:"🥕",unit:"ק\"ג" },
      { name:"מלפפונים",icon:"🥒",unit:"ק\"ג" },
      { name:"עגבניות",icon:"🍅",unit:"ק\"ג" },
      { name:"חסה",icon:"🥬",unit:"יח'" },
      { name:"בצל",icon:"🧅",unit:"ק\"ג" },
      { name:"שום",icon:"🧄",unit:"אריזה" },
      { name:"תפוחי אדמה",icon:"🥔",unit:"ק\"ג" },
      { name:"תפוחים",icon:"🍎",unit:"ק\"ג" },
      { name:"בננות",icon:"🍌",unit:"ק\"ג" },
      { name:"תפוזים",icon:"🍊",unit:"ק\"ג" },
      { name:"לימונים",icon:"🍋",unit:"ק\"ג" },
      { name:"אבוקדו",icon:"🥑",unit:"יח'" },
      { name:"פלפלים",icon:"🫑",unit:"ק\"ג" },
      { name:"ברוקולי",icon:"🥦",unit:"יח'" },
      { name:"כרובית",icon:"🥦",unit:"יח'" },
      { name:"תירס",icon:"🌽",unit:"יח'" },
      { name:"חציל",icon:"🍆",unit:"ק\"ג" },
      { name:"דלעת",icon:"🎃",unit:"ק\"ג" },
      { name:"תותים",icon:"🍓",unit:"אריזה" },
      { name:"ענבים",icon:"🍇",unit:"ק\"ג" },
      { name:"אבטיח",icon:"🍉",unit:"יח'" },
      { name:"מלון",icon:"🍈",unit:"יח'" }
    ],
    'מוצרי חלב': [
      { name:"חלב",icon:"🥛",unit:"ליטר" },
      { name:"גבינה צהובה",icon:"🧀",unit:"אריזה" },
      { name:"גבינה לבנה",icon:"🧀",unit:"אריזה" },
      { name:"קוטג'",icon:"🥛",unit:"אריזה" },
      { name:"יוגורט",icon:"🥛",unit:"יח'" },
      { name:"שמנת",icon:"🥛",unit:"אריזה" },
      { name:"חמאה",icon:"🧈",unit:"אריזה" },
      { name:"ביצים",icon:"🥚",unit:"יח'" },
      { name:"חלב שקדים",icon:"🥛",unit:"ליטר" },
      { name:"חלב סויה",icon:"🥛",unit:"ליטר" }
    ],
    'מאפים ולחמים': [
      { name:"לחם",icon:"🍞",unit:"יח'" },
      { name:"חלה",icon:"🍞",unit:"יח'" },
      { name:"לחמניות",icon:"🥖",unit:"אריזה" },
      { name:"פיתות",icon:"🥙",unit:"אריזה" },
      { name:"טורטייה",icon:"🌯",unit:"אריזה" },
      { name:"בייגל",icon:"🥯",unit:"אריזה" },
      { name:"קרואסון",icon:"🥐",unit:"אריזה" },
      { name:"עוגיות",icon:"🍪",unit:"אריזה" },
      { name:"עוגה",icon:"🎂",unit:"יח'" },
      { name:"בורקס",icon:"🥐",unit:"אריזה" }
    ],
    'בשר ועופות': [
      { name:"חזה עוף",icon:"🍗",unit:"ק\"ג" },
      { name:"שניצל",icon:"🍗",unit:"ק\"ג" },
      { name:"כרעיים עוף",icon:"🍗",unit:"ק\"ג" },
      { name:"עוף שלם",icon:"🍗",unit:"ק\"ג" },
      { name:"בשר טחון",icon:"🥩",unit:"ק\"ג" },
      { name:"אנטריקוט",icon:"🥩",unit:"ק\"ג" },
      { name:"סטייק",icon:"🥩",unit:"ק\"ג" },
      { name:"נקניקיות",icon:"🌭",unit:"אריזה" },
      { name:"נקניק",icon:"🌭",unit:"ק\"ג" },
      { name:"קבב",icon:"🥩",unit:"ק\"ג" }
    ],
    'דגים': [
      { name:"סלמון",icon:"🐟",unit:"ק\"ג" },
      { name:"טונה",icon:"🐟",unit:"קופסא" },
      { name:"דניס",icon:"🐟",unit:"ק\"ג" },
      { name:"בורי",icon:"🐟",unit:"ק\"ג" },
      { name:"פילה דג",icon:"🐟",unit:"ק\"ג" },
      { name:"שרימפס",icon:"🦐",unit:"ק\"ג" }
    ],
    'מזווה ויבשים': [
      { name:"אורז",icon:"🍚",unit:"ק\"ג" },
      { name:"פסטה",icon:"🍝",unit:"אריזה" },
      { name:"קוסקוס",icon:"🍚",unit:"אריזה" },
      { name:"בורגול",icon:"🍚",unit:"ק\"ג" },
      { name:"קמח",icon:"🌾",unit:"ק\"ג" },
      { name:"סוכר",icon:"🧂",unit:"ק\"ג" },
      { name:"מלח",icon:"🧂",unit:"אריזה" },
      { name:"שמן",icon:"🫒",unit:"ליטר" },
      { name:"שמן זית",icon:"🫒",unit:"ליטר" },
      { name:"קטשופ",icon:"🍅",unit:"בקבוק" },
      { name:"מיונז",icon:"🥚",unit:"צנצנת" },
      { name:"חומוס",icon:"🫘",unit:"אריזה" },
      { name:"טחינה",icon:"🥫",unit:"צנצנת" },
      { name:"ריבה",icon:"🫙",unit:"צנצנת" },
      { name:"דבש",icon:"🍯",unit:"צנצנת" },
      { name:"שוקולד ממרח",icon:"🍫",unit:"צנצנת" },
      { name:"קפה",icon:"☕",unit:"אריזה" },
      { name:"תה",icon:"🍵",unit:"אריזה" },
      { name:"אבקת קקאו",icon:"☕",unit:"אריזה" }
    ],
    'משקאות': [
      { name:"מים",icon:"💧",unit:"בקבוק" },
      { name:"מיץ",icon:"🧃",unit:"ליטר" },
      { name:"קולה",icon:"🥤",unit:"ליטר" },
      { name:"פחית קולה",icon:"🥤",unit:"יח'" },
      { name:"בירה",icon:"🍺",unit:"בקבוק" },
      { name:"יין",icon:"🍷",unit:"בקבוק" },
      { name:"אלכוהול",icon:"🥃",unit:"בקבוק" }
    ],
    'חטיפים וממתקים': [
      { name:"שוקולד",icon:"🍫",unit:"יח'" },
      { name:"ביסלי",icon:"🥔",unit:"שקית" },
      { name:"במבה",icon:"🥜",unit:"שקית" },
      { name:"דובונים",icon:"🍬",unit:"שקית" },
      { name:"סוכריות",icon:"🍭",unit:"שקית" },
      { name:"גלידה",icon:"🍦",unit:"יח'" },
      { name:"עוגיות",icon:"🍪",unit:"אריזה" },
      { name:"פופקורן",icon:"🍿",unit:"אריזה" },
      { name:"חטיף אנרגיה",icon:"🍫",unit:"יח'" },
      { name:"אגוזים",icon:"🥜",unit:"שקית" }
    ],
    'מוצרי ניקיון': [
      { name:"נייר טואלט",icon:"🧻",unit:"אריזה" },
      { name:"מגבות נייר",icon:"🧻",unit:"אריזה" },
      { name:"סבון כלים",icon:"🧽",unit:"בקבוק" },
      { name:"אבקת כביסה",icon:"📦",unit:"אריזה" },
      { name:"מרכך כביסה",icon:"🧴",unit:"בקבוק" },
      { name:"אקונומיקה",icon:"🧴",unit:"בקבוק" },
      { name:"שקיות זבל",icon:"🗑️",unit:"אריזה" },
      { name:"ספוג",icon:"🧽",unit:"אריזה" },
      { name:"מטליות",icon:"🧽",unit:"אריזה" },
      { name:"סבון רצפה",icon:"🧴",unit:"בקבוק" }
    ],
    'מוצרי טיפוח': [
      { name:"סבון רחצה",icon:"🧼",unit:"יח'" },
      { name:"שמפו",icon:"🧴",unit:"בקבוק" },
      { name:"מרכך שיער",icon:"🧴",unit:"בקבוק" },
      { name:"משחת שיניים",icon:"🪥",unit:"יח'" },
      { name:"מברשת שיניים",icon:"🪥",unit:"יח'" },
      { name:"דאודורנט",icon:"🧴",unit:"יח'" },
      { name:"תער",icon:"🪒",unit:"אריזה" },
      { name:"קרם לחות",icon:"🧴",unit:"יח'" },
      { name:"טישו",icon:"🧻",unit:"אריזה" }
    ],
    'מוצרי תינוק': [
      { name:"חיתולים",icon:"👶",unit:"אריזה" },
      { name:"מזון תינוקות",icon:"🍼",unit:"יח'" },
      { name:"מטליות לחות",icon:"🧻",unit:"אריזה" },
      { name:"קרם לתינוק",icon:"🧴",unit:"יח'" },
      { name:"שמפו לתינוק",icon:"🧴",unit:"בקבוק" }
    ],
    'קפואים': [
      { name:"גלידה",icon:"🍦",unit:"יח'" },
      { name:"ירקות קפואים",icon:"🧊",unit:"אריזה" },
      { name:"פיצה קפואה",icon:"🍕",unit:"יח'" },
      { name:"שניצל קפוא",icon:"🧊",unit:"אריזה" },
      { name:"דגים קפואים",icon:"🧊",unit:"אריזה" }
    ]
  };

  // Load custom items and merge with default categories
  const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  
  // Group custom items by category
  const customByCategory = {};
  savedCustom.forEach(item => {
    const cat = item.category || 'פריטים מותאמים אישית';
    if (!customByCategory[cat]) customByCategory[cat] = [];
    customByCategory[cat].push(item);
  });

  // Create categories with items and + button
  Object.entries(categorizedItems).forEach(([categoryName, items]) => {
    // Create category header with + button
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'choose-category-header';
    categoryHeader.style.display = 'flex';
    categoryHeader.style.justifyContent = 'space-between';
    categoryHeader.style.alignItems = 'center';
    categoryHeader.style.cursor = 'default';
    
    const categoryTitle = document.createElement('span');
    categoryTitle.textContent = categoryName;
    categoryHeader.appendChild(categoryTitle);
    
    const addBtn = document.createElement('button');
    addBtn.textContent = '➕';
    addBtn.style.cssText = 'background: transparent; border: 1px solid rgba(76,175,80,0.4); color: #4CAF50; padding: 0.2rem 0.5rem; border-radius: 6px; cursor: pointer; font-size: 1.1rem; transition: all 0.2s;';
    addBtn.title = `הוסף פריט ל${categoryName}`;
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(76,175,80,0.1)';
      addBtn.style.transform = 'scale(1.1)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'transparent';
      addBtn.style.transform = 'scale(1)';
    });
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addCustomItem(categoryName);
    });
    categoryHeader.appendChild(addBtn);
    
    chooseGrid.appendChild(categoryHeader);

    // Add default items for this category
    items.forEach(item => {
      chooseGrid.appendChild(makeChooseButton(item));
    });
    
    // Add custom items that belong to this category
    if (customByCategory[categoryName]) {
      customByCategory[categoryName].forEach(c => {
        const safe = { name: String(c.name || "").trim(), icon: String(c.icon || "🛒").trim(), unit: String(c.unit || "יח'").trim() };
        chooseGrid.appendChild(makeChooseButton(safe));
      });
    }
  });

  // Add custom items section if there are items without category
  if (customByCategory['פריטים מותאמים אישית']) {
    // Create dedicated custom items section
    const customHeader = document.createElement('div');
    customHeader.className = 'choose-category-header';
    customHeader.style.display = 'flex';
    customHeader.style.justifyContent = 'space-between';
    customHeader.style.alignItems = 'center';
    
    const customTitle = document.createElement('span');
    customTitle.textContent = 'פריטים מותאמים אישית';
    customHeader.appendChild(customTitle);
    
    const addBtn = document.createElement('button');
    addBtn.textContent = '➕';
    addBtn.style.cssText = 'background: transparent; border: 1px solid rgba(76,175,80,0.4); color: #4CAF50; padding: 0.2rem 0.5rem; border-radius: 6px; cursor: pointer; font-size: 1.1rem; transition: all 0.2s;';
    addBtn.title = 'הוסף פריט מותאם אישית';
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(76,175,80,0.1)';
      addBtn.style.transform = 'scale(1.1)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'transparent';
      addBtn.style.transform = 'scale(1)';
    });
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addCustomItem('פריטים מותאמים אישית');
    });
    customHeader.appendChild(addBtn);
    
    chooseGrid.appendChild(customHeader);
    
    customByCategory['פריטים מותאמים אישית'].forEach(c => {
      const safe = { name: String(c.name || "").trim(), icon: String(c.icon || "🛒").trim(), unit: String(c.unit || "יח'").trim() };
      chooseGrid.appendChild(makeChooseButton(safe));
    });
  }
}

/* ====== list persistence ====== */
function saveListToStorage() {
  const items = [];
  document.querySelectorAll("#listGrid .item").forEach(el => {
    const rawName = (el.querySelector(".name")?.textContent || "").trim();
    const nameParts = rawName.split(" ").map(p => p.trim()).filter(p => p !== "");
    const icon = nameParts.length > 0 ? nameParts[0] : "🛒";
    const pureName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    const rawQty = (el.querySelector(".qty")?.textContent || "").trim();
    const qtyParts = rawQty.split(" ").map(p => p.trim()).filter(p => p !== "");
    const qty = qtyParts.join(" ");

    const priceText = (el.querySelector(".price .amount")?.textContent || "").trim();
    const noteText = (el.querySelector(".item-note")?.value || "").trim();

    items.push({ icon, name: pureName, qty, price: priceText, checked: el.classList.contains("checked"), note: noteText });
  });

  localStorage.setItem("shoppingList", JSON.stringify(items));
  if (typeof sortListByCategories === "function") sortListByCategories();
  renderTotal();
}

function loadListFromStorage(){
  const data = localStorage.getItem("shoppingList");
  if (!data) return;
  const items = JSON.parse(data);
  items.forEach(item => {
    const [num, ...rest] = (item.qty || "").split(" ");
    const unit = rest.join(" ");
  const priceMatch = (item.price || "").replace(/[^\d.]/g,'');
    const note = item.note || "";
    const row = createListItem(item.name, item.icon || "🛒", parseInt(num) || 1, unit || "יח'", true, priceMatch || null, note);
    if (item.checked) row.classList.add("checked");
  });
  if (typeof sortListByCategories === "function") sortListByCategories();
  renderAllPrices();
  renderTotal();
}

/* ====== save manual price override ====== */
function savePriceForItem(name, price) {
  const manual = loadManualPrices();
  if (!price || price === "") delete manual[name];
  else manual[name] = String(price);
  saveManualPrices(manual);
}

/* ====== render prices per item (show/hide) ====== */
function renderAllPrices() {
  const show = localStorage.getItem('showPrices') === '1';
  const branchLabel = localStorage.getItem('selectedBranchLabel') || '';
  document.querySelectorAll('#listGrid .item').forEach(el => {
    const name = el.querySelector('.name')?.textContent.split(' ').slice(1).join(' ') || '';
    const priceSpan = el.querySelector('.price');
    const stored = getPriceForItem(name);
    const amountEl = priceSpan?.querySelector('.amount');
    if (stored !== null && stored !== undefined) {
      amountEl.textContent = String(stored);
    }
    if (show && (stored || branchLabel)) {
      priceSpan.style.display = 'inline-flex';
      priceSpan.querySelector('.currency').style.display = 'inline';
    } else {
      priceSpan.style.display = 'none';
    }
  });
}

/* ====== sorting by categories ====== */
function sortListByCategories(){
  const listGrid = document.getElementById("listGrid");
  if (!listGrid) return;
  const items = Array.from(listGrid.querySelectorAll(".item"));
  listGrid.innerHTML = "";

  categoriesOrder.forEach(category => {
    const productNames = categories[category] || [];
    const catItems = items.filter(el => {
      const pureName = el.querySelector(".name").textContent.split(" ").slice(1).join(" ");
      return productNames.includes(pureName) && !el.classList.contains("checked");
    });
    catItems.forEach(el => listGrid.appendChild(el));
  });

  const flatNames = Object.values(categories).flat();
  const others = items.filter(el => {
    const pureName = el.querySelector(".name").textContent.split(" ").slice(1).join(" ");
    return !flatNames.includes(pureName) && !el.classList.contains("checked");
  });
  others.forEach(el => listGrid.appendChild(el));

  const checkedItems = items.filter(el => el.classList.contains("checked"));
  checkedItems.forEach(el => listGrid.appendChild(el));
}

/* ====== categories UI ====== */
function renderCategoriesList() {
  const ul = document.getElementById("categoriesList");
  if (!ul) return;
  ul.innerHTML = "";
  categoriesOrder.forEach((cat, index) => {
    const li = document.createElement("li"); li.textContent = cat;
    li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.alignItems = "center";
    const controls = document.createElement("div");
    const upBtn = document.createElement("button"); upBtn.textContent = "⬆"; upBtn.className = "btn-settings";
    upBtn.addEventListener("click", () => {
      if (index > 0) {
        [categoriesOrder[index-1], categoriesOrder[index]] = [categoriesOrder[index], categoriesOrder[index-1]];
        localStorage.setItem("categoriesOrder", JSON.stringify(categoriesOrder));
        renderCategoriesList(); sortListByCategories();
      }
    });
    const downBtn = document.createElement("button"); downBtn.textContent = "⬇"; downBtn.className = "btn-settings";
    downBtn.addEventListener("click", () => {
      if (index < categoriesOrder.length - 1) {
        [categoriesOrder[index+1], categoriesOrder[index]] = [categoriesOrder[index], categoriesOrder[index+1]];
        localStorage.setItem("categoriesOrder", JSON.stringify(categoriesOrder));
        renderCategoriesList(); sortListByCategories();
      }
    });
    controls.appendChild(upBtn); controls.appendChild(downBtn);
    li.appendChild(controls); ul.appendChild(li);
  });
}

/* ====== store UI ====== */
function populateBranches(network) {
  const branchSelect = document.getElementById('branchSelect');
  if (!branchSelect) return;
  branchSelect.innerHTML = '<option value="">(לא נבחר)</option>';
  const arr = storeMap[network] || [];
  arr.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.name;
    branchSelect.appendChild(opt);
  });
}

function saveStoreSelection() {
  const network = document.getElementById('networkSelect')?.value || '';
  const branch = document.getElementById('branchSelect')?.value || '';
  const branchLabel = document.getElementById('branchSelect')?.selectedOptions?.[0]?.textContent || '';
  localStorage.setItem('selectedNetwork', network);
  localStorage.setItem('selectedBranch', branch);
  localStorage.setItem('selectedBranchLabel', branchLabel);

  // fetch prices for branch (saves to apiPrices only)
  fetchPricesForBranch(network, branch).then(map => {
    if (map) alert('בחירת חנות נשמרה ומחירים נטענו');
    else alert('בחירת חנות נשמרה אך לא נמצאו מחירים לסניף זה');
  });
  renderAllPrices();
  renderTotal();
  // Close the dropdown after saving
  const dd = document.getElementById('menuDropdown');
  if (dd) dd.style.display = 'none';
}

function togglePriceDisplay(show) {
  localStorage.setItem('showPrices', show ? '1' : '0');
  renderAllPrices();
  renderTotal();
}

/* ====== basic actions ====== */
function resetChoiceBadges(){
  // איפוס רק הסימונים והבדג'ים, לא את כל הטבלה
  document.querySelectorAll(".choose-item .badge").forEach(b => { b.textContent = "0"; b.style.display = "none"; });
  document.querySelectorAll(".choose-item.selected").forEach(btn => {
    btn.classList.add("resetting");
    setTimeout(() => { btn.classList.remove("selected", "resetting", "pulse"); }, 180);
  });
}

function resetChoices(){
  // איפוס הסימונים והבדג'ים
  resetChoiceBadges();
  
  // בדיקה אם יש פריטים בטבלת הבחירה
  const chooseGrid = document.getElementById("chooseGrid");
  if (!chooseGrid) return;
  
  // אם אין פריטים בטבלת הבחירה, הצע לטעון את הפריטים הבסיסיים
  if (chooseGrid.children.length === 0) {
    if (confirm("טבלת 'בחר פריטים' ריקה. האם לטעון את הפריטים הבסיסיים?")) {
      loadDefaultChooseItems();
    }
  } else {
    // אם יש פריטים, הצע לחזור לפריטים הבסיסיים
    if (confirm("האם לאפס את טבלת הבחירה ולחזור לפריטים הבסיסיים?")) {
      chooseGrid.innerHTML = "";
      loadDefaultChooseItems();
    }
  }
}

function clearList(){
  const listGrid = document.getElementById("listGrid");
  if (listGrid) listGrid.innerHTML = "";
  resetChoiceBadges(); // שינוי: לא לאפס את כל הטבלה, רק את המונים
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}

function clearChecked(){
  // הסרת הסימון מהפריטים (לא מחיקתם!)
  document.querySelectorAll("#listGrid .item.checked").forEach(el => {
    el.classList.remove("checked"); // הסרת הסימון בלבד
  });
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}
/* ====== Smart category detection ====== */
function detectCategory(itemName) {
  const name = itemName.toLowerCase().trim();
  
  // Category keywords mapping
  const categoryKeywords = {
    'פירות וירקות': [
      'גזר', 'מלפפון', 'עגבני', 'חסה', 'בצל', 'שום', 'תפוח', 'בננ', 'תפוז', 'לימון',
      'אבוקדו', 'פלפל', 'ברוקולי', 'כרובית', 'תירס', 'חציל', 'דלעת', 'תות', 'ענב',
      'אבטיח', 'מלון', 'ירק', 'פר', 'סלט', 'פטרוזיליה', 'כוסבר', 'נענע'
    ],
    'מוצרי חלב': [
      'חלב', 'גבינ', 'קוטג', 'יוגורט', 'שמנת', 'חמא', 'ביצ', 'לבן', 'צהוב', 'בולגרי',
      'שקד', 'סוי', 'אשל', 'תנובה', 'שטראוס', 'יטבתה'
    ],
    'מאפים ולחמים': [
      'לחם', 'חלה', 'לחמני', 'פית', 'טורטי', 'בייגל', 'קרואסון', 'עוגי', 'עוג',
      'בורקס', 'מאפ', 'כיכר', 'בגט'
    ],
    'בשר ועופות': [
      'עוף', 'שניצל', 'כרעי', 'חזה', 'בשר', 'אנטריקוט', 'סטייק', 'נקניק', 'קבב',
      'כבד', 'טחון', 'המבורגר', 'פרג'
    ],
    'דגים': [
      'סלמון', 'טונה', 'דניס', 'בורי', 'פילה דג', 'שרימפ', 'דג', 'קרפיון', 'אמנון'
    ],
    'מזווה ויבשים': [
      'אורז', 'פסטה', 'קוסקוס', 'בורגול', 'קמח', 'סוכר', 'מלח', 'שמן', 'קטשופ',
      'מיונז', 'חומוס', 'טחינ', 'ריב', 'דבש', 'שוקולד ממרח', 'קפה', 'תה', 'קקאו',
      'זית', 'שימור'
    ],
    'משקאות': [
      'מים', 'מיץ', 'קולה', 'פחית', 'בירה', 'יין', 'אלכוהול', 'סודה', 'וויסקי',
      'ליקר', 'בקבוק'
    ],
    'חטיפים וממתקים': [
      'שוקולד', 'ביסלי', 'במבה', 'דובונ', 'סוכרי', 'גלידה', 'פופקורן', 'חטיף',
      'אגוז', 'בוטנ', 'קשיו', 'שקד', 'צ\'יפס', 'ממתק', 'סניקרס', 'קיט קט'
    ],
    'מוצרי ניקיון': [
      'נייר טואלט', 'מגבות נייר', 'סבון כלים', 'אבקת כביסה', 'מרכך', 'אקונומיקה',
      'שקיות זבל', 'ספוג', 'מטלי', 'רצפה', 'ניקוי', 'חומר ניקוי', 'אקונומיקה'
    ],
    'מוצרי טיפוח': [
      'סבון רחצה', 'שמפו', 'מרכך שיער', 'משחת שיניים', 'מברשת שיניים', 'דאודורנט',
      'תער', 'קרם', 'טישו', 'טיפוח', 'ג\'ל', 'בושם', 'קולון'
    ],
    'מוצרי תינוק': [
      'חיתול', 'מזון תינוק', 'מטליות לחות', 'תינוק', 'תינוקות', 'תרמיל', 'פמפרס'
    ],
    'קפואים': [
      'קפוא', 'גלידה', 'ירקות קפוא', 'פיצה קפוא', 'שניצל קפוא', 'דגים קפוא'
    ]
  };
  
  // Check each category
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (name.includes(keyword)) {
        return category;
      }
    }
  }
  
  return null; // No category detected
}

// Global variable to store pending custom item data
let pendingCustomItem = null;

function addCustomItem(suggestedCategory = null){
  console.log('addCustomItem called with suggestedCategory:', suggestedCategory);
  const rawName = prompt("הכנס שם פריט חדש:");
  if (!rawName) return;
  const name = String(rawName).trim();
  const unit = String(prompt("הכנס יחידת מידה (למשל: ק\"ג, יח', ליטר):", "יח'") || "יח'").trim();
  
  // Detect category or use suggested one
  let targetCategory = suggestedCategory;
  console.log('targetCategory before detection:', targetCategory);
  if (!targetCategory) {
    targetCategory = detectCategory(name);
  }
  
  // If no category detected or suggested, ask user
  if (!targetCategory) {
    const categories = ['פירות וירקות', 'מוצרי חלב', 'מאפים ולחמים', 'בשר ועופות', 'דגים', 
                       'מזווה ייבשים', 'משקאות', 'חטיפים וממתקים', 'מוצרי ניקיון', 
                       'מוצרי טיפוח', 'מוצרי תינוק', 'קפואים', 'פריטים מותאמים אישית'];
    const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const choice = prompt(`לאיזו קטגוריה להוסיף את "${name}"?\n\n${categoryList}\n\nהכנס מספר (או אישור לקטגוריה מותאמת אישית):`, String(categories.length));
    if (!choice) return;
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < categories.length) {
      targetCategory = categories[index];
    } else {
      targetCategory = 'פריטים מותאמים אישית';
    }
  } else if (!suggestedCategory) {
    // Only confirm if category was auto-detected (not when user clicked + on specific category)
    const confirmMsg = window.confirm(`זיהינו שהפריט "${name}" שייך ל-"${targetCategory}". האם נכון?`);
    if (!confirmMsg) {
      const categories = ['פירות וירקות', 'מוצרי חלב', 'מאפים ולחמים', 'בשר ועופות', 'דגים', 
                         'מזווה ויבשים', 'משקאות', 'חטיפים וממתקים', 'מוצרי ניקיון', 
                         'מוצרי טיפוח', 'מוצרי תינוק', 'קפואים', 'פריטים מותאמים אישית'];
      const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');
      const choice = prompt(`לאיזו קטגוריה להוסיף את "${name}"?\n\n${categoryList}\n\nהכנס מספר:`, '1');
      if (!choice) return;
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < categories.length) {
        targetCategory = categories[index];
      } else {
        targetCategory = 'פריטים מותאמים אישית';
      }
    }
  }
  
  console.log('Final targetCategory:', targetCategory);
  
  // Store pending item data and open icon picker
  pendingCustomItem = { name, unit, category: targetCategory };
  openIconPickerForCustomItem();
}

// Open icon picker for custom item
function openIconPickerForCustomItem() {
  // Set up icon picker in custom item mode
  iconPickerMode = 'custom-item';
  iconPickerTarget = null;
  
  // Show icon picker modal
  const modal = document.getElementById('iconPickerModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// Finish adding custom item with selected icon
function finishAddingCustomItem(icon) {
  if (!pendingCustomItem) return;
  
  const { name, unit, category } = pendingCustomItem;
  console.log('Finishing custom item with icon:', icon, 'category:', category);
  
  // Add to list
  createListItem(name, icon, 1, unit);
  
  // Save to appropriate category
  const saved = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  if (!saved.some(it => String(it.name || "").trim().toLowerCase() === name.toLowerCase())) {
    const newItem = { name, icon, unit, category: category };
    console.log('Saving new item:', newItem);
    saved.push(newItem);
    localStorage.setItem('customChooseItems', JSON.stringify(saved));
    console.log('customChooseItems after save:', JSON.parse(localStorage.getItem('customChooseItems')));
  }
  
  // Reload choose items to show in correct category
  loadDefaultChooseItems();
  
  // Clear pending item
  pendingCustomItem = null;
  
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}

/* ====== רשימות קניה מוכנות ====== */
const presetLists = {
  "ארוחת בוקר": [
    { name: "חלב", icon: "🥛", unit: "ליטר" },
    { name: "לחם", icon: "🍞", unit: "יח'" },
    { name: "ביצים", icon: "🥚", unit: "יח'" },
    { name: "גבינה צהובה", icon: "🧀", unit: "אריזה" },
    { name: "חמאה", icon: "🧈", unit: "אריזה" },
    { name: "יוגורט", icon: "🥛", unit: "יח'" },
    { name: "בננה", icon: "🍌", unit: "ק\"ג" },
    { name: "קפה", icon: "☕", unit: "אריזה" }
  ],
  "ארוחת ערב": [
    { name: "עוף", icon: "🍗", unit: "ק\"ג" },
    { name: "בשר בקר", icon: "🥩", unit: "ק\"ג" },
    { name: "אורז", icon: "🍚", unit: "ק\"ג" },
    { name: "פסטה", icon: "🍝", unit: "אריזה" },
    { name: "עגבניות", icon: "🍅", unit: "ק\"ג" },
    { name: "בצל", icon: "🧅", unit: "ק\"ג" },
    { name: "שום", icon: "🧄", unit: "אריזה" },
    { name: "פלפל", icon: "🌶️", unit: "ק\"ג" }
  ],
  "פירות וירקות": [
    { name: "גזר", icon: "🥕", unit: "ק\"ג" },
    { name: "מלפפונים", icon: "🥒", unit: "ק\"ג" },
    { name: "עגבניות", icon: "🍅", unit: "ק\"ג" },
    { name: "חסה", icon: "🥬", unit: "יח'" },
    { name: "תפוחים", icon: "🍎", unit: "ק\"ג" },
    { name: "בננה", icon: "🍌", unit: "ק\"ג" },
    { name: "תפוזים", icon: "🍊", unit: "ק\"ג" },
    { name: "אבוקדו", icon: "🥑", unit: "יח'" }
  ],
  "ניקיון ובית": [
    { name: "נייר טואלט", icon: "🧻", unit: "אריזה" },
    { name: "סבון כלים", icon: "🧽", unit: "בקבוק" },
    { name: "מסיכות כביסה", icon: "🧴", unit: "אריזה" },
    { name: "אבקת כביסה", icon: "📦", unit: "אריזה" },
    { name: "מטליות", icon: "🧽", unit: "אריזה" },
    { name: "שקיות זבל", icon: "🗑️", unit: "אריזה" },
    { name: "מרכך כביסה", icon: "🧴", unit: "בקבוק" },
    { name: "סבון רחצה", icon: "🧼", unit: "יח'" }
  ],
  "חטיפים וממתקים": [
    { name: "שוקולד", icon: "🍫", unit: "יח'" },
    { name: "ביסקוויטים", icon: "🍪", unit: "אריזה" },
    { name: "פופקורן", icon: "🍿", unit: "אריזה" },
    { name: "גלידה", icon: "🍦", unit: "יח'" },
    { name: "ממתקים", icon: "🍬", unit: "שקית" },
    { name: "צ'יפס", icon: "🥔", unit: "שקית" },
    { name: "אגוזים", icon: "🥜", unit: "שקית" },
    { name: "פירות יבשים", icon: "🥭", unit: "שקית" }
  ],
  "בסיסי שבת": [
    { name: "יין", icon: "🍷", unit: "בקבוק" },
    { name: "נרות שבת", icon: "🕯️", unit: "אריזה" },
    { name: "חלה", icon: "🍞", unit: "יח'" },
    { name: "בשר", icon: "🥩", unit: "ק\"ג" },
    { name: "דגים", icon: "🐟", unit: "ק\"ג" },
    { name: "ירקות לסלט", icon: "🥗", unit: "יח'" },
    { name: "פירות", icon: "🍎", unit: "ק\"ג" },
    { name: "שמן זית", icon: "🫒", unit: "בקבוק" }
  ],
  "מוצרי תינוק": [
    { name: "חיתולים", icon: "👶", unit: "אריזה" },
    { name: "מזון תינוקות", icon: "🍼", unit: "יח'" },
    { name: "מטליות לחות", icon: "🧻", unit: "אריזה" },
    { name: "קרם לתינוק", icon: "🧴", unit: "יח'" },
    { name: "שמפו לתינוק", icon: "🧴", unit: "בקבוק" },
    { name: "אבקת כביסה לתינוק", icon: "📦", unit: "אריזה" },
    { name: "כוסות הזנה", icon: "🍼", unit: "יח'" }
  ],
  "ביקור חולים": [
    { name: "פירות", icon: "🍎", unit: "ק\"ג" },
    { name: "מיצים טבעיים", icon: "🧃", unit: "יח'" },
    { name: "עוגיות דיאטטיות", icon: "🍪", unit: "אריזה" },
    { name: "תה צמחים", icon: "🫖", unit: "אריזה" },
    { name: "דבש", icon: "🍯", unit: "צנצנת" },
    { name: "לימונים", icon: "🍋", unit: "ק\"ג" },
    { name: "ג'לי רויאל", icon: "🍯", unit: "יח'" }
  ],
  "קיץ וחופש": [
    { name: "מים מינרליים", icon: "💧", unit: "ליטר" },
    { name: "גלידה", icon: "🍦", unit: "יח'" },
    { name: "פופסיקל", icon: "🧊", unit: "אריזה" },
    { name: "אבטיח", icon: "🍉", unit: "יח'" },
    { name: "קרם הגנה", icon: "🧴", unit: "יח'" },
    { name: "כובעים", icon: "🧢", unit: "יח'" },
    { name: "משקאות קרים", icon: "🥤", unit: "יח'" },
    { name: "פירות יבשים", icon: "🥭", unit: "שקית" }
  ],
  "אירוח": [
    { name: "אורזים", icon: "🍚", unit: "ק\"ג" },
    { name: "נפקינים", icon: "🧻", unit: "אריזה" },
    { name: "כוסות חד-פעמיות", icon: "🥤", unit: "אריזה" },
    { name: "צלחות חד-פעמיות", icon: "🍽️", unit: "אריזה" },
    { name: "משקאות", icon: "🥤", unit: "יח'" },
    { name: "ממתקים", icon: "🍬", unit: "שקית" },
    { name: "פירות", icon: "🍎", unit: "ק\"ג" },
    { name: "גבינות", icon: "🧀", unit: "אריזה" }
  ]
};

// פונקציה לפתיחת modal עבור רשימות מוכנות
function openPresetListModal(listNames, allLists, customLists) {
  const modal = document.getElementById('presetListModal');
  const listEl = document.getElementById('presetListOptions');
  const closeBtn = document.getElementById('closePresetListModal');
  if (!modal || !listEl) return;
  
  // נקה תוכן קודם
  listEl.innerHTML = '';
  
  // צור אפשרות לכל רשימה
  listNames.forEach((name, idx) => {
    const li = document.createElement('li');
    const isCustom = customLists[name] ? ' (מותאם אישית)' : '';
    li.textContent = `${name} (${allLists[name].length} פריטים)${isCustom}`;
    li.tabIndex = 0;
    
    li.addEventListener('click', () => {
      modal.style.display = 'none';
      handlePresetListSelection(name, allLists[name], name);
    });
    
    listEl.appendChild(li);
  });
  
  // הוסף אפשרות לניהול רשימות מותאמות אישית אם יש כאלה
  const hasCustomLists = Object.keys(customLists).length > 0;
  if (hasCustomLists) {
    const li = document.createElement('li');
    li.textContent = '⚙️ נהל רשימות מותאמות אישית';
    li.style.backgroundColor = '#f0f0f0';
    li.style.borderTop = '1px solid #ddd';
    li.tabIndex = 0;
    
    li.addEventListener('click', () => {
      modal.style.display = 'none';
      manageCustomLists();
    });
    
    listEl.appendChild(li);
  }
  
  // סגירה
  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

// פונקציה לטיפול בבחירת רשימה מוכנה עם אופציית החלפה/הוספה
function handlePresetListSelection(selectedName, selectedList, displayName) {
  // בדיקה אם הרשימה הנוכחית ריקה או לא
  const currentItems = document.querySelectorAll("#listGrid .item").length;
  
  let actionChoice = '1'; // ברירת מחדל: החלפה
  
  if (currentItems > 0) {
    // יש פריטים קיימים - תן אופציה להחליף או להוסיף
    const userChoice = confirm(`יש כבר פריטים ברשימה שלי.\n\nלחץ "אישור" להחליף את הרשימה הקיימת\nלחץ "ביטול" להוסיף לרשימה הקיימת`);
    
    if (userChoice) {
      // החלפה - נקה את הרשימה
      clearList();
      actionChoice = '1';
    } else {
      // הוספה - השאר את הפריטים הקיימים
      actionChoice = '2';
    }
  }
  
  // הוסף את הפריטים מהרשימה המוכנה
  selectedList.forEach(item => {
    // בדוק אם הפריט כבר קיים ברשימה (רק אם מוסיפים)
    if (actionChoice === '2') {
      const existing = Array.from(document.querySelectorAll("#listGrid .item")).find(el => {
        const rawName = (el.querySelector(".name")?.textContent || "").trim();
        const nameParts = rawName.split(" ").map(p => p.trim()).filter(p => p !== "");
        const pureName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
        return pureName.toLowerCase() === item.name.toLowerCase();
      });
      
      if (existing) {
        // הגדל כמות במקום ליצור פריט חדש
        const qtyEl = existing.querySelector(".qty");
        if (qtyEl) {
          const qtyText = qtyEl.textContent || "1 יח'";
          const qtyParts = qtyText.split(" ");
          const currentQty = parseInt(qtyParts[0]) || 1;
          const unit = qtyParts.slice(1).join(" ") || "יח'";
          qtyEl.textContent = `${currentQty + 1} ${unit}`;
        }
        return; // דלג על יצירת פריט חדש - רק עבור הפריט הנוכחי
      }
    }
    
    // צור פריט חדש (אם לא קיים או אם החלפנו את הרשימה)
    createListItem(item.name, item.icon, 1, item.unit);
  });
  
  saveListToStorage();
  renderAllPrices();
  renderTotal();
  
  const actionText = actionChoice === '1' ? 'נטענה' : 'נוספה לרשימה';
  alert(`רשימת "${displayName}" ${actionText} בהצלחה עם ${selectedList.length} פריטים!`);
}

function loadPresetList() {
  // טעינת רשימות מותאמות אישית
  const customLists = JSON.parse(localStorage.getItem('customPresetLists') || '{}');
  const allLists = { ...presetLists, ...customLists };
  
  // יצירת רשימת האפשרויות
  const listNames = Object.keys(allLists);
  if (listNames.length === 0) {
    alert('אין רשימות מוכנות זמינות.');
    return;
  }
  
  // פתיחת modal במקום prompt
  openPresetListModal(listNames, allLists, customLists);
}

function manageCustomLists() {
  const customLists = JSON.parse(localStorage.getItem('customPresetLists') || '{}');
  const customListNames = Object.keys(customLists);
  
  if (customListNames.length === 0) {
    alert('אין רשימות מותאמות אישית זמינות.');
    return;
  }
  
  let optionsText = "נהל רשימות מותאמות אישית:\n\n";
  customListNames.forEach((name, index) => {
    optionsText += `${index + 1}. ${name} (${customLists[name].length} פריטים)\n`;
  });
  optionsText += "\nהכנס מספר הרשימה למחיקה או 'ביטול' לחזרה:";
  
  const choice = prompt(optionsText);
  
  if (!choice || choice.trim().toLowerCase() === 'ביטול') return;
  
  const choiceNum = parseInt(choice.trim());
  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > customListNames.length) {
    alert('מספר לא תקין.');
    return;
  }
  
  const listToDelete = customListNames[choiceNum - 1];
  
  if (confirm(`האם למחוק את הרשימה "${listToDelete}"? פעולה זו לא ניתנת לביטול.`)) {
    delete customLists[listToDelete];
    localStorage.setItem('customPresetLists', JSON.stringify(customLists));
    alert(`רשימת "${listToDelete}" נמחקה בהצלחה.`);
  }
}

function saveCurrentListAsPreset() {
  const listGrid = document.getElementById("listGrid");
  const currentItems = [];
  
  // אסוף את כל הפריטים מהרשימה הנוכחית
  document.querySelectorAll("#listGrid .item").forEach(el => {
    const rawName = (el.querySelector(".name")?.textContent || "").trim();
    const nameParts = rawName.split(" ").map(p => p.trim()).filter(p => p !== "");
    const icon = nameParts.length > 0 ? nameParts[0] : "🛒";
    const pureName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    
    const rawQty = (el.querySelector(".qty")?.textContent || "").trim();
    const qtyParts = rawQty.split(" ").map(p => p.trim()).filter(p => p !== "");
    const unit = qtyParts.length > 1 ? qtyParts.slice(1).join(" ") : "יח'";
    
    if (pureName) {
      currentItems.push({ name: pureName, icon, unit });
    }
  });
  
  if (currentItems.length === 0) {
    alert('הרשימה הנוכחית ריקה. אין מה לשמור.');
    return;
  }
  
  const listName = prompt(`הכנס שם לרשימה המוכנה החדשה:\n(הרשימה כוללת ${currentItems.length} פריטים)`);
  
  if (!listName || !listName.trim()) {
    return;
  }
  
  const cleanName = listName.trim();
  
  // טען רשימות מותאמות אישית קיימות
  const customLists = JSON.parse(localStorage.getItem('customPresetLists') || '{}');
  
  // בדוק אם השם כבר קיים
  if (customLists[cleanName] || presetLists[cleanName]) {
    if (!confirm(`רשימה בשם "${cleanName}" כבר קיימת. האם להחליף אותה?`)) {
      return;
    }
  }
  
  // שמור את הרשימה החדשה
  customLists[cleanName] = currentItems;
  localStorage.setItem('customPresetLists', JSON.stringify(customLists));
  
  alert(`רשימת "${cleanName}" נשמרה בהצלחה עם ${currentItems.length} פריטים!`);
}

// פונקציה לפתיחת modal עם אופציות החלפה/הוספה
function openChooseListModal(listNames, allLists, customLists) {
  const modal = document.getElementById('chooseListModal');
  const listEl = document.getElementById('chooseListOptions');
  const closeBtn = document.getElementById('closeChooseListModal');
  if (!modal || !listEl) return;
  
  // נקה תוכן קודם
  listEl.innerHTML = '';
  
  // צור אפשרות לכל רשימה
  listNames.forEach((name, idx) => {
    const li = document.createElement('li');
    const isCustom = customLists[name] ? ' (מותאם אישית)' : '';
    li.textContent = `${name} (${allLists[name].length} פריטים)${isCustom}`;
    li.tabIndex = 0;
    
    li.addEventListener('click', () => {
      modal.style.display = 'none';
      handleChooseListSelection(name, allLists[name], name);
    });
    
    listEl.appendChild(li);
  });
  
  // סגירה
  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

// פונקציה לטיפול בבחירת רשימה עם אופציית החלפה/הוספה
function handleChooseListSelection(selectedName, selectedList, displayName) {
  // בדיקה אם יש פריטים בטבלת הבחירה
  const chooseGrid = document.getElementById('chooseGrid');
  const hasExistingItems = chooseGrid && chooseGrid.children.length > 0;
  
  let actionChoice = '1'; // ברירת מחדל: החלפה
  
  if (hasExistingItems) {
    // יש פריטים קיימים - תן אופציה להחליף או להוסיף
    const userChoice = confirm(`יש כבר פריטים בטבלת הבחירה.\n\nלחץ "אישור" להחליף את הפריטים הקיימים\nלחץ "ביטול" להוסיף לפריטים הקיימים`);
    
    if (userChoice) {
      // החלפה - נקה את הטבלה
      chooseGrid.innerHTML = '';
      actionChoice = '1';
    } else {
      // הוספה - השאר את הפריטים הקיימים
      actionChoice = '2';
    }
  }
  
  // הוסף את הפריטים לטבלת הבחירה
  selectedList.forEach(item => {
    if (chooseGrid) {
      chooseGrid.appendChild(makeChooseButton(item));
    }
  });
  
  const actionText = actionChoice === '1' ? 'נטענו' : 'נוספו';
  alert(`פריטי רשימת "${displayName}" ${actionText} בהצלחה לטבלת הבחירה!`);
}

/* ====== init ====== */
document.addEventListener("DOMContentLoaded", () => {
  loadDefaultChooseItems();
  // Check for ?list= param in URL
  const params = new URLSearchParams(window.location.search);
  const sharedList = params.get('list');
  if (sharedList && sharedList.trim() !== '') {
    try {
      localStorage.setItem("shoppingList", decodeURIComponent(sharedList));
      alert("הרשימה שותפה בהצלחה!");
      // Remove the list parameter from URL after loading
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) { alert("קישור הרשימה לא תקין."); }
  }
  loadListFromStorage();

  // Open choose modal button
  document.getElementById("btnOpenChooseModal")?.addEventListener("click", openChooseModal);

  // Removed: btnHdrResetChoices and btnHdrAddCustom - no longer needed with + buttons in categories
  // header 'רשימות' button and old clear/save buttons removed; footer will handle actions

  document.getElementById("btnSaveCategories")?.addEventListener("click", () => {
    localStorage.setItem("categoriesOrder", JSON.stringify(categoriesOrder));
    alert("✅ סדר הקטגוריות נשמר!");
    sortListByCategories();
  });

  document.getElementById("btnAddCategory")?.addEventListener("click", () => {
    const newCat = prompt("הכנס שם קטגוריה חדשה:");
    if (!newCat) return;
    if (categoriesOrder.includes(newCat)) { alert("⚠️ קטגוריה זו כבר קיימת!"); return; }
    categoriesOrder.push(newCat); categories[newCat] = [];
    localStorage.setItem("categoriesOrder", JSON.stringify(categoriesOrder));
    localStorage.setItem("categoriesMap", JSON.stringify(categories));
    renderCategoriesList(); sortListByCategories();
  });

  document.getElementById("btnAssignItem")?.addEventListener("click", () => {
    if (categoriesOrder.length === 0) { alert("אין קטגוריות זמינות. צור קטגוריה חדשה קודם."); return; }
    const itemName = prompt("הכנס שם פריט לשיוך:");
    if (!itemName) return;
    const category = prompt("לאיזו קטגוריה לשייך את הפריט?\n" + categoriesOrder.join(", "));
    if (!category || !categoriesOrder.includes(category)) { alert("⚠️ קטגוריה לא קיימת!"); return; }
    if (!categories[category]) categories[category] = [];
    if (!categories[category].includes(itemName)) categories[category].push(itemName);
    localStorage.setItem("categoriesMap", JSON.stringify(categories));
    sortListByCategories();
  });

  document.getElementById("btnCategoriesSettings")?.addEventListener("click", () => {
    const settingsSection = document.getElementById("settingsSection");
    if (!settingsSection) return;
    settingsSection.style.display = settingsSection.style.display === "block" ? "none" : "block";
    if (settingsSection.style.display === "block") {
      settingsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      renderCategoriesList();
    }
  });

  document.getElementById("closeSettings")?.addEventListener("click", () => {
    document.getElementById("settingsSection").style.display = "none";
  });
  document.getElementById("btnCloseCategories")?.addEventListener("click", () => {
    const section = document.getElementById("settingsSection");
    if (!section) return;
    section.style.display = "none";
    document.querySelector('.app-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Helper function to close main menu
  function closeMainMenu() {
    const menu = document.getElementById('menuDropdown');
    if (menu) menu.style.display = 'none';
  }

  document.getElementById("menuButton")?.addEventListener("click", () => {
    const menu = document.getElementById("menuDropdown");
    if (!menu) return;
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  
  // Close button inside menu
  document.querySelector('#menuDropdown .dropdown-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMainMenu();
  });
  
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu-container")) {
      closeMainMenu();
    }
  });

  // Close dropdowns on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMainMenu();
    }
  });

  // Auto-close menu after actions - view mode
  document.getElementById('btnViewMode')?.addEventListener('click', () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("viewMode", document.body.classList.contains("dark-mode") ? "dark" : "light");
    if (document.body.classList.contains('dark-mode')) {
      document.querySelectorAll('#chooseSection, #settingsSection, #categoriesList, .choose-item, .list-footer').forEach(el => {
        if (el && !el.classList.contains('panel')) el.classList.add('panel');
      });
    }
    closeMainMenu();
  });

  // Font controls
  document.getElementById("btnFontIncrease")?.addEventListener("click", () => {
    rootFontPx = Math.min(rootFontPx + 1, 30);
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
    closeMainMenu();
  });
  
  document.getElementById("btnFontDecrease")?.addEventListener("click", () => {
    rootFontPx = Math.max(rootFontPx - 1, 12);
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
    closeMainMenu();
  });
  
  document.getElementById("btnFontReset")?.addEventListener("click", () => {
    rootFontPx = 19;
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
    closeMainMenu();
  });

  // Categories settings
  document.getElementById('btnCategoriesSettings')?.addEventListener('click', () => {
    closeMainMenu();
  });

  /* store UI wiring */
  document.getElementById('networkSelect')?.addEventListener('change', (e) => populateBranches(e.target.value));
  document.getElementById('btnSaveStore')?.addEventListener('click', () => {
    saveStoreSelection();
    closeMainMenu();
  });
  document.getElementById('togglePrices')?.addEventListener('change', (e) => {
    togglePriceDisplay(e.target.checked);
    closeMainMenu();
  });

  /* init store UI */
  (function initStoreUI(){
    const selNet = localStorage.getItem('selectedNetwork') || '';
    const selBranch = localStorage.getItem('selectedBranch') || '';
    if (selNet) {
      const netEl = document.getElementById('networkSelect');
      if (netEl) netEl.value = selNet;
      populateBranches(selNet);
      const brEl = document.getElementById('branchSelect');
      if (brEl && selBranch) brEl.value = selBranch;
    }
    const show = localStorage.getItem('showPrices') === '1';
    const toggle = document.getElementById('togglePrices');
    if (toggle) toggle.checked = show;
    renderAllPrices();
    renderTotal();
  })();

  /* ====== category toggle integration (mobile + desktop) ====== */
  const toggleBtn = document.querySelector('.btn-toggle-categories') || document.getElementById('btnCategoriesSettings');
  const settings = document.getElementById('settingsSection');
  const categoriesList = document.getElementById('categoriesList');

  function toggleCategories(open) {
    const isOpen = open === undefined ? !(settings?.classList.contains('open') || categoriesList?.classList.contains('open')) : !!open;
    if (settings) settings.classList.toggle('open', isOpen);
    if (categoriesList) categoriesList.classList.toggle('open', isOpen);
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(isOpen));
  }

  if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCategories(); });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.categories-container') && !e.target.closest('.btn-toggle-categories') && !e.target.closest('#btnCategoriesSettings')) {
      toggleCategories(false);
    }
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCategories(); }
    });
  }

  // Ensure panels get panel class in dark mode
  if (document.body.classList.contains('dark-mode')) {
    document.querySelectorAll('#chooseSection, #settingsSection, #categoriesList, .choose-item, .list-footer').forEach(el => {
      if (el && !el.classList.contains('panel')) el.classList.add('panel');
    });
  }

  // ===== List Menu (next to "הרשימה שלי") =====
  function closeListMenu() {
    const menu = document.getElementById('listMenuDropdown');
    if (menu) menu.style.display = 'none';
  }

  document.getElementById("listMenuButton")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("listMenuDropdown");
    if (!menu) return;
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  
  // Close button inside list menu
  document.querySelector('#listMenuDropdown .dropdown-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeListMenu();
  });
  
  // Close list menu on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".list-header") && !e.target.closest("#listMenuDropdown")) {
      closeListMenu();
    }
  });

  // List menu actions
  document.getElementById('btnListSave')?.addEventListener('click', () => {
    if (typeof saveCurrentListAsPreset === 'function') saveCurrentListAsPreset();
    closeListMenu();
  });
  
  document.getElementById('btnListClear')?.addEventListener('click', () => {
    if (confirm('האם למחוק את כל הרשימה?')) clearList();
    closeListMenu();
  });
  
  document.getElementById('btnListClearChecked')?.addEventListener('click', () => {
    clearChecked();
    closeListMenu();
  });
  
  document.getElementById('btnListShare')?.addEventListener('click', () => {
    shareCurrentList();
    closeListMenu();
  });
  
  document.getElementById('btnListShareWA')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { alert("הרשימה ריקה."); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank');
    closeListMenu();
  });
  
  document.getElementById('btnListShareSMS')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { alert("הרשימה ריקה."); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const smsUrl = `sms:?body=${encodeURIComponent(url)}`;
    window.open(smsUrl, '_blank');
    closeListMenu();
  });

  // Initial UI render calls if functions exist
  if (typeof renderAllPrices === 'function') renderAllPrices();
  if (typeof renderTotal === 'function') renderTotal();

  // ===== Menu actions wiring =====
  document.getElementById('btnFooterSave')?.addEventListener('click', () => {
    if (typeof saveCurrentListAsPreset === 'function') saveCurrentListAsPreset();
    closeMainMenu();
  });
  
  document.getElementById('btnFooterClear')?.addEventListener('click', () => {
    if (confirm('האם למחוק את כל הרשימה?')) clearList();
    closeMainMenu();
  });
  
  document.getElementById('btnFooterClearChecked')?.addEventListener('click', () => {
    clearChecked();
    closeMainMenu();
  });
  
  document.getElementById('btnFooterShare')?.addEventListener('click', () => {
    shareCurrentList();
    closeMainMenu();
  });
  
  document.getElementById('btnFooterShareWA')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { alert("הרשימה ריקה."); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank');
    closeMainMenu();
  });
  
  document.getElementById('btnFooterShareSMS')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { alert("הרשימה ריקה."); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const smsUrl = `sms:?body=${encodeURIComponent(url)}`;
    window.open(smsUrl, '_blank');
    closeMainMenu();
  });
});

// ===== Share current list (Web Share API + clipboard fallback) =====
async function shareCurrentList() {
  // Get current list as JSON
  const data = localStorage.getItem("shoppingList") || "";
  if (!data) { alert("הרשימה ריקה."); return; }
  // Encode as URI component
  const encoded = encodeURIComponent(data);
  const url = `${location.origin}${location.pathname}?list=${encoded}`;

  // Try Web Share API
  try {
    if (navigator.share) {
      await navigator.share({ title: 'רשימת קניות', url });
      return;
    }
  } catch (e) {}

  // Fallback: copy link to clipboard
  try {
    await navigator.clipboard.writeText(url);
    alert('קישור הרשימה הועתק ללוח! אפשר לשלוח אותו לכל אחד.');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); alert('הקישור הועתק ללוח!'); }
    catch { alert(url); }
    document.body.removeChild(ta);
  }
}

/* ====== Context Menu for List Items (Long Press) ====== */
let longPressTimer = null;
let longPressTarget = null;
const contextMenu = document.getElementById('itemContextMenu');

// Multi-selection mode variables
let selectionMode = false;
let selectedItems = new Set();

// Prevent default context menu on list items and choose items
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.item') || e.target.closest('.choose-item')) {
    e.preventDefault();
    return false;
  }
});

// Prevent text selection during long press
document.addEventListener('selectstart', (e) => {
  if (longPressTimer && (e.target.closest('.item') || e.target.closest('.choose-item'))) {
    e.preventDefault();
    return false;
  }
});

// Add long press listeners to all list items
function attachLongPressToItem(itemElement) {
  let startX, startY;
  const longPressDuration = 500; // 500ms for long press

  itemElement.addEventListener('touchstart', (e) => {
    // Ignore if touching price, qty, or note input
    if (e.target.closest('.price') || e.target.closest('.qty') || e.target.closest('.item-note')) return;
    
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    longPressTarget = itemElement;
    
    longPressTimer = setTimeout(() => {
      showContextMenu(touch.clientX, touch.clientY, itemElement);
    }, longPressDuration);
  });

  itemElement.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - startX);
    const moveY = Math.abs(touch.clientY - startY);
    
    // Cancel long press if finger moves too much
    if (moveX > 10 || moveY > 10) {
      clearTimeout(longPressTimer);
    }
  });

  itemElement.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  itemElement.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
  });
}

// Show context menu at position
function showContextMenu(x, y, itemElement) {
  longPressTarget = itemElement;
  
  // Always show context menu for list items
  showRegularContextMenu(x, y, itemElement);
}

// Show regular context menu (for single item actions)
function showRegularContextMenu(x, y, itemElement) {
  // Position menu far from the touch point to avoid accidental clicks
  const menuWidth = 150;
  const menuHeight = 200; // Increased for new button
  const offset = 80; // Larger distance from touch point
  
  // Try to position menu to the right and above the touch point
  let left = x + offset;
  let top = y - menuHeight - offset;
  
  // If menu goes off right edge, position to the left
  if (left + menuWidth > window.innerWidth - 10) {
    left = x - menuWidth - offset;
  }
  
  // If menu goes off left edge, center it horizontally
  if (left < 10) {
    left = Math.max(10, (window.innerWidth - menuWidth) / 2);
  }
  
  // If menu goes off top edge, position below touch point
  if (top < 10) {
    top = y + offset;
  }
  
  // If menu goes off bottom edge, position above
  if (top + menuHeight > window.innerHeight - 10) {
    top = y - menuHeight - offset;
  }
  
  // Final bounds check
  top = Math.max(10, Math.min(top, window.innerHeight - menuHeight - 10));
  left = Math.max(10, Math.min(left, window.innerWidth - menuWidth - 10));
  
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
  
  // Add highlight to selected item
  itemElement.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
  
  // Disable pointer events briefly to prevent accidental clicks when releasing finger
  contextMenu.style.pointerEvents = 'none';
  setTimeout(() => {
    contextMenu.style.display = 'block';
    contextMenu.style.pointerEvents = 'auto';
  }, 150);
}

// Hide context menu
function hideContextMenu() {
  contextMenu.style.display = 'none';
  if (longPressTarget) {
    longPressTarget.style.backgroundColor = '';
    longPressTarget = null;
  }
}

/* ====== Multi-Selection Mode ====== */
function enterSelectionMode(firstItem) {
  if (selectionMode) return; // Already in selection mode
  
  selectionMode = true;
  selectedItems.clear();
  
  // Add selection toolbar to page
  createSelectionToolbar();
  
  // Add selection class to all items and attach selection click handler
  const allItems = document.querySelectorAll('#listGrid .item');
  allItems.forEach(item => {
    item.classList.add('selection-mode-item');
    item.dataset.selectionMode = 'active'; // Flag to prevent normal click behavior
  });
  
  // Select the first item
  if (firstItem) {
    selectedItems.add(firstItem);
    firstItem.classList.add('selected-for-action');
  }
  
  // Add global click handler for selection mode
  document.addEventListener('click', handleSelectionClick);
  
  updateSelectionToolbar();
}

function handleSelectionClick(e) {
  if (!selectionMode) return;
  
  const item = e.target.closest('#listGrid .item');
  if (!item) return;
  
  // Ignore clicks on interactive elements
  if (e.target.closest('.price') || e.target.closest('.qty') || e.target.closest('.item-note')) {
    return;
  }
  
  e.preventDefault();
  e.stopPropagation();
  
  toggleItemSelection(item);
}

function toggleItemSelection(item) {
  if (selectedItems.has(item)) {
    selectedItems.delete(item);
    item.classList.remove('selected-for-action');
  } else {
    selectedItems.add(item);
    item.classList.add('selected-for-action');
  }
  updateSelectionToolbar();
}

function selectAllItems() {
  const allItems = document.querySelectorAll('#listGrid .item');
  selectedItems.clear();
  allItems.forEach(item => {
    selectedItems.add(item);
    item.classList.add('selected-for-action');
  });
  updateSelectionToolbar();
}

function deselectAllItems() {
  selectedItems.forEach(item => {
    item.classList.remove('selected-for-action');
  });
  selectedItems.clear();
  updateSelectionToolbar();
}

function exitSelectionMode() {
  selectionMode = false;
  
  // Remove selection classes and flags
  const allItems = document.querySelectorAll('#listGrid .item');
  allItems.forEach(item => {
    item.classList.remove('selection-mode-item', 'selected-for-action');
    delete item.dataset.selectionMode;
  });
  
  selectedItems.clear();
  
  // Hide toolbar
  const toolbar = document.getElementById('selectionToolbar');
  if (toolbar) toolbar.style.display = 'none';
  
  // Remove global selection click handler
  document.removeEventListener('click', handleSelectionClick);
}

function createSelectionToolbar() {
  const toolbar = document.getElementById('selectionToolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
  }
  
  // Add event listeners if not already added
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  const btnCancelSelection = document.getElementById('btnCancelSelection');
  
  if (btnSelectAll && !btnSelectAll.dataset.listenerAdded) {
    btnSelectAll.addEventListener('click', selectAllItems);
    btnSelectAll.dataset.listenerAdded = 'true';
  }
  
  if (btnDeselectAll && !btnDeselectAll.dataset.listenerAdded) {
    btnDeselectAll.addEventListener('click', deselectAllItems);
    btnDeselectAll.dataset.listenerAdded = 'true';
  }
  
  if (btnDeleteSelected && !btnDeleteSelected.dataset.listenerAdded) {
    btnDeleteSelected.addEventListener('click', deleteSelectedItems);
    btnDeleteSelected.dataset.listenerAdded = 'true';
  }
  
  if (btnCancelSelection && !btnCancelSelection.dataset.listenerAdded) {
    btnCancelSelection.addEventListener('click', exitSelectionMode);
    btnCancelSelection.dataset.listenerAdded = 'true';
  }
}

function updateSelectionToolbar() {
  const countSpan = document.getElementById('selectedCount');
  if (countSpan) {
    countSpan.textContent = selectedItems.size;
  }
  
  const deleteBtn = document.getElementById('btnDeleteSelected');
  if (deleteBtn) {
    deleteBtn.disabled = selectedItems.size === 0;
  }
}

function deleteSelectedItems() {
  if (selectedItems.size === 0) return;
  
  const count = selectedItems.size;
  if (confirm(`האם למחוק ${count} פריטים נבחרים?`)) {
    selectedItems.forEach(item => {
      item.remove();
    });
    saveListToStorage();
    exitSelectionMode();
    renderAllPrices();
    renderTotal();
  }
}

// Context menu button handlers
document.getElementById('contextEdit').addEventListener('click', () => {
  if (!longPressTarget) return;
  
  const nameSpan = longPressTarget.querySelector('.name');
  if (!nameSpan) return;
  
  const currentText = nameSpan.textContent.trim();
  // Remove emoji icon if exists
  const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '');
  
  const newName = prompt('ערוך שם הפריט:', textWithoutIcon);
  if (newName && newName.trim() !== '') {
    // Keep the icon, update the name
    const icon = currentText.match(/^[\u{1F300}-\u{1F9FF}]/u)?.[0] || '🛒';
    nameSpan.textContent = `${icon} ${newName.trim()}`;
    saveListToStorage();
  }
  
  hideContextMenu();
});

document.getElementById('contextDelete').addEventListener('click', () => {
  if (!longPressTarget) return;
  
  const nameSpan = longPressTarget.querySelector('.name');
  const itemName = nameSpan ? nameSpan.textContent.trim() : 'פריט זה';
  
  if (confirm(`האם למחוק את "${itemName}"?`)) {
    longPressTarget.remove();
    saveListToStorage();
  }
  
  hideContextMenu();
});

document.getElementById('contextIcon').addEventListener('click', () => {
  if (!longPressTarget) return;
  hideContextMenu();
  
  // Open icon picker in 'list-item' mode
  iconPickerMode = 'list-item';
  iconPickerTargetItem = longPressTarget;
  
  const modal = document.getElementById('iconPickerModal');
  if (modal) {
    modal.style.display = 'block';
    const searchInput = document.getElementById('iconSearch');
    if (searchInput) searchInput.value = '';
    filterIcons('');
  }
});

document.getElementById('contextSelect').addEventListener('click', () => {
  hideContextMenu();
  enterSelectionMode(longPressTarget);
});

document.getElementById('contextCancel').addEventListener('click', () => {
  hideContextMenu();
});

// Close context menu on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#itemContextMenu') && contextMenu.style.display === 'block') {
    hideContextMenu();
  }
});

// Close context menu on scroll
document.addEventListener('scroll', () => {
  if (contextMenu.style.display === 'block') {
    hideContextMenu();
  }
});

/* ====== Long Press for Choose Items (Edit/Delete from menu) ====== */
let longPressChooseItem = null;

function attachLongPressToChooseItem(chooseItemElement, itemData) {
  let startX, startY;
  const longPressDuration = 500;

  chooseItemElement.addEventListener('touchstart', (e) => {
    // Don't trigger if touching the badge
    if (e.target.closest('.badge')) return;
    
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    longPressChooseItem = { element: chooseItemElement, data: itemData };
    
    longPressTimer = setTimeout(() => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenuForChooseItem(touch.clientX, touch.clientY, chooseItemElement, itemData);
    }, longPressDuration);
  });

  chooseItemElement.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - startX);
    const moveY = Math.abs(touch.clientY - startY);
    
    if (moveX > 10 || moveY > 10) {
      clearTimeout(longPressTimer);
    }
  });

  chooseItemElement.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  chooseItemElement.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
  });
}

function showContextMenuForChooseItem(x, y, element, itemData) {
  longPressChooseItem = { element, data: itemData };
  
  // Position menu far from the touch point to avoid accidental clicks
  const menuWidth = 150;
  const menuHeight = 150;
  const offset = 80; // Larger distance from touch point
  
  // Try to position menu to the right and above the touch point
  let left = x + offset;
  let top = y - menuHeight - offset;
  
  // If menu goes off right edge, position to the left
  if (left + menuWidth > window.innerWidth - 10) {
    left = x - menuWidth - offset;
  }
  
  // If menu goes off left edge, center it horizontally
  if (left < 10) {
    left = Math.max(10, (window.innerWidth - menuWidth) / 2);
  }
  
  // If menu goes off top edge, position below touch point
  if (top < 10) {
    top = y + offset;
  }
  
  // If menu goes off bottom edge, position above
  if (top + menuHeight > window.innerHeight - 10) {
    top = y - menuHeight - offset;
  }
  
  // Final bounds check
  top = Math.max(10, Math.min(top, window.innerHeight - menuHeight - 10));
  left = Math.max(10, Math.min(left, window.innerWidth - menuWidth - 10));
  
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
  
  element.style.backgroundColor = 'rgba(33, 150, 243, 0.15)';
  element.style.transform = 'scale(1.02)';
  
  // Disable pointer events briefly to prevent accidental clicks when releasing finger
  contextMenu.style.pointerEvents = 'none';
  setTimeout(() => {
    contextMenu.style.display = 'block';
    contextMenu.style.pointerEvents = 'auto';
  }, 150);
}

// Update the context menu handlers to work with both list items and choose items
const originalEditHandler = document.getElementById('contextEdit').onclick;
const originalDeleteHandler = document.getElementById('contextDelete').onclick;

document.getElementById('contextEdit').onclick = null;
document.getElementById('contextDelete').onclick = null;

document.getElementById('contextEdit').addEventListener('click', () => {
  // Handle choose item edit
  if (longPressChooseItem) {
    const { element, data } = longPressChooseItem;
    const currentText = element.textContent.trim().replace(/\d+$/, '').trim(); // Remove badge number
    const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '');
    
    const newName = prompt('ערוך שם הפריט:', textWithoutIcon);
    if (newName && newName.trim() !== '') {
      // Update the element
      data.name = newName.trim();
      const badge = element.querySelector('.badge');
      const badgeHTML = badge ? badge.outerHTML : '';
      element.innerHTML = `${data.icon} ${data.name}`;
      if (badge) element.appendChild(badge);
      
      // Save to localStorage
      saveChooseItemsToStorage();
    }
    
    longPressChooseItem.element.style.backgroundColor = '';
    longPressChooseItem.element.style.transform = '';
    longPressChooseItem = null;
    hideContextMenu();
    return;
  }
  
  // Handle list item edit (original logic)
  if (!longPressTarget) return;
  
  const nameSpan = longPressTarget.querySelector('.name');
  if (!nameSpan) return;
  
  const currentText = nameSpan.textContent.trim();
  const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '');
  
  const newName = prompt('ערוך שם הפריט:', textWithoutIcon);
  if (newName && newName.trim() !== '') {
    const icon = currentText.match(/^[\u{1F300}-\u{1F9FF}]/u)?.[0] || '🛒';
    nameSpan.textContent = `${icon} ${newName.trim()}`;
    saveListToStorage();
  }
  
  hideContextMenu();
});

document.getElementById('contextDelete').addEventListener('click', () => {
  // Handle choose item delete
  if (longPressChooseItem) {
    const { element, data } = longPressChooseItem;
    const itemName = `${data.icon} ${data.name}`;
    
    if (confirm(`האם למחוק את "${itemName}" מתפריט הבחירה?`)) {
      element.remove();
      saveChooseItemsToStorage();
    }
    
    longPressChooseItem.element.style.backgroundColor = '';
    longPressChooseItem.element.style.transform = '';
    longPressChooseItem = null;
    hideContextMenu();
    return;
  }
  
  // Handle list item delete (original logic)
  if (!longPressTarget) return;
  
  const nameSpan = longPressTarget.querySelector('.name');
  const itemName = nameSpan ? nameSpan.textContent.trim() : 'פריט זה';
  
  if (confirm(`האם למחוק את "${itemName}"?`)) {
    longPressTarget.remove();
    saveListToStorage();
  }
  
  hideContextMenu();
});

// Update hideContextMenu to handle both types
const originalHideContextMenu = hideContextMenu;
hideContextMenu = function() {
  originalHideContextMenu();
  if (longPressChooseItem) {
    longPressChooseItem.element.style.backgroundColor = '';
    longPressChooseItem.element.style.transform = '';
    longPressChooseItem = null;
  }
};

// Helper function to save choose items to localStorage
function saveChooseItemsToStorage() {
  const chooseGrid = document.getElementById('chooseGrid');
  const items = Array.from(chooseGrid.querySelectorAll('.choose-item')).map(btn => {
    const text = btn.textContent.trim().replace(/\d+$/, '').trim(); // Remove badge number
    const iconMatch = text.match(/^([\u{1F300}-\u{1F9FF}])\s*(.+)/u);
    if (iconMatch) {
      return {
        icon: iconMatch[1],
        name: iconMatch[2],
        unit: 'יח\''
      };
    }
    return {
      icon: '🛒',
      name: text,
      unit: 'יח\''
    };
  });
  
  localStorage.setItem('chooseItems', JSON.stringify(items));
}

/* ====== Inline Add Item Functionality ====== */
// Add item to choose menu
const addItemChooseInput = document.getElementById('addItemChooseInput');
if (addItemChooseInput) {
  addItemChooseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addItemChooseInput.value.trim() !== '') {
      const itemName = addItemChooseInput.value.trim();
      const newItem = {
        name: itemName,
        icon: '🛒',
        unit: 'יח\''
      };
      
      // Add to choose grid
      const chooseGrid = document.getElementById('chooseGrid');
      const newBtn = makeChooseButton(newItem);
      chooseGrid.appendChild(newBtn);
      
      // Save to storage
      saveChooseItemsToStorage();
      
      // Clear input
      addItemChooseInput.value = '';
      addItemChooseInput.blur();
      
      // Show feedback
      newBtn.classList.add('pulse');
      setTimeout(() => newBtn.classList.remove('pulse'), 420);
    }
  });
  
  // Also allow blur to add (optional)
  addItemChooseInput.addEventListener('blur', () => {
    if (addItemChooseInput.value.trim() !== '') {
      // Trigger enter
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      addItemChooseInput.dispatchEvent(event);
    }
  });
}

// Add item to list
const addItemListInput = document.getElementById('addItemListInput');
if (addItemListInput) {
  addItemListInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addItemListInput.value.trim() !== '') {
      const itemName = addItemListInput.value.trim();
      
      // Add to list
      createListItem(itemName, '🛒', 1, 'יח\'');
      
      // Clear input
      addItemListInput.value = '';
      addItemListInput.blur();
      
      // Scroll to see the new item
      const listGrid = document.getElementById('listGrid');
      setTimeout(() => {
        listGrid.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  });
  
  // Also allow blur to add (optional)
  addItemListInput.addEventListener('blur', () => {
    if (addItemListInput.value.trim() !== '') {
      // Trigger enter
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      addItemListInput.dispatchEvent(event);
    }
  });
}

/* ====== Icon Picker Functionality ====== */
// Comprehensive icon list organized by categories
const iconCategories = {
  'פירות': ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝'],
  'ירקות': ['🥕', '🌽', '🥒', '🥬', '🥦', '🍅', '🧄', '🧅', '🫑', '🌶️', '🥔', '🍆', '🥗'],
  'לחם ומאפים': ['🍞', '🥖', '🥐', '🥯', '🧇', '🥞', '🍰', '🎂', '🧁', '🥧', '🍪', '🍩'],
  'בשר ודגים': ['🥩', '🍖', '🍗', '🥓', '🍤', '🦐', '🦞', '🦀', '🐟', '🐠'],
  'חלבי': ['🥛', '🧀', '🧈', '🥚', '🍳'],
  'תבלינים ובישול': ['🧂', '🫚', '🌿', '🍃', '🧄', '🧅', '🌶️', '🫒', '🥫', '🫙', '🍯', '🫘', '🍚', '🌾'],
  'משקאות': ['☕', '🍵', '🧃', '🥤', '🧋', '🍷', '🍺', '🥂', '🧉'],
  'מזון מוכן': ['🍕', '🍔', '🌭', '🌮', '🌯', '🥙', '🥪', '🍝', '🍜', '🍲', '🥘', '🥟', '🍱', '🍛', '🍣', '🍚', '🥡'],
  'חטיפים': ['🍿', '🍫', '🍬', '🍭', '🥜', '🌰'],
  'ניקיון': ['🧼', '🧽', '🧹', '🧺', '🧴', '🧻', '🪥'],
  'מוצרי טיפוח': ['🧴', '💄', '💅', '🪒', '🧖'],
  'תינוקות': ['🍼', '👶', '🧷', '🧸'],
  'בעלי חיים': ['🐕', '🐈', '🐦', '🐠', '🐹'],
  'אחר': ['🛒', '📦', '🎁', '💊', '🌡️', '🔋', '💡', '🕯️', '📱', '💻', '🎒', '👕', '👖', '👗', '🧦', '👟', '⚽', '🎾', '🏀']
};

// Icon names mapping for search (Hebrew names for each icon)
const iconNames = {
  '🍎': 'תפוח תפוחים אדום',
  '🍊': 'תפוז תפוזים כתום',
  '🍋': 'לימון לימונים צהוב חמוץ',
  '🍌': 'בננה בננות',
  '🍉': 'אבטיח',
  '🍇': 'ענבים',
  '🍓': 'תות תותים',
  '🫐': 'אוכמניות',
  '🍈': 'מלון',
  '🍒': 'דובדבן דובדבנים',
  '🍑': 'אפרסק אפרסקים',
  '🥭': 'מנגו',
  '🍍': 'אננס',
  '🥥': 'קוקוס',
  '🥝': 'קיווי',
  '🥕': 'גזר',
  '🌽': 'תירס',
  '🥒': 'מלפפון מלפפונים',
  '🥬': 'חסה ירוק עלים',
  '🥦': 'ברוקולי',
  '🍅': 'עגבניה עגבניות',
  '🧄': 'שום',
  '🧅': 'בצל',
  '🫑': 'פלפל ירוק',
  '🌶️': 'פלפל חריף',
  '🥔': 'תפוח אדמה תפוחי אדמה',
  '🍆': 'חציל',
  '🥗': 'סלט',
  '🍞': 'לחם',
  '🥖': 'באגט לחם צרפתי',
  '🥐': 'קרואסון',
  '🥯': 'בייגל בגל',
  '🧇': 'ופל',
  '🥞': 'פנקייק',
  '🍰': 'עוגה',
  '🎂': 'עוגת יום הולדת',
  '🧁': 'מאפין קאפקייק',
  '🥧': 'פאי',
  '🍪': 'עוגיה עוגיות',
  '🍩': 'סופגניה דונאט',
  '🥩': 'בשר סטייק',
  '🍖': 'בשר על עצם',
  '🍗': 'עוף רגל עוף',
  '🥓': 'בייקון',
  '🍤': 'שרימפס',
  '🦐': 'שרימפס קטן',
  '🦞': 'לובסטר',
  '🦀': 'סרטן',
  '🐟': 'דג דגים',
  '🐠': 'דג טרופי',
  '🥛': 'חלב',
  '🧀': 'גבינה',
  '🧈': 'חמאה',
  '🥚': 'ביצה ביצים',
  '🍳': 'ביצה מטוגנת',
  '🧂': 'מלח',
  '🫚': 'ג\'ינג\'ר זנגביל',
  '🌿': 'עשבי תיבול הרבס',
  '🍃': 'עלים',
  '🫒': 'זית זיתים',
  '🥫': 'שימורים',
  '🫙': 'צנצנת ריבה',
  '🍯': 'דבש',
  '🫘': 'שעועית קטניות עדשים',
  '🍚': 'אורז',
  '🌾': 'חיטה קמח דגנים',
  '☕': 'קפה',
  '🍵': 'תה',
  '🧃': 'מיץ קופסא',
  '🥤': 'משקה קר',
  '🧋': 'באבל טי',
  '🍷': 'יין',
  '🍺': 'בירה',
  '🥂': 'שמפניה',
  '🧉': 'מטה',
  '🍕': 'פיצה',
  '🍔': 'המבורגר',
  '🌭': 'נקניק הוט דוג',
  '🌮': 'טאקו',
  '🌯': 'בוריטו',
  '🥙': 'פיתה',
  '🥪': 'כריך סנדוויץ',
  '🍝': 'פסטה ספגטי',
  '🍜': 'מרק נודלס',
  '🍲': 'תבשיל',
  '🥘': 'פאייה',
  '🥟': 'כופתאות',
  '🍱': 'בנטו',
  '🍛': 'קארי',
  '🍣': 'סושי',
  '🥡': 'אוכל סיני',
  '🍿': 'פופקורן',
  '🍫': 'שוקולד',
  '🍬': 'סוכריה',
  '🍭': 'סוכריה על מקל',
  '🥜': 'בוטנים',
  '🌰': 'אגוזים',
  '🧼': 'סבון',
  '🧽': 'ספוג',
  '🧹': 'מטאטא',
  '🧺': 'סל כביסה',
  '🧴': 'בקבוק שמפו',
  '🧻': 'נייר טואלט',
  '🪥': 'מברשת שיניים',
  '💄': 'שפתון',
  '💅': 'לק',
  '🪒': 'סכין גילוח',
  '🧖': 'ספא',
  '🍼': 'בקבוק תינוק',
  '👶': 'תינוק',
  '🧷': 'סיכת ביטחון',
  '🧸': 'דובי',
  '🐕': 'כלב',
  '🐈': 'חתול',
  '🐦': 'ציפור',
  '🐠': 'דג',
  '🐹': 'אוגר',
  '🛒': 'עגלת קניות',
  '📦': 'חבילה קופסא',
  '🎁': 'מתנה',
  '💊': 'תרופה כדור',
  '🌡️': 'מדחום',
  '🔋': 'סוללה',
  '💡': 'נורה',
  '🕯️': 'נר',
  '📱': 'טלפון',
  '💻': 'מחשב',
  '🎒': 'תיק',
  '👕': 'חולצה',
  '👖': 'מכנסיים',
  '👗': 'שמלה',
  '🧦': 'גרביים',
  '👟': 'נעליים',
  '⚽': 'כדורגל',
  '🎾': 'טניס',
  '🏀': 'כדורסל'
};

let iconPickerTarget = null; // The item being edited
let iconPickerMode = null; // 'list', 'choose', 'list-item', or 'custom-item'
let iconPickerTargetItem = null; // For changing icon of existing list item

// Initialize icon picker
function initIconPicker() {
  const iconGrid = document.getElementById('iconGrid');
  
  // Create icon grid with categories
  Object.entries(iconCategories).forEach(([category, icons]) => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'icon-category';
    
    const categoryTitle = document.createElement('h3');
    categoryTitle.textContent = category;
    categoryTitle.style.fontSize = '1.1rem';
    categoryTitle.style.fontWeight = '700';
    categoryTitle.style.marginTop = '1rem';
    categoryTitle.style.marginBottom = '0.5rem';
    categoryTitle.style.textAlign = 'right';
    categoryTitle.style.color = 'var(--text-color, #333)';
    categoryDiv.appendChild(categoryTitle);
    
    const iconsContainer = document.createElement('div');
    iconsContainer.style.display = 'grid';
    iconsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';
    iconsContainer.style.gap = '0.5rem';
    iconsContainer.style.marginBottom = '1rem';
    
    icons.forEach(icon => {
      const iconBtn = document.createElement('div');
      iconBtn.className = 'icon-option';
      iconBtn.textContent = icon;
      iconBtn.addEventListener('click', () => selectIcon(icon));
      iconsContainer.appendChild(iconBtn);
    });
    
    categoryDiv.appendChild(iconsContainer);
    iconGrid.appendChild(categoryDiv);
  });
}

// Show icon picker
function showIconPicker(targetElement, mode) {
  iconPickerTarget = targetElement;
  iconPickerMode = mode;
  document.getElementById('iconPickerModal').style.display = 'flex';
}

// Select icon and update item
function selectIcon(icon) {
  if (iconPickerMode === 'custom-item') {
    // Custom item mode - finish adding the custom item
    finishAddingCustomItem(icon);
    closeIconPicker();
    return;
  }
  
  if (iconPickerMode === 'list-item' && iconPickerTargetItem) {
    // Update existing list item icon
    const nameSpan = iconPickerTargetItem.querySelector('.name');
    if (nameSpan) {
      const currentText = nameSpan.textContent.trim();
      const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').replace(/^[\u{2600}-\u{26FF}]\s*/u, '');
      nameSpan.textContent = `${icon} ${textWithoutIcon}`;
      saveListToStorage();
    }
    iconPickerTargetItem = null;
    closeIconPicker();
    return;
  }
  
  if (!iconPickerTarget) return;
  
  if (iconPickerMode === 'list') {
    // Update list item
    const nameSpan = iconPickerTarget.querySelector('.name');
    if (nameSpan) {
      const currentText = nameSpan.textContent.trim();
      const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').replace(/^[\u{2600}-\u{26FF}]\s*/u, '');
      nameSpan.textContent = `${icon} ${textWithoutIcon}`;
      saveListToStorage();
    }
  } else if (iconPickerMode === 'choose') {
    // Update choose item
    const badge = iconPickerTarget.querySelector('.badge');
    const currentText = iconPickerTarget.textContent.trim().replace(/\d+$/, '').trim();
    const textWithoutIcon = currentText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, '').replace(/^[\u{2600}-\u{26FF}]\s*/u, '');
    
    iconPickerTarget.textContent = `${icon} ${textWithoutIcon}`;
    if (badge) {
      iconPickerTarget.appendChild(badge);
    }
    saveChooseItemsToStorage();
  }
  
  closeIconPicker();
}

// Close icon picker
function closeIconPicker() {
  document.getElementById('iconPickerModal').style.display = 'none';
  iconPickerTarget = null;
  iconPickerMode = null;
}

// Event listeners
document.getElementById('closeIconPicker').addEventListener('click', closeIconPicker);

// Click outside to close
document.getElementById('iconPickerModal').addEventListener('click', (e) => {
  if (e.target.id === 'iconPickerModal') {
    closeIconPicker();
  }
});

// Icon search functionality
const iconSearchInput = document.getElementById('iconSearch');
iconSearchInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.trim().toLowerCase();
  const categories = document.querySelectorAll('.icon-category');
  
  if (searchTerm === '') {
    // Show all categories and icons
    categories.forEach(cat => {
      cat.style.display = 'block';
      const icons = cat.querySelectorAll('.icon-option');
      icons.forEach(icon => icon.style.display = 'block');
    });
    return;
  }
  
  // Filter categories and icons
  categories.forEach(cat => {
    const categoryTitle = cat.querySelector('h3').textContent.toLowerCase();
    const icons = cat.querySelectorAll('.icon-option');
    let hasVisibleIcons = false;
    
    // Check if category name matches
    const categoryMatches = categoryTitle.includes(searchTerm);
    
    // Check each icon
    icons.forEach(icon => {
      const iconEmoji = icon.textContent.trim();
      const iconName = iconNames[iconEmoji] || '';
      const iconMatches = iconName.toLowerCase().includes(searchTerm);
      
      if (categoryMatches || iconMatches) {
        icon.style.display = 'block';
        hasVisibleIcons = true;
      } else {
        icon.style.display = 'none';
      }
    });
    
    // Show category only if it has visible icons
    cat.style.display = hasVisibleIcons ? 'block' : 'none';
  });
  
  // If no results, show a message
  const hasResults = Array.from(categories).some(cat => cat.style.display !== 'none');
  
  if (!hasResults) {
    // Could add a "no results" message here if desired
    console.log('No icons found for:', searchTerm);
  }
});

// Clear search when opening picker
function showIconPicker(targetElement, mode) {
  iconPickerTarget = targetElement;
  iconPickerMode = mode;
  document.getElementById('iconPickerModal').style.display = 'flex';
  
  // Clear search and show all icons
  iconSearchInput.value = '';
  const categories = document.querySelectorAll('.icon-category');
  categories.forEach(cat => {
    cat.style.display = 'block';
  });
  
  // Focus search input for easy typing
  setTimeout(() => iconSearchInput.focus(), 100);
}

// Add to context menu
document.getElementById('contextIcon').addEventListener('click', () => {
  if (longPressChooseItem) {
    showIconPicker(longPressChooseItem.element, 'choose');
    hideContextMenu();
  } else if (longPressTarget) {
    showIconPicker(longPressTarget, 'list');
    hideContextMenu();
  }
});

// Initialize on page load
initIconPicker();

/* ====== Choose Items Modal Functionality ====== */
function openChooseModal() {
  const modal = document.getElementById('chooseItemsModal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // Clear search
  const searchInput = document.getElementById('chooseSearch');
  if (searchInput) {
    searchInput.value = '';
    filterChooseItems('');
    // Focus search input for easy typing
    setTimeout(() => searchInput.focus(), 100);
  }
}

function closeChooseModal() {
  const modal = document.getElementById('chooseItemsModal');
  if (!modal) return;
  modal.style.display = 'none';
}

// Close choose modal listeners
document.getElementById('closeChooseModal')?.addEventListener('click', closeChooseModal);

document.getElementById('chooseItemsModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'chooseItemsModal') {
    closeChooseModal();
  }
});

// Choose search functionality
const chooseSearchInput = document.getElementById('chooseSearch');
if (chooseSearchInput) {
  chooseSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    filterChooseItems(searchTerm);
  });
}

function filterChooseItems(searchTerm) {
  const items = document.querySelectorAll('.choose-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    const badge = item.querySelector('.badge');
    const textWithoutBadge = badge ? text.replace(badge.textContent, '').trim() : text;
    
    if (searchTerm === '' || textWithoutBadge.includes(searchTerm)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}
