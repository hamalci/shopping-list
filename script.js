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
  btn.textContent = `${item.icon} ${item.name}`;

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
    renderAllPrices();
    renderTotal();
  });

  return btn;
}

/* ====== createListItem (price as currency left, amount right inside fixed column) ====== */
function createListItem(name, icon = "🛒", quantity = 1, unit = "יח'", skipSave = false, price = null) {
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

  // plus/minus quantity handlers (אם קיימים ככפתורים בתבנית שלך, עדכן אותם להפעיל שינוי זה)
  // דוגמה: שינוי קליק על השורה מגדיר checked
  row.appendChild(nameSpan);
  row.appendChild(qty);
  row.appendChild(priceSpan);

  // שמירת נתונים ותוספות אירועים
  row.addEventListener("click", (e) => {
    // אם לחצת על ה priceSpan או על כפתורי qty, אל תטפל ב־toggle של השורה
    if (e.target.closest('.price') || e.target.closest('.qty')) return;
    row.classList.toggle("checked");
    const listGrid = document.getElementById("listGrid");
    row.classList.add("moving");
    setTimeout(() => { listGrid.appendChild(row); row.classList.remove("moving"); saveListToStorage(); }, 300);
  });

  // אם יש פונקציות כפתורי + / - בהדרכה שלך, גם הן צריכות לעדכן qAmount.textContent ולקרוא saveListToStorage(), renderTotal()
  // Append to DOM
  document.getElementById("listGrid").appendChild(row);
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

  const items = [
    { name:"גזר",icon:"🥕",unit:"ק\"ג" },
    { name:"מלפפונים",icon:"🥒",unit:"ק\"ג" },
    { name:"עגבניות",icon:"🍅",unit:"ק\"ג" },
    { name:"גבינה",icon:"🧀",unit:"אריזה" },
    { name:"חלב",icon:"🥛",unit:"ליטר" },
    { name:"לחם",icon:"🍞",unit:"יח'" },
    { name:"עוף",icon:"🍗",unit:"ק\"ג" },
    { name:"אורז",icon:"🍚",unit:"ק\"ג" },
    { name:"קפה",icon:"☕",unit:"אריזה" }
  ];

  items.forEach(i => chooseGrid.appendChild(makeChooseButton(i)));

  const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  savedCustom.forEach(c => {
    const safe = { name: String(c.name || "").trim(), icon: String(c.icon || "🛒").trim(), unit: String(c.unit || "יח'").trim() };
    chooseGrid.appendChild(makeChooseButton(safe));
  });
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

    items.push({ icon, name: pureName, qty, price: priceText, checked: el.classList.contains("checked") });
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
    const row = createListItem(item.name, item.icon || "🛒", parseInt(num) || 1, unit || "יח'", true, priceMatch || null);
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
}

function togglePriceDisplay(show) {
  localStorage.setItem('showPrices', show ? '1' : '0');
  renderAllPrices();
  renderTotal();
}

/* ====== basic actions ====== */
function resetChoices(){
  // איפוס הסימונים והבדג'ים
  document.querySelectorAll(".choose-item .badge").forEach(b => { b.textContent = "0"; b.style.display = "none"; });
  document.querySelectorAll(".choose-item.selected").forEach(btn => {
    btn.classList.add("resetting");
    setTimeout(() => { btn.classList.remove("selected", "resetting", "pulse"); }, 180);
  });
  
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
  resetChoices();
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}
function clearChecked(){
  const listGrid = document.getElementById("listGrid");
  document.querySelectorAll("#listGrid .item.checked").forEach(el => {
    el.classList.remove("checked");
    listGrid.appendChild(el);
  });
  resetChoices();
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}
function addCustomItem(){
  const rawName = prompt("הכנס שם פריט חדש:");
  if (!rawName) return;
  const name = String(rawName).trim();
  const unit = String(prompt("הכנס יחידת מידה (למשל: ק\"ג, יח', ליטר):", "יח'") || "יח'").trim();
  const icon = String(prompt("בחר אייקון לפריט (למשל 🥑):", "🛒") || "🛒").trim();
  createListItem(name, icon, 1, unit);
  const saved = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  if (!saved.some(it => String(it.name || "").trim().toLowerCase() === name.toLowerCase())) {
    saved.push({ name, icon, unit });
    localStorage.setItem('customChooseItems', JSON.stringify(saved));
  }
  const chooseGrid = document.getElementById("chooseGrid");
  if (chooseGrid) chooseGrid.appendChild(makeChooseButton({ name, icon, unit }));
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

function loadChooseItems() {
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
  openChooseListModal(listNames, allLists, customLists);
}

/* ====== init ====== */
document.addEventListener("DOMContentLoaded", () => {
  loadDefaultChooseItems();
  loadListFromStorage();

  const visible = localStorage.getItem("chooseSectionVisible");
  const section = document.getElementById("chooseSection");
  const btnToggle = document.getElementById("toggleChoose");
  if (visible === "false" && section) { section.classList.add("hidden"); if (btnToggle) btnToggle.textContent = "הצג"; }

  document.getElementById("btnResetChoices")?.addEventListener("click", resetChoices);
  document.getElementById("btnAddCustom")?.addEventListener("click", addCustomItem);
  document.getElementById("btnLoadChooseItems")?.addEventListener("click", loadChooseItems);
  document.getElementById("btnLoadPreset")?.addEventListener("click", loadPresetList);
  document.getElementById("btnClearList")?.addEventListener("click", () => { if (confirm("האם למחוק את כל הרשימה?")) clearList(); });
  document.getElementById("btnClearChecked")?.addEventListener("click", clearChecked);
  document.getElementById("btnSaveAsPreset")?.addEventListener("click", saveCurrentListAsPreset);

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

  document.getElementById("toggleChoose")?.addEventListener("click", () => {
    const sec = document.getElementById("chooseSection");
    const btn = document.getElementById("toggleChoose");
    if (!sec || !btn) return;
    if (sec.classList.contains("hidden")) { sec.classList.remove("hidden"); btn.textContent = "הסתר"; localStorage.setItem("chooseSectionVisible","true"); }
    else { sec.classList.add("hidden"); btn.textContent = "הצג"; localStorage.setItem("chooseSectionVisible","false"); }
  });

  document.getElementById("menuButton")?.addEventListener("click", () => {
    const menu = document.getElementById("menuDropdown");
    if (!menu) return;
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu-container")) {
      const menu = document.getElementById("menuDropdown");
      if (menu) menu.style.display = "none";
    }
  });

  document.getElementById("btnFontIncrease")?.addEventListener("click", () => {
    rootFontPx = Math.min(rootFontPx + 1, 30);
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
  });
  document.getElementById("btnFontDecrease")?.addEventListener("click", () => {
    rootFontPx = Math.max(rootFontPx - 1, 12);
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
  });
  document.getElementById("btnFontReset")?.addEventListener("click", () => {
    rootFontPx = 19;
    document.documentElement.style.fontSize = rootFontPx + "px";
    localStorage.setItem("rootFontPx", rootFontPx);
  });

  document.getElementById("btnViewMode")?.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("viewMode", document.body.classList.contains("dark-mode") ? "dark" : "light");
    // ensure panels get panel class so dark CSS applies
    if (document.body.classList.contains('dark-mode')) {
      document.querySelectorAll('#chooseSection, #settingsSection, #categoriesList, .choose-item, .list-footer').forEach(el => {
        if (el && !el.classList.contains('panel')) el.classList.add('panel');
      });
    }
  });

  /* store UI wiring */
  document.getElementById('networkSelect')?.addEventListener('change', (e) => populateBranches(e.target.value));
  document.getElementById('btnSaveStore')?.addEventListener('click', saveStoreSelection);
  document.getElementById('togglePrices')?.addEventListener('change', (e) => togglePriceDisplay(e.target.checked));

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

  // Initial UI render calls if functions exist
  if (typeof renderAllPrices === 'function') renderAllPrices();
  if (typeof renderTotal === 'function') renderTotal();
});
