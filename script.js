// --- Debug Configuration ---
// Set to false in production to disable all console.log statements
const DEBUG_MODE = false; // Change to true for development/debugging

// --- Mobile Collapse Configuration ---
const MOBILE_VISIBLE_ITEMS = 5; // Show first 5 items on mobile
const MOBILE_COLLAPSE_THRESHOLD = 8; // Collapse categories with more than 8 items

// --- Firebase Database Reference ---
// db is initialized in index.html as window.db
// Wait for it to be available
function getDB() {
  return window.db || null;
}

// --- Enhanced Security: Input Sanitization ---
function sanitizeInput(input) {
  if (!input) return '';
  
  const text = String(input)
    // Remove HTML tags and dangerous characters
    .replace(/[<>]/g, '')
    // Remove javascript: and data: protocols
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove script tags content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags content  
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim();
    
  // Limit length to prevent abuse
  return text.substring(0, 500);
}

// Enhanced URL validation for images
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    // Only allow https for external URLs
    if (!['https:', 'data:'].includes(urlObj.protocol)) return false;
    // Check for known image domains
    const allowedDomains = ['images.unsplash.com', 'unsplash.com', 'cdn.jsdelivr.net'];
    if (urlObj.protocol === 'https:' && !allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
      return false;
    }
    return true;
  } catch {
    // Check for data URLs
    return url.startsWith('data:image/') && url.length < 1024 * 1024; // Max 1MB for base64
  }
}

// Rate limiting for operations
const rateLimiter = {
  operations: new Map(),
  limit: 10, // Max 10 operations per minute
  window: 60000, // 1 minute
  
  canPerform(operation) {
    const now = Date.now();
    const key = operation;
    
    if (!this.operations.has(key)) {
      this.operations.set(key, []);
    }
    
    const times = this.operations.get(key);
    // Remove old entries
    const filtered = times.filter(time => now - time < this.window);
    
    if (filtered.length >= this.limit) {
      return false;
    }
    
    filtered.push(now);
    this.operations.set(key, filtered);
    return true;
  }
};

// === BACKUP AND DATA MANAGEMENT ===
const DataManager = {
  // Export all app data
  exportData() {
    if (!rateLimiter.canPerform('export')) {
      showToast('יותר מדי ניסיונות ייצוא. נסה שוב מאוחר יותר.', 'error');
      return;
    }
    
    try {
      const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        shoppingList: JSON.parse(localStorage.getItem('shoppingList') || '[]'),
        chooseItems: JSON.parse(localStorage.getItem('chooseItems') || '{}'),
        settings: {
          darkMode: document.body.classList.contains('dark-mode'),
          selectedStore: localStorage.getItem('selectedStore') || '',
          selectedNetwork: localStorage.getItem('selectedNetwork') || '',
          fontSize: localStorage.getItem('fontSize') || 'medium'
        }
      };
      
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `shopping-list-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      showToast('הנתונים יוצאו בהצלחה! 📤', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('שגיאה בייצוא הנתונים', 'error');
    }
  },

  // Import data from file
  importData() {
    if (!rateLimiter.canPerform('import')) {
      showToast('יותר מדי ניסיונות יבוא. נסה שוב מאוחר יותר.', 'error');
      return;
    }
    
    const input = document.getElementById('importFileInput');
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        showToast('יש לבחור קובץ JSON בלבד', 'error');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showToast('הקובץ גדול מדי (מקסימום 10MB)', 'error');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          this.validateAndImportData(data);
        } catch (error) {
          console.error('Import failed:', error);
          showToast('קובץ לא תקין או פגום', 'error');
        }
      };
      reader.readAsText(file);
      input.value = ''; // Reset input
    };
    input.click();
  },

  // Validate and import data
  validateAndImportData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }
    
    // Validate structure
    if (!data.shoppingList || !Array.isArray(data.shoppingList)) {
      throw new Error('Missing or invalid shopping list data');
    }
    
    if (data.chooseItems && typeof data.chooseItems !== 'object') {
      throw new Error('Invalid choose items data');
    }
    
    // Confirm with user
    if (!confirm(`האם לייבא נתונים מ-${data.timestamp || 'תאריך לא ידוע'}? פעולה זו תדרוס את הנתונים הקיימים.`)) {
      return;
    }
    
    try {
      // Import shopping list
      if (data.shoppingList.length > 0) {
        localStorage.setItem('shoppingList', JSON.stringify(data.shoppingList));
      }
      
      // Import choose items
      if (data.chooseItems && Object.keys(data.chooseItems).length > 0) {
        localStorage.setItem('chooseItems', JSON.stringify(data.chooseItems));
      }
      
      // Import settings
      if (data.settings) {
        if (data.settings.selectedStore) {
          localStorage.setItem('selectedStore', data.settings.selectedStore);
        }
        if (data.settings.selectedNetwork) {
          localStorage.setItem('selectedNetwork', data.settings.selectedNetwork);
        }
        if (data.settings.fontSize) {
          localStorage.setItem('fontSize', data.settings.fontSize);
        }
        if (data.settings.darkMode !== undefined) {
          document.body.classList.toggle('dark-mode', data.settings.darkMode);
          localStorage.setItem('darkMode', data.settings.darkMode);
        }
      }
      
      // Reload the page to apply changes
      showToast('הנתונים יובאו בהצלחה! האפליקציה תתרענן...', 'success');
      setTimeout(() => location.reload(), 1500);
      
    } catch (error) {
      console.error('Data import failed:', error);
      showToast('שגיאה ביבוא הנתונים', 'error');
    }
  },

  // Auto backup to localStorage with compression
  autoBackup() {
    try {
      const backup = {
        timestamp: new Date().toISOString(),
        data: {
          shoppingList: localStorage.getItem('shoppingList') || '[]',
          chooseItems: localStorage.getItem('chooseItems') || '{}',
        }
      };
      
      localStorage.setItem('autoBackup', JSON.stringify(backup));
      
      // Keep only last 5 backups
      const backups = JSON.parse(localStorage.getItem('backupHistory') || '[]');
      backups.unshift(backup);
      localStorage.setItem('backupHistory', JSON.stringify(backups.slice(0, 5)));
      
    } catch (error) {
      console.error('Auto backup failed:', error);
    }
  },

  // Clear all data
  clearAllData() {
    if (!confirm('האם אתה בטוח שברצונך למחוק את כל הנתונים? פעולה זו בלתי הפיכה!')) {
      return;
    }
    
    if (!confirm('זוהי אזהרה אחרונה! כל הרשימות והקטגוריות יימחקו לצמיתות.')) {
      return;
    }
    
    try {
      // Create final backup before clearing
      this.exportData();
      
      // Clear all localStorage data
      const keysToKeep = ['fontSize', 'darkMode']; // Keep UI preferences
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      
      showToast('כל הנתונים נמחקו. האפליקציה תתרענן...', 'info');
      setTimeout(() => location.reload(), 1500);
      
    } catch (error) {
      console.error('Clear data failed:', error);
      showToast('שגיאה במחיקת הנתונים', 'error');
    }
  }
};

// Validate data size for Firebase
function validateDataSize(data) {
  const jsonString = JSON.stringify(data);
  const sizeInBytes = new Blob([jsonString]).size;
  const maxSize = 1024 * 1024; // 1MB limit
  return sizeInBytes < maxSize;
}

// --- Toast Notification System ---
function showToast(message, type = 'info', duration = 3000) {
  // Create toast container if it doesn't exist
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Add icon based on type
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  // Create elements safely without innerHTML
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || icons.info;
  
  const messageSpan = document.createElement('span');
  messageSpan.className = 'toast-message';
  messageSpan.textContent = message; // Safe: uses textContent instead of innerHTML
  
  toast.appendChild(iconSpan);
  toast.appendChild(messageSpan);
  
  // Add to container
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('toast-show'), 10);
  
  // Auto remove after duration
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// --- Helper functions for localStorage ---
const STORAGE_KEY = "shoppingList";
const getShoppingList = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};
const saveShoppingList = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

// --- Custom Prompt Function ---
function customPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customPromptModal');
    const title = document.getElementById('customPromptTitle');
    const messageEl = document.getElementById('customPromptMessage');
    const input = document.getElementById('customPromptInput');
    const okBtn = document.getElementById('customPromptOk');
    const cancelBtn = document.getElementById('customPromptCancel');
    const closeBtn = document.getElementById('closeCustomPrompt');
    
    if (!modal) {
      // Fallback to native prompt
      resolve(prompt(message, defaultValue));
      return;
    }
    
    title.textContent = 'הכנס ערך';
    messageEl.textContent = message;
    input.value = defaultValue;
    modal.style.display = 'flex';
    
    // Focus on input
    setTimeout(() => input.focus(), 100);
    
    const cleanup = (value) => {
      modal.style.display = 'none';
      input.value = '';
      resolve(value);
    };
    
    const handleOk = () => {
      cleanup(input.value || null);
    };
    
    const handleCancel = () => {
      cleanup(null);
    };
    
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        handleOk();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };
    
    // Remove old listeners
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
    input.onkeydown = null;
    
    // Add new listeners
    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;
    input.onkeydown = handleEnter;
  });
}

// --- Firebase Share Functions ---
async function saveListToFirebase(silent) {
  try {
    // Check if Firebase is available
    const db = getDB();
    if (!db) {
      if (!silent) showToast("Firebase לא זמין. אנא רענן את הדף.", 'error');
      console.error('Firebase DB not initialized');
      return;
    }
    
    // קרא את הרשימה המקומית
    const list = getShoppingList();
    if (!list || list.length === 0) {
      if (!silent) showToast("אין רשימה לשיתוף", 'warning');
      return;
    }
    
    // Security: Validate list size
    if (!validateDataSize(list)) {
      if (!silent) showToast("הרשימה גדולה מדי לשיתוף (מקסימום 1MB)", 'error');
      return;
    }
    
    // Security: Sanitize all items in the list
    const sanitizedList = list.map(item => ({
      ...item,
      name: sanitizeInput(item.name || ''),
      note: sanitizeInput(item.note || ''),
      icon: sanitizeInput(item.icon || '🛒'),
      qty: sanitizeInput(item.qty || '1 יח\''),
      price: sanitizeInput(item.price || ''),
    }));
    
    // צור מזהה קצר (6 תווים)
    const shortId = Math.random().toString(36).substring(2, 8);
    // שמור ב-Firestore
    await db.collection("lists").doc(shortId).set({
      list: sanitizedList,
      created: new Date().toISOString(),
      // Add expiration (30 days)
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    // צור קישור קצר - השתמש בכתובת קבועה
    // בחר את הכתובת הקבועה הנכונה לפי הפלטפורמה
    let baseUrl;
    if (window.location.hostname.includes('vercel.app')) {
      // Vercel - השתמש בכתובת קבועה
      baseUrl = 'https://shopping-app-zeta-eight.vercel.app';
    } else if (window.location.hostname.includes('netlify.app')) {
      // Netlify - השתמש בכתובת קבועה (אם יש)
      baseUrl = window.location.origin; // תצטרך להחליף אם יש domain קבוע
    } else if (window.location.hostname.includes('github.io')) {
      // GitHub Pages
      baseUrl = 'https://hamalci.github.io/shopping-list';
    } else {
      // Local או domain אחר
      baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
    }
    const url = baseUrl + "?list=" + shortId;
    if (!silent) {
      // הצג למשתמש (למקרה קריאה ישירה)
      if (typeof showShareModal === 'function') showShareModal(url);
    }
    return url;
  } catch (err) {
    if (!silent) showToast("שגיאה בשמירה ל-Firebase: " + err.message, 'error', 5000);
    console.error('[Firebase] Error saving to Firestore:', err);
  }
}

function showShareModal(url) {
  const modal = document.getElementById('shareModal');
  const input = document.getElementById('shareLinkInput');
  const copyBtn = document.getElementById('copyShareLinkBtn');
  const smsBtn = document.getElementById('smsShareBtn');
  const waBtn = document.getElementById('waShareBtn');
  const closeBtn = document.getElementById('closeShareModal');
  const status = document.getElementById('copyStatus');
  if (!modal || !input || !copyBtn || !closeBtn || !smsBtn || !waBtn) return;
  waBtn.onclick = function() {
    const waText = encodeURIComponent('הנה רשימת קניות לשיתוף: ' + url);
    window.open('https://wa.me/?text=' + waText, '_blank');
  };
  input.value = url;
  status.textContent = '';
  modal.style.display = 'block';
  input.select();
  copyBtn.onclick = async function() {
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'הקישור הועתק ללוח!';
    } catch {
      status.textContent = 'לא ניתן להעתיק אוטומטית, העתק ידנית.';
    }
  };
  smsBtn.onclick = function() {
    const smsBody = encodeURIComponent('הנה רשימת קניות לשיתוף: ' + url);
    window.open('sms:?body=' + smsBody, '_blank');
  };
  closeBtn.onclick = function() { modal.style.display = 'none'; };
  window.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
}

async function loadListFromFirebase(listId) {
  try {
    // Check if Firebase is available
    const db = getDB();
    if (!db) {
      showToast("Firebase לא זמין. אנא רענן את הדף.", 'error');
      console.error('Firebase DB not initialized');
      return;
    }
    
    const doc = await db.collection("lists").doc(listId).get();
    if (!doc.exists) {
      showToast("הרשימה לא נמצאה בענן", 'error');
      return;
    }
    const data = doc.data();
    if (data && Array.isArray(data.list) && data.list.length > 0) {
      // אפשרות: גיבוי הרשימה המקומית לפני דריסה
      const currentList = getShoppingList();
      if (currentList.length > 0 && !confirm("טעינת רשימה משותפת תדרוס את הרשימה הנוכחית. להמשיך?")) return;
      
      // שמור את הרשימה ב-localStorage
      saveShoppingList(data.list);
      
      // נקה את הרשימה הקיימת ב-UI
      const listGrid = document.getElementById('listGrid');
      const cartGrid = document.getElementById('cartGrid');
      if (listGrid) listGrid.innerHTML = '';
      if (cartGrid) cartGrid.innerHTML = '';
      
      // טען את הרשימה ל-UI
      loadListFromStorage();
      
      showToast("הרשימה נטענה בהצלחה! ✨", 'success');
    } else {
      showToast("הרשימה בענן ריקה או לא תקינה", 'warning');
    }
  } catch (err) {
    showToast("שגיאה בטעינה מ-Firebase: " + err.message, 'error', 5000);
    console.error('[Firebase] Error loading from Firestore:', err);
  }
}
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

/* ====== DOM Cache ====== */
// Cache frequently accessed DOM elements
const DOM = {
  listGrid: null,
  chooseGrid: null,
  totalAmount: null,
  init() {
    this.listGrid = document.getElementById("listGrid");
    this.chooseGrid = document.getElementById("chooseGrid");
    this.totalAmount = document.getElementById("totalAmount");
  }
};

/* ====== categories + defaults ====== */
// Categories are now managed dynamically from loadDefaultChooseItems()
// The order and content will be extracted from categorizedItems
let categoriesOrder = [];
const categories = {};

/* ====== store map דמה ====== */
const storeMap = {
  yohananof: [
    { id: 'gd', name: 'יוחננוף גדרה' },
    { id: 'bilu-ekron', name: 'יוחננוף בילו סנטר עקרון' },
    { id: 'moti-kind-rehovot', name: 'יוחננוף מוטי קינד רחובות' }
  ],
  shufersal: [
    { id: 'sheli-rehovot', name: 'שופרסל שלי רחובות החדשה' }
  ],
  rami: [
    { id: 'moti-kind-rehovot', name: 'רמי לוי מוטי קינד רחובות' }
  ]
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
// Character replacement map for better performance
const HEBREW_FINAL_TO_NORMAL = {
  'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'
};

function normalizeName(s) {
  if (!s) return "";
  s = String(s).trim().toLowerCase();
  s = s.replace(/[\u0591-\u05C7]/g, ""); // remove nikud
  // Replace final letters in one pass
  s = s.replace(/[ךםןףץ]/g, m => HEBREW_FINAL_TO_NORMAL[m]);
  s = s.replace(/[^א-ת0-9\s]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/ות$|ים$|יות$/,"");
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
// Configuration: Use Cloudflare Worker or local JSON files
const USE_CLOUDFLARE_WORKER = true; // Set to true when Worker is deployed
const WORKER_URL = 'https://shopping-list-prices.hamalci.workers.dev'; // Replace with your Worker URL

async function fetchPricesForBranch(network, branchId) {
  if (!network || !branchId) return null;
  
  // Choose data source
  const url = USE_CLOUDFLARE_WORKER 
    ? `${WORKER_URL}/prices/${encodeURIComponent(network)}/${encodeURIComponent(branchId)}`
    : `/data/prices/${encodeURIComponent(network)}/${encodeURIComponent(branchId)}.json`;
  
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    
    // Handle both formats: Worker format and local JSON format
    const prices = json.prices || json;
    if (!prices || typeof prices !== 'object') throw new Error("Invalid price data");

    saveApiPrices(prices);
    const normMap = buildNormalizedPriceMap(prices);
    localStorage.setItem('apiPricesNormalized', JSON.stringify(normMap));
    localStorage.setItem('lastFetchedPrices', JSON.stringify({ 
      network, 
      branchId, 
      updated: json.updated || new Date().toISOString(),
      source: USE_CLOUDFLARE_WORKER ? 'cloudflare-worker' : 'local-json',
      cached: json.cached || false
    }));
    renderAllPrices();
    renderTotal();
    return prices;
  } catch (err) {
    console.error("Failed to fetch prices for branch:", err);
    return null;
  }
}

// Utility function to clean corrupted icon data
function cleanCorruptedIcons() {
  try {
    const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
    let hasChanges = false;
    
    const cleanedItems = savedCustom.map(item => {
      // Check for any corrupted data
      const isCorrupted = !item.name || 
                         !item.icon || 
                         (item.icon.length > 10 && 
                          !item.icon.startsWith('data:image/') && 
                          !/^[\u{1F300}-\u{1F9FF}]$/u.test(item.icon) &&
                          !/^[\u{2600}-\u{26FF}]$/u.test(item.icon));
      
      if (isCorrupted) {
        console.log('Cleaning corrupted item:', {
          name: item.name,
          iconLength: item.icon?.length,
          iconStart: item.icon?.substring(0, 30)
        });
        hasChanges = true;
        
        // Try to salvage the name if it exists and is reasonable
        let cleanName = item.name;
        if (!cleanName || typeof cleanName !== 'string' || cleanName.length > 100) {
          return null; // Skip this item entirely
        }
        
        return { 
          name: cleanName, 
          icon: '🛒', 
          unit: item.unit || 'יח\'',
          category: item.category || 'פריטים מותאמים אישית'
        };
      }
      return item;
    }).filter(item => item !== null); // Remove null items
    
    if (hasChanges || cleanedItems.length !== savedCustom.length) {
      localStorage.setItem('customChooseItems', JSON.stringify(cleanedItems));
      console.log('Cleaned corrupted icons from localStorage. Before:', savedCustom.length, 'After:', cleanedItems.length);
      showToast(`תוקנו ${savedCustom.length - cleanedItems.length} פריטים פגומים`, 'success', 4000);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error cleaning corrupted icons:', e);
    // If there's an error, clear the entire customChooseItems
    localStorage.removeItem('customChooseItems');
    showToast('נוקו נתונים פגומים (איפוס מלא)', 'warning');
    return true;
  }
}

// Emergency function to completely reset custom items
function emergencyResetCustomItems() {
  try {
    localStorage.removeItem('customChooseItems');
    console.log('Emergency reset: cleared all custom items');
    showToast('בוצע איפוס חירום של הפריטים המותאמים', 'warning', 5000);
    loadDefaultChooseItems();
  } catch (e) {
    console.error('Emergency reset failed:', e);
  }
}

// Deep clean function to thoroughly clean all corrupted data
function deepCleanCorruptedData() {
  try {
    console.log('Starting deep clean of corrupted data...');
    
    // First try to parse and clean
    const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
    console.log('Original custom items count:', savedCustom.length);
    
    const validItems = [];
    let corruptedCount = 0;
    
    savedCustom.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        corruptedCount++;
        return;
      }
      
      const name = item.name;
      const icon = item.icon;
      
      // Validate name
      if (!name || typeof name !== 'string' || name.trim() === '' || name.length > 50) {
        console.log(`Skipping item ${index}: invalid name`);
        corruptedCount++;
        return;
      }
      
      // Validate icon - must be emoji or valid data URL
      if (!icon || typeof icon !== 'string') {
        console.log(`Fixing item ${index}: missing icon`);
        validItems.push({
          name: name.trim(),
          icon: '🛒',
          unit: item.unit || 'יח\'',
          category: item.category || 'פריטים מותאמים אישית'
        });
        return;
      }
      
      // Check if it's a valid emoji (1-4 characters, contains Unicode emoji ranges)
      const isEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]{1,4}$/u.test(icon);
      
      // Check if it's a valid data URL
      const isValidDataURL = icon.startsWith('data:image/') && icon.includes('base64,') && icon.length < 50000;
      
      if (isEmoji || isValidDataURL) {
        validItems.push({
          name: name.trim(),
          icon: icon,
          unit: item.unit || 'יח\'',
          category: item.category || 'פריטים מותאמים אישית'
        });
      } else {
        console.log(`Fixing item ${index}: corrupted icon`, {
          name,
          iconLength: icon.length,
          iconStart: icon.substring(0, 30)
        });
        validItems.push({
          name: name.trim(),
          icon: '🛒',
          unit: item.unit || 'יח\'',
          category: item.category || 'פריטים מותאמים אישית'
        });
        corruptedCount++;
      }
    });
    
    // Save the cleaned data
    localStorage.setItem('customChooseItems', JSON.stringify(validItems));
    
    console.log(`Deep clean completed. Valid: ${validItems.length}, Corrupted: ${corruptedCount}`);
    showToast(`ניקוי יסודי הושלם: ${validItems.length} פריטים תקינים, ${corruptedCount} פריטים תוקנו`, 'success', 5000);
    
    // Refresh the categories
    loadDefaultChooseItems();
    
    return true;
  } catch (e) {
    console.error('Error in deep clean:', e);
    // If deep clean fails, do emergency reset
    localStorage.removeItem('customChooseItems');
    showToast('שגיאה בניקוי - בוצע איפוס מלא', 'error');
    loadDefaultChooseItems();
    return false;
  }
}

// Debug function to check custom items
function debugCustomItems() {
  try {
    const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
    console.log('=== DEBUG: Custom Items Analysis ===');
    console.log('Total items:', savedCustom.length);
    
    savedCustom.forEach((item, index) => {
      console.log(`Item ${index}:`, {
        name: item.name,
        icon: item.icon,
        iconType: item.icon?.startsWith('data:image/') ? 'IMAGE' : 'EMOJI',
        iconLength: item.icon?.length,
        iconStart: item.icon?.substring(0, 50),
        unit: item.unit,
        category: item.category
      });
    });
    
    return savedCustom;
  } catch (e) {
    console.error('Error in debug:', e);
    return [];
  }
}

/* ====== UI helpers: create choose button ====== */
function makeChooseButton(item) {
  const btn = document.createElement("div");
  btn.className = "choose-item";
  btn.setAttribute('data-icon', item.icon);
  btn.setAttribute('data-unit', item.unit);
  
  // Create icon container
  const iconContainer = document.createElement("div");
  iconContainer.style.cssText = `
    width: 45px;
    height: 45px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    grid-row: 1;
  `;
  
  // Check if icon is an image (base64 or URL)
  if (item.icon && (item.icon.startsWith('data:image/') || item.icon.startsWith('http://') || item.icon.startsWith('https://'))) {
    // For images, use the whole button as background with lazy loading
    btn.style.backgroundImage = `url(${item.icon})`;
    btn.style.backgroundSize = 'cover';
    btn.style.backgroundPosition = 'center';
    btn.style.backgroundRepeat = 'no-repeat';
    btn.classList.add('has-image-background');
    
    // Hide the icon container since we're using background
    iconContainer.style.display = 'none';
    
    // Test if image loads, fallback to emoji if not (with timeout)
    const testImg = new Image();
    let imageLoaded = false;
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      if (!imageLoaded) {
        // Fallback to default icon
        btn.style.backgroundImage = '';
        btn.style.backgroundSize = '';
        btn.style.backgroundPosition = '';
        btn.style.backgroundRepeat = '';
        btn.classList.remove('has-image-background');
        iconContainer.style.display = 'flex';
        iconContainer.style.fontSize = '34px';
        iconContainer.textContent = '🛒';
      }
    }, 5000); // 5 second timeout
    
    testImg.onload = () => {
      imageLoaded = true;
      clearTimeout(timeoutId);
    };
    
    testImg.onerror = () => {
      imageLoaded = true;
      clearTimeout(timeoutId);
      // If image fails to load, revert to emoji
      btn.style.backgroundImage = '';
      btn.style.backgroundSize = '';
      btn.style.backgroundPosition = '';
      btn.style.backgroundRepeat = '';
      btn.classList.remove('has-image-background');
      iconContainer.style.display = 'flex';
      iconContainer.style.fontSize = '34px';
      iconContainer.textContent = '🛒';
    };
    
    testImg.src = item.icon;
  } else if (item.icon && (
    item.icon.length > 10 && 
    !item.icon.startsWith('data:image/') && 
    !/^[\u{1F300}-\u{1F9FF}]$/u.test(item.icon) &&
    !/^[\u{2600}-\u{26FF}]$/u.test(item.icon) &&
    !/^[\u{1F600}-\u{1F64F}]$/u.test(item.icon) &&
    !/^[\u{1F680}-\u{1F6FF}]$/u.test(item.icon)
  )) {
    // This looks like corrupted data - use default emoji
    iconContainer.style.fontSize = '34px';
    iconContainer.textContent = '🛒';
  } else {
    // Regular emoji icon
    iconContainer.style.fontSize = '34px';
    iconContainer.textContent = item.icon || '🛒';
  }
  
  // Add text label
  const textSpan = document.createElement('span');
  textSpan.textContent = item.name;
  textSpan.style.cssText = `
    text-align: center;
    line-height: 1.1;
    word-break: break-word;
    font-size: 0.95rem;
    font-weight: 600;
    grid-row: 2;
    align-self: start;
    padding-top: 0.2rem;
    position: relative;
    z-index: 2;
  `;

  // Count words and add data attribute for mobile styling
  const wordCount = item.name.trim().split(/\s+/).length;
  btn.setAttribute('data-word-count', wordCount);
  
  // Update text style if this is an image background item
  if (btn.classList.contains('has-image-background')) {
    textSpan.style.color = 'white';
    textSpan.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    textSpan.style.fontWeight = '700';
    textSpan.style.padding = '0.3rem 0.5rem';
    textSpan.style.backgroundColor = 'rgba(0,0,0,0.4)';
    textSpan.style.borderRadius = '6px';
    textSpan.style.backdropFilter = 'blur(4px)';
  }
  
  btn.appendChild(iconContainer);
  btn.appendChild(textSpan);

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "0";
  badge.style.display = "none";
  btn.appendChild(badge);

  btn.addEventListener("click", () => {
    if (!DOM.listGrid) return;
    
    const existing = Array.from(DOM.listGrid.querySelectorAll(".item"))
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
      // Fix icon for corrupted data when creating list item  
      let iconToUse = item.icon;
      if (iconToUse && iconToUse.length > 10 && 
          !iconToUse.startsWith('data:image/') && 
          !iconToUse.startsWith('http://') && 
          !iconToUse.startsWith('https://') &&
          !/^[\u{1F300}-\u{1F9FF}]$/u.test(iconToUse) && 
          !/^[\u{2600}-\u{26FF}]$/u.test(iconToUse)) {
        iconToUse = '🛒'; // Use default icon for corrupted data
      }
      createListItem(item.name, iconToUse, 1, item.unit);
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
  row.dataset.icon = cleanIcon; // Store icon for later retrieval

  const nameSpan = document.createElement("span");
  nameSpan.className = "name";
  
  // Check if icon is an image (base64 or URL)
  if (cleanIcon.startsWith('data:image/') || cleanIcon.startsWith('http://') || cleanIcon.startsWith('https://')) {
    const imgElement = document.createElement('img');
    imgElement.src = cleanIcon;
    imgElement.className = 'item-image-icon';
    imgElement.style.width = '2em';
    imgElement.style.height = '2em';
    imgElement.style.objectFit = 'cover';
    imgElement.style.borderRadius = '4px';
    imgElement.style.marginLeft = '0.3em';
    imgElement.style.verticalAlign = 'middle';
    
    // Handle image loading errors
    imgElement.onerror = () => {
      // If image fails to load, replace with default emoji
      imgElement.style.display = 'none';
      const fallbackSpan = document.createElement('span');
      fallbackSpan.textContent = '🛒 ';
      fallbackSpan.style.marginLeft = '0.3em';
      nameSpan.insertBefore(fallbackSpan, nameSpan.firstChild);
    };
    
    nameSpan.appendChild(imgElement);
    nameSpan.appendChild(document.createTextNode(` ${cleanName}`));
  } else {
    // Regular emoji icon
    nameSpan.textContent = `${cleanIcon} ${cleanName}`.trim();
  }

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
    
    // Move item to cart or back to list
    const cartGrid = document.getElementById('cartGrid');
    const cartSection = document.getElementById('cartSection');
    
    if (row.classList.contains("checked")) {
      // Move to cart
      row.classList.add("moving");
      setTimeout(() => {
        if (cartGrid) {
          cartGrid.appendChild(row);
          cartSection.style.display = 'block';
        }
        row.classList.remove("moving");
        saveListToStorage();
      }, 300);
    } else {
      // Move back to list
      row.classList.add("moving");
      setTimeout(() => {
        if (DOM.listGrid) DOM.listGrid.appendChild(row);
        row.classList.remove("moving");
        // Hide cart section if empty
        if (cartGrid && cartGrid.children.length === 0) {
          cartSection.style.display = 'none';
        }
        saveListToStorage();
      }, 300);
    }
  });

  if (DOM.listGrid) DOM.listGrid.appendChild(row);
  
  // Attach long press handler for context menu
  attachLongPressToItem(row);
  
  if (!skipSave) {
    saveListToStorage();
  }
  renderAllPrices();
  renderTotal();
  return row;
}

// ===== compute total (now price * quantity) =====
function computeTotalFromDOM() {
  let total = 0;
  const items = DOM.listGrid?.querySelectorAll('.item') || [];
  
  for (const el of items) {
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
  }
  return total;
}

// renderTotal unchanged except it calls computeTotalFromDOM
function renderTotal() {
  if (!DOM.totalAmount) return;
  const total = computeTotalFromDOM();
  const display = Number.isInteger(total) ? `${total} ₪` : `${total.toFixed(2)} ₪`;
  DOM.totalAmount.textContent = display;
  
  // Calculate cart total
  renderCartTotal();
}

function renderCartTotal() {
  const cartTotalEl = document.getElementById('cartTotalAmount');
  if (!cartTotalEl) return;
  
  const cartGrid = document.getElementById('cartGrid');
  if (!cartGrid) return;
  
  let cartTotal = 0;
  const cartItems = cartGrid.querySelectorAll('.item');
  cartItems.forEach(el => {
    const name = el.querySelector('.name')?.textContent.split(' ').slice(1).join(' ') || '';
    const price = getPriceForItem(name);
    const qtyText = el.querySelector('.qty')?.textContent || '1';
    const qty = parseFloat(qtyText.split(' ')[0]) || 1;
    if (price) cartTotal += parseFloat(price) * qty;
  });
  
  const display = Number.isInteger(cartTotal) ? `${cartTotal} ₪` : `${cartTotal.toFixed(2)} ₪`;
  cartTotalEl.textContent = display;
}


/* ====== load choose items ====== */
function loadDefaultChooseItems() {
  if (!DOM.chooseGrid) return;
  DOM.chooseGrid.innerHTML = "";

  // Organized items by categories
  const categorizedItems = {
    'פירות וירקות': [
      { name:"גזר",icon:"🥕",unit:"ק\"ג" },
      { name:"מלפפונים",icon:"https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"עגבניות",icon:"https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"חסה",icon:"🥬",unit:"יח'" },
      { name:"בצל",icon:"🧅",unit:"ק\"ג" },
      { name:"שום",icon:"🧄",unit:"אריזה" },
      { name:"תפוחי אדמה",icon:"https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"תפוחים",icon:"https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"בננות",icon:"https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"תפוזים",icon:"https://images.unsplash.com/photo-1557800636-894a64c1696f?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"לימונים",icon:"https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"אבוקדו",icon:"https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"פלפלים",icon:"https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"ברוקולי",icon:"https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"כרובית",icon:"🥦",unit:"יח'" },
      { name:"תירס",icon:"🌽",unit:"יח'" },
      { name:"חציל",icon:"🍆",unit:"ק\"ג" },
      { name:"דלעת",icon:"🎃",unit:"ק\"ג" },
      { name:"תותים",icon:"https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"ענבים",icon:"🍇",unit:"ק\"ג" },
      { name:"אבטיח",icon:"🍉",unit:"יח'" },
      { name:"מלון",icon:"🍈",unit:"יח'" },
      { name:"בטטה",icon:"🍠",unit:"ק\"ג" },
      { name:"זוקיני",icon:"🥒",unit:"ק\"ג" },
      { name:"כרוב",icon:"🥬",unit:"יח'" },
      { name:"סלק",icon:"🥕",unit:"ק\"ג" },
      { name:"פלפל חריף",icon:"🌶️",unit:"יח'" },
      { name:"קישואים",icon:"🥒",unit:"ק\"ג" },
      { name:"שומר",icon:"🥬",unit:"יח'" },
      { name:"קלמנטינה",icon:"🍊",unit:"ק\"ג" },
      { name:"אשכולית",icon:"🍊",unit:"יח'" },
      { name:"אפרסק",icon:"🍑",unit:"ק\"ג" },
      { name:"נקטרינה",icon:"🍑",unit:"ק\"ג" },
      { name:"מנגו",icon:"🥭",unit:"יח'" },
      { name:"שזיף",icon:"🍇",unit:"ק\"ג" },
      { name:"אגסים",icon:"🍐",unit:"ק\"ג" },
      { name:"קיווי",icon:"🥝",unit:"יח'" },
      { name:"רימון",icon:"🍎",unit:"יח'" },
      { name:"אננס",icon:"🍍",unit:"יח'" },
      { name:"אוכמניות",icon:"🫐",unit:"אריזה" },
      { name:"תאנים",icon:"🍇",unit:"ק\"ג" },
      { name:"לימון ליים",icon:"🍋",unit:"יח'" },
      { name:"תמרים",icon:"🌰",unit:"אריזה" },
      { name:"בצל ירוק",icon:"🧅",unit:"אגד" },
      { name:"פטרוזיליה",icon:"🌿",unit:"אגד" },
      { name:"כוסברה",icon:"🌿",unit:"אגד" },
      { name:"עירית",icon:"🌿",unit:"אגד" },
      { name:"סלרי",icon:"🥬",unit:"אגד" },
      { name:"פטריות",icon:"🍄",unit:"אריזה" },
      { name:"תרד",icon:"🥬",unit:"אריזה" },
      { name:"נבטים",icon:"🌱",unit:"אריזה" },
      { name:"קייל",icon:"🥬",unit:"אריזה" },
      { name:"ג'ינג'ר",icon:"🫚",unit:"ק\"ג" },
      { name:"נענע",icon:"🌿",unit:"אגד" },
      { name:"בזיליקום",icon:"🌿",unit:"אגד" },
      { name:"לוף",icon:"🥒",unit:"יח'" }
    ],
    'מוצרי חלב': [
      { name:"חלב",icon:"https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"גבינה צהובה",icon:"https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"גבינה לבנה",icon:"https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"קוטג'",icon:"https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"יוגורט",icon:"https://images.unsplash.com/photo-1571212515416-fca4cf74065c?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"שמנת",icon:"🥛",unit:"אריזה" },
      { name:"חמאה",icon:"https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"ביצים",icon:"https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"חלב שקדים",icon:"🥛",unit:"ליטר" },
      { name:"חלב סויה",icon:"🥛",unit:"ליטר" },
      { name:"משקה יוגורט",icon:"🥛",unit:"יח'" },
      { name:"מעדני חלב",icon:"🍮",unit:"יח'" },
      { name:"גבינת שמנת",icon:"🧀",unit:"אריזה" },
      { name:"גבינה קשה",icon:"🧀",unit:"ק\"ג" },
      { name:"מרגרינה",icon:"🧈",unit:"אריזה" }
    ],
    'מאפים ולחמים': [
      { name:"לחם",icon:"https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"חלה",icon:"https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"לחמניות",icon:"https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"פיתות",icon:"https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"טורטייה",icon:"🌯",unit:"אריזה" },
      { name:"בייגל",icon:"https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"קרואסון",icon:"https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"עוגיות",icon:"https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"עוגה",icon:"🎂",unit:"יח'" },
      { name:"בורקס",icon:"🥐",unit:"אריזה" },
      { name:"פריכיות",icon:"🍪",unit:"אריזה" }
    ],
    'בשר ועופות': [
      { name:"חזה עוף",icon:"https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"שניצל",icon:"https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"כרעיים עוף",icon:"https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"עוף שלם",icon:"https://images.unsplash.com/photo-1548940740-204726a19be3?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"בשר טחון",icon:"https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"אנטריקוט",icon:"https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"סטייק",icon:"https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"נקניקיות",icon:"https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"נקניק",icon:"🌭",unit:"ק\"ג" },
      { name:"קבב",icon:"🥩",unit:"ק\"ג" }
    ],
    'דגים': [
      { name:"סלמון",icon:"https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"טונה",icon:"https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?w=400&h=400&fit=crop&crop=center",unit:"קופסא" },
      { name:"דניס",icon:"https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"בורי",icon:"https://images.unsplash.com/photo-1544943910-4c1dc44aab44?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"פילה דג",icon:"https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"שרימפס",icon:"https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" }
    ],
    'מזווה ויבשים': [
      { name:"אורז",icon:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"אורז מלא",icon:"https://images.unsplash.com/photo-1588164505175-ed40d0e1fad5?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"אורז בסמטי",icon:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"אורז יסמין",icon:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"פסטה",icon:"https://images.unsplash.com/photo-1621996346565-e3dbc6d2c5f7?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"קוסקוס",icon:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"בורגול",icon:"🍚",unit:"ק\"ג" },
      { name:"קמח",icon:"https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"סוכר",icon:"https://images.unsplash.com/photo-1587735243615-c03f25aaff15?w=400&h=400&fit=crop&crop=center",unit:"ק\"ג" },
      { name:"מלח",icon:"https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"שמן",icon:"https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"שמן זית",icon:"https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"קטשופ",icon:"https://images.unsplash.com/photo-1571104508999-893933ded431?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מיונז",icon:"🥚",unit:"צנצנת" },
      { name:"חומוס",icon:"https://images.unsplash.com/photo-1571197119864-3b45d1ae2ab6?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"טחינה",icon:"🥫",unit:"צנצנת" },
      { name:"ריבה",icon:"https://images.unsplash.com/photo-1573774254737-6fc2181b2e26?w=400&h=400&fit=crop&crop=center",unit:"צנצנת" },
      { name:"דבש",icon:"https://images.unsplash.com/photo-1587049016823-d69e4bd3ba16?w=400&h=400&fit=crop&crop=center",unit:"צנצנת" },
      { name:"שוקולד ממרח",icon:"https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=400&h=400&fit=crop&crop=center",unit:"צנצנת" },
      { name:"קפה",icon:"https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"תה",icon:"https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"אבקת קקאו",icon:"☕",unit:"אריזה" },
      { name:"רוטב סויה",icon:"🥫",unit:"בקבוק" },
      { name:"רוטב צ'ילי",icon:"🌶️",unit:"בקבוק" },
      { name:"רוטב טריאקי",icon:"🥫",unit:"בקבוק" },
      { name:"רטבים לסלט",icon:"🥗",unit:"בקבוק" },
      { name:"חרדל",icon:"🥫",unit:"צנצנת" },
      { name:"חומץ",icon:"🫒",unit:"בקבוק" },
      { name:"קוואקר",icon:"https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"תבלינים",icon:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center",unit:"צנצנת" },
      { name:"סילאן",icon:"🍯",unit:"בקבוק" },
      { name:"מוזלי",icon:"🥣",unit:"אריזה" },
      { name:"גרנולה",icon:"https://images.unsplash.com/photo-1571197119864-3b45d1ae2ab6?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"שוקולית",icon:"🍫",unit:"בקבוק" },
      { name:"קקאו",icon:"☕",unit:"אריזה" },
      { name:"אבקת אפייה",icon:"🧂",unit:"אריזה" },
      { name:"סודה לשתייה",icon:"🧂",unit:"אריזה" },
      { name:"שמרים",icon:"🍞",unit:"אריזה" },
      { name:"תחליף סוכר",icon:"🧂",unit:"אריזה" },
      { name:"פצפוצי אורז",icon:"🍚",unit:"אריזה" },
      { name:"נייר אפייה",icon:"📄",unit:"גליל" },
      { name:"שקיות זילוף",icon:"📦",unit:"אריזה" },
      { name:"סוכריות צבעוניות",icon:"🍭",unit:"אריזה" },
      { name:"קוקוס",icon:"🥥",unit:"אריזה" },
      { name:"אינסטנט פודינג",icon:"🍮",unit:"אריזה" }
    ],
    'משקאות': [
      { name:"מים",icon:"https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מים נביעות הגולן 1.5L",icon:"https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מים עין גדי 1.5L",icon:"https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מיץ",icon:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"מיץ פרימור 1L",icon:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"מיץ טרופיקנה 1L",icon:"https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"קולה",icon:"https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400&h=400&fit=crop&crop=center",unit:"ליטר" },
      { name:"קוקה קולה 1.5L",icon:"https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"פפסי 1.5L",icon:"https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"פחית קולה",icon:"https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"בירה",icon:"https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"בירה גולדסטאר",icon:"https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"בירה קרלסברג",icon:"https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"יין",icon:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"יין ברקן",icon:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"יין כרמל",icon:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"יין גולן",icon:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"אלכוהול",icon:"🥃",unit:"בקבוק" }
    ],
    'חטיפים וממתקים': [
      { name:"שוקולד",icon:"https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"שוקולד מילקה",icon:"https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"שוקולד קינדר",icon:"https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"ביסלי",icon:"https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=400&h=400&fit=crop&crop=center",unit:"שקית" },
      { name:"במבה",icon:"https://images.unsplash.com/photo-1613759547017-89ef4a6cf70e?w=400&h=400&fit=crop&crop=center",unit:"שקית" },
      { name:"במבה אסם",icon:"https://images.unsplash.com/photo-1613759547017-89ef4a6cf70e?w=400&h=400&fit=crop&crop=center",unit:"שקית" },
      { name:"דובונים",icon:"https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&h=400&fit=crop&crop=center",unit:"שקית" },
      { name:"סוכריות",icon:"https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&h=400&fit=crop&crop=center",unit:"שקית" },
      { name:"גלידה",icon:"https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"גלידה בן אנד ג'ריס",icon:"https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"גלידה שטראוס",icon:"https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"עוגיות",icon:"https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"עוגיות לוטוס",icon:"https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"פופקורן",icon:"https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"חטיף אנרגיה",icon:"🍫",unit:"יח'" },
      { name:"אגוזים",icon:"https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&h=400&fit=crop&crop=center",unit:"שקית" }
    ],
    'מוצרי ניקיון': [
      { name:"נייר טואלט",icon:"https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"מגבות נייר",icon:"https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"סבון כלים",icon:"https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"אבקת כביסה",icon:"https://images.unsplash.com/photo-1582719471137-c3967ffb5de8?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"מרכך כביסה",icon:"https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"אקונומיקה",icon:"🧴",unit:"בקבוק" },
      { name:"שקיות זבל",icon:"🗑️",unit:"אריזה" },
      { name:"ספוג",icon:"https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"מטליות",icon:"🧽",unit:"אריזה" },
      { name:"סבון רצפה",icon:"https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מגבונים",icon:"🧻",unit:"אריזה" },
      { name:"תרסיס לניקוי וחיטוי",icon:"🧴",unit:"בקבוק" },
      { name:"נוזל רצפות",icon:"🧴",unit:"בקבוק" },
      { name:"גל לכביסה",icon:"🧴",unit:"בקבוק" },
      { name:"חומר למדיח כלים",icon:"📦",unit:"אריזה" },
      { name:"סמרטוט רצפה",icon:"🧽",unit:"יח'" },
      { name:"מטליות ניקוי",icon:"🧽",unit:"אריזה" },
      { name:"אלכוג'ל",icon:"🧴",unit:"בקבוק" }
    ],
    'מוצרי טיפוח': [
      { name:"סבון רחצה",icon:"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"שמפו",icon:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"מרכך שיער",icon:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",unit:"בקבוק" },
      { name:"משחת שיניים",icon:"https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"מברשת שיניים",icon:"https://images.unsplash.com/photo-1609137144813-7d9921338f24?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"דאודורנט",icon:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"תער",icon:"🪒",unit:"אריזה" },
      { name:"קרם לחות",icon:"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&crop=center",unit:"יח'" },
      { name:"טישו",icon:"https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=400&fit=crop&crop=center",unit:"אריזה" },
      { name:"פדים וטמפונים",icon:"🧻",unit:"אריזה" },
      { name:"סכיני גילוח",icon:"🪒",unit:"אריזה" },
      { name:"רצועות שעווה",icon:"🧴",unit:"אריזה" },
      { name:"גל וקצף גילוח",icon:"🧴",unit:"בקבוק" },
      { name:"קיסמי שיניים",icon:"🪥",unit:"אריזה" },
      { name:"קיסמי אוזניים",icon:"🧻",unit:"אריזה" },
      { name:"חוט דנטלי",icon:"🪥",unit:"יח'" }
    ],
    'מוצרי תינוק': [
      { name:"חיתולים",icon:"👶",unit:"אריזה" },
      { name:"חיתולי האגיס 4-9 ק\"ג",icon:"👶",unit:"אריזה" },
      { name:"חיתולי האגיס פרידום דריי מידה 5+",icon:"👶",unit:"אריזה" },
      { name:"חיתולי כיפי מידה 4",icon:"👶",unit:"אריזה" },
      { name:"חיתולי פרה מגה פק",icon:"👶",unit:"אריזה" },
      { name:"מזון תינוקות",icon:"🍼",unit:"יח'" },
      { name:"מטליות לחות",icon:"🧻",unit:"אריזה" },
      { name:"מטליות האגיס",icon:"🧻",unit:"אריזה" },
      { name:"קרם לתינוק",icon:"🧴",unit:"יח'" },
      { name:"שמפו לתינוק",icon:"🧴",unit:"בקבוק" }
    ],
    'קפואים': [
      { name:"גלידה",icon:"🍦",unit:"יח'" },
      { name:"ירקות קפואים",icon:"🧊",unit:"אריזה" },
      { name:"פיצה קפואה",icon:"🍕",unit:"יח'" },
      { name:"שניצל קפוא",icon:"🧊",unit:"אריזה" },
      { name:"דגים קפואים",icon:"🧊",unit:"אריזה" },
      { name:"בצק עלים",icon:"🧊",unit:"אריזה" },
      { name:"מוצרי סויה",icon:"🧊",unit:"אריזה" },
      { name:"אוכל מוכן קפוא",icon:"🧊",unit:"יח'" },
      { name:"לקט ירקות מוקפא",icon:"🧊",unit:"אריזה" },
      { name:"תבלינים מוקפאים",icon:"🧊",unit:"אריזה" },
      { name:"סלט חצילים",icon:"🍆",unit:"אריזה" },
      { name:"סלט פלפלים",icon:"🫑",unit:"אריזה" },
      { name:"סלט כרוב",icon:"🥬",unit:"אריזה" }
    ]
  };

  // Populate categoriesOrder and categories from categorizedItems
  categoriesOrder.length = 0; // Clear array
  Object.keys(categorizedItems).forEach(cat => {
    categoriesOrder.push(cat);
    categories[cat] = categorizedItems[cat].map(item => item.name);
  });

  // Load custom items and merge with default categories
  const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  
  // Group custom items by category
  const customByCategory = {};
  savedCustom.forEach(item => {
    const cat = item.category || 'פריטים מותאמים אישית';
    if (!customByCategory[cat]) customByCategory[cat] = [];
    customByCategory[cat].push(item);
  });

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();

  // Create categories with items and + button  
  Object.entries(categorizedItems).forEach(([categoryName, items]) => {
    const shouldCollapse = items.length > MOBILE_COLLAPSE_THRESHOLD;
    
    // Create category header
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'choose-category-header';
    categoryHeader.style.display = 'flex';
    categoryHeader.style.justifyContent = 'space-between';
    categoryHeader.style.alignItems = 'center';
    
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
    
    fragment.appendChild(categoryHeader);

    // Add default items for this category
    items.forEach((item, index) => {
      const itemElement = makeChooseButton(item);
      itemElement.setAttribute('data-category', categoryName);
      
      // Mobile collapse logic
      if (shouldCollapse && index >= MOBILE_VISIBLE_ITEMS) {
        itemElement.setAttribute('data-mobile-hidden', 'true');
        itemElement.classList.add('mobile-hidden', 'mobile-hidden-active');
      }
      
      fragment.appendChild(itemElement);
    });
    
    // Add custom items that belong to this category
    if (customByCategory[categoryName]) {
      customByCategory[categoryName].forEach((c, customIndex) => {
        const safe = { name: String(c.name || "").trim(), icon: String(c.icon || "🛒").trim(), unit: String(c.unit || "יח'").trim() };
        const customElement = makeChooseButton(safe);
        customElement.setAttribute('data-category', categoryName);
        
        // Apply mobile collapse logic to custom items too
        const totalIndex = items.length + customIndex;
        if (shouldCollapse && totalIndex >= MOBILE_VISIBLE_ITEMS) {
          customElement.setAttribute('data-mobile-hidden', 'true');
          customElement.classList.add('mobile-hidden', 'mobile-hidden-active');
        }
        
        fragment.appendChild(customElement);
      });
    }
    
    // Add "עוד" button for mobile if category is collapsible
    if (shouldCollapse) {
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'show-more-btn mobile-only';
      showMoreBtn.setAttribute('data-category', categoryName);
      showMoreBtn.innerHTML = '<span class="show-text">עוד ↓</span><span class="hide-text" style="display:none">פחות ↑</span>';
      showMoreBtn.style.cssText = `
        grid-column: 1 / -1;
        width: 100%;
        padding: 0.5rem;
        background: #4CAF50;
        border: 1px solid #4CAF50;
        color: white;
        border-radius: 8px;
        margin: 0.5rem 0 1rem 0;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      `;
      
      // Add hover effects
      showMoreBtn.addEventListener('mouseenter', () => {
        showMoreBtn.style.background = '#45a049';
        showMoreBtn.style.transform = 'translateY(-1px)';
        showMoreBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
      });
      
      showMoreBtn.addEventListener('mouseleave', () => {
        showMoreBtn.style.background = '#4CAF50';
        showMoreBtn.style.transform = 'translateY(0)';
        showMoreBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      });
      
      showMoreBtn.addEventListener('click', () => {
        const hiddenItems = Array.from(document.querySelectorAll(`[data-category="${categoryName}"][data-mobile-hidden="true"]`));
        const currentlyVisible = hiddenItems.filter(item => !item.classList.contains('mobile-hidden-active')).length;
        const totalHidden = hiddenItems.length;
        const showText = showMoreBtn.querySelector('.show-text');
        const hideText = showMoreBtn.querySelector('.hide-text');
        
        // Progressive reveal: show 5 more items each click
        const ITEMS_PER_CLICK = 5;
        const nextBatch = hiddenItems
          .filter(item => item.classList.contains('mobile-hidden-active'))
          .slice(0, ITEMS_PER_CLICK);
        
        if (nextBatch.length > 0) {
          // Show next batch
          nextBatch.forEach(item => {
            item.classList.remove('mobile-hidden-active');
            item.classList.add('mobile-visible');
          });
          
          // Check if there are more items to show
          const stillHidden = hiddenItems.filter(item => item.classList.contains('mobile-hidden-active')).length;
          if (stillHidden === 0) {
            // All items shown, change to "collapse" button
            showMoreBtn.classList.add('expanded');
            showText.style.display = 'none';
            hideText.style.display = 'inline';
          } else {
            // Update button text to show how many more items
            showText.textContent = `עוד ${stillHidden} ↓`;
          }
        } else {
          // Collapse all back to initial state
          showMoreBtn.classList.remove('expanded');
          hiddenItems.forEach(item => {
            item.classList.add('mobile-hidden-active');
            item.classList.remove('mobile-visible');
          });
          showText.style.display = 'inline';
          hideText.style.display = 'none';
          showText.textContent = 'עוד ↓';
        }
      });
      
      fragment.appendChild(showMoreBtn);
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
    
    fragment.appendChild(customHeader);
    
    customByCategory['פריטים מותאמים אישית'].forEach(c => {
      const safe = { name: String(c.name || "").trim(), icon: String(c.icon || "🛒").trim(), unit: String(c.unit || "יח'").trim() };
      fragment.appendChild(makeChooseButton(safe));
    });
  }
  
  // Append all items at once for better performance
  if (DOM.chooseGrid) DOM.chooseGrid.appendChild(fragment);
}

/* ====== list persistence with error handling ====== */
function saveListToStorage() {
  if (!DOM.listGrid) return;
  
  try {
    const items = [];
    const listItems = DOM.listGrid.querySelectorAll(".item");
    
    for (const el of listItems) {
      // Check if icon is stored in dataset (for images)
      let icon = el.dataset.icon;
      let pureName = "";
      
      if (!icon) {
        // Old method - parse from text
        const rawName = (el.querySelector(".name")?.textContent || "").trim();
        const nameParts = rawName.split(" ").map(p => p.trim()).filter(p => p !== "");
        icon = nameParts.length > 0 ? nameParts[0] : "🛒";
        pureName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
      } else {
        // Get name from textContent, removing icon
        const nameSpan = el.querySelector(".name");
        if (nameSpan) {
          // Check if it's an image icon or emoji
          const imgIcon = nameSpan.querySelector('.item-image-icon');
          if (imgIcon) {
            // Image icon - get text after the image (skip the image node)
            pureName = Array.from(nameSpan.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent)
              .join('')
              .trim();
          } else {
            // Emoji icon - remove the first emoji from the text
            const fullText = nameSpan.textContent.trim();
            // Split by spaces and remove the first part (icon)
            const parts = fullText.split(' ');
            pureName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
          }
        }
      }

      const rawQty = (el.querySelector(".qty")?.textContent || "").trim();
      const qtyParts = rawQty.split(" ").map(p => p.trim()).filter(p => p !== "");
      const qty = qtyParts.join(" ");

      const priceText = (el.querySelector(".price .amount")?.textContent || "").trim();
      const noteText = (el.querySelector(".item-note")?.value || "").trim();

      items.push({ icon, name: pureName, qty, price: priceText, checked: el.classList.contains("checked"), note: noteText });
    }

    const dataString = JSON.stringify(items);
    
    // Check localStorage quota before saving
    if (dataString.length > 5 * 1024 * 1024) { // 5MB limit warning
      console.warn('Shopping list data is getting large:', dataString.length / 1024, 'KB');
    }
    
    localStorage.setItem("shoppingList", dataString);
    
    if (typeof sortListByCategories === "function") sortListByCategories();
    renderTotal();
  } catch (error) {
    console.error('Error saving list to storage:', error);
    // Try to save a simplified version
    try {
      const simpleItems = Array.from(DOM.listGrid.querySelectorAll(".item")).map(el => ({
        icon: el.dataset.icon || '🛒',
        name: el.querySelector(".name")?.textContent?.trim() || 'Unknown',
        qty: el.querySelector(".qty")?.textContent?.trim() || '1',
        checked: el.classList.contains("checked")
      }));
      localStorage.setItem("shoppingList", JSON.stringify(simpleItems));
    } catch (fallbackError) {
      console.error('Failed to save simplified list:', fallbackError);
      showToast('שגיאה בשמירת הרשימה', 'error');
    }
  }
}

function loadListFromStorage(){
  const data = localStorage.getItem("shoppingList");
  if (!data) return;
  const items = JSON.parse(data);
  
  // CRITICAL: Initialize DOM FIRST before creating items
  DOM.init();
  
  const cartGrid = document.getElementById('cartGrid');
  const cartSection = document.getElementById('cartSection');
  let hasCheckedItems = false;
  
  items.forEach((item) => {
    const [num, ...rest] = (item.qty || "").split(" ");
    const unit = rest.join(" ");
    const priceMatch = (item.price || "").replace(/[^\d.]/g,'');
    const note = item.note || "";
    const row = createListItem(item.name, item.icon || "🛒", parseInt(num) || 1, unit || "יח'", true, priceMatch || null, note);
    
    if (item.checked) {
      row.classList.add("checked");
      // Move to cart
      if (cartGrid) {
        cartGrid.appendChild(row);
        hasCheckedItems = true;
      }
    }
  });
  
  // Show cart section if there are checked items
  if (cartSection && hasCheckedItems) {
    cartSection.style.display = 'block';
  }
  
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
  if (!DOM.listGrid) return;
  
  const items = Array.from(DOM.listGrid.querySelectorAll(".item"));
  DOM.listGrid.innerHTML = "";

  // First, add unchecked items sorted by categories
  categoriesOrder.forEach(category => {
    const productNames = categories[category] || [];
    const catItems = items.filter(el => {
      const pureName = el.querySelector(".name").textContent.split(" ").slice(1).join(" ");
      return productNames.includes(pureName) && !el.classList.contains("checked");
    });
    catItems.forEach(el => DOM.listGrid.appendChild(el));
  });

  // Then, add unchecked items that don't belong to any category
  const flatNames = Object.values(categories).flat();
  const others = items.filter(el => {
    const pureName = el.querySelector(".name").textContent.split(" ").slice(1).join(" ");
    return !flatNames.includes(pureName) && !el.classList.contains("checked");
  });
  others.forEach(el => DOM.listGrid.appendChild(el));

  // Finally, add all checked items at the end
  const checkedItems = items.filter(el => el.classList.contains("checked"));
  checkedItems.forEach(el => DOM.listGrid.appendChild(el));
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
    if (map) showToast('בחירת חנות נשמרה ומחירים נטענו 🛒', 'success');
    else showToast('בחירת חנות נשמרה אך לא נמצאו מחירים לסניף זה', 'info');
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
  localStorage.setItem("shoppingList", "[]"); // מוחק את הרשימה מהאחסון
  resetChoiceBadges();
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

// Smart icon detection based on item name
function detectIcon(itemName) {
  const name = itemName.toLowerCase().trim();
  
  // Icon mapping with keywords
  const iconMap = {
    // פירות
    '🍎': ['תפוח'],
    '🍊': ['תפוז', 'אשכולית'],
    '🍋': ['לימון'],
    '🍌': ['בננה'],
    '🍉': ['אבטיח'],
    '🍇': ['ענב', 'ענבים'],
    '🍓': ['תות'],
    '🥝': ['כיווי', 'קיווי'],
    '🍑': ['אפרסק'],
    '🥭': ['מנגו'],
    '🍍': ['אננס'],
    
    // ירקות
    '🥕': ['גזר'],
    '🥒': ['מלפפון'],
    '🍅': ['עגבני', 'עגבניות'],
    '🥬': ['חסה', 'סלט', 'כרוב'],
    '🧅': ['בצל'],
    '🧄': ['שום'],
    '🌶️': ['פלפל חריף'],
    '🫑': ['פלפל'],
    '🥦': ['ברוקולי'],
    '🥔': ['תפוח אדמה', 'תפו"א'],
    '🍆': ['חציל'],
    '🌽': ['תירס'],
    
    // חלב וביצים
    '🥛': ['חלב'],
    '🧈': ['חמאה', 'חמא'],
    '🧀': ['גבינה', 'גבינת', 'קוטג', 'צהובה', 'בולגרית'],
    '🥚': ['ביצים', 'ביצה'],
    '🍦': ['גלידה'],
    
    // לחמים ומאפים
    '🍞': ['לחם', 'לחמנ'],
    '🥐': ['קרואסון'],
    '🥖': ['בגט'],
    '🥯': ['בייגל'],
    '🧇': ['וופל'],
    '🥞': ['פנקייק'],
    '🍕': ['פיצה'],
    '🍰': ['עוגה', 'עוגת'],
    '🧁': ['מאפין', 'קאפקייק'],
    '🍪': ['עוגיות', 'עוגייה', 'ביסקוויט'],
    
    // בשר ודגים
    '🍗': ['עוף', 'שניצל', 'כרעיים'],
    '🥩': ['בשר', 'סטייק', 'אנטריקוט'],
    '🍖': ['צלי'],
    '🥓': ['בייקון'],
    '🌭': ['נקניק'],
    '🍤': ['שרימפ', 'פירות ים'],
    '🐟': ['דג', 'סלמון', 'טונה', 'פילה'],
    
    // משקאות
    '☕': ['קפה', 'נסקפה'],
    '🍵': ['תה'],
    '🥤': ['קולה', 'פפסי', 'משקה', 'סודה'],
    '🧃': ['מיץ'],
    '🍾': ['שמפניה'],
    '🍷': ['יין'],
    '🍺': ['בירה'],
    '🥛': ['חלב', 'משקה חלב'],
    
    // חטיפים
    '🍫': ['שוקולד'],
    '🍬': ['סוכריות', 'ממתק'],
    '🍭': ['סוכרייה'],
    '🍿': ['פופקורן'],
    '🥜': ['בוטנים', 'אגוזים'],
    
    // אחר
    '🍚': ['אורז'],
    '🍝': ['פסטה', 'ספגטי', 'מקרונ'],
    '🥫': ['שימור', 'קופסת שימורים', 'קונסרב'],
    '🍯': ['דבש'],
    '🧂': ['מלח'],
    '🧈': ['חמאה'],
    '🥄': ['כף'],
    '🍽️': ['צלחת'],
    
    // ניקיון וטיפוח
    '🧻': ['נייר טואלט', 'נייר'],
    '🧽': ['ספוג'],
    '🧴': ['סבון', 'שמפו', 'מרכך', 'ג\'ל'],
    '🧹': ['מטאטא', 'ניקיון'],
    '🧺': ['כביסה'],
    '🪥': ['מברשת שיניים'],
    '🪒': ['תער'],
    
    // תינוק
    '🍼': ['בקבוק תינוק', 'מזון תינוק'],
    '👶': ['חיתול', 'תינוק']
  };
  
  // Check each icon's keywords
  for (const [icon, keywords] of Object.entries(iconMap)) {
    for (const keyword of keywords) {
      if (name.includes(keyword)) {
        return icon;
      }
    }
  }
  
  // Default icons by category
  const category = detectCategory(itemName);
  const categoryDefaultIcons = {
    'פירות וירקות': '🥬',
    'מוצרי חלב': '🥛',
    'מאפים ולחמים': '🍞',
    'בשר ועופות': '🍗',
    'דגים': '🐟',
    'מזווה ויבשים': '🥫',
    'משקאות': '🥤',
    'חטיפים וממתקים': '🍫',
    'מוצרי ניקיון': '🧹',
    'מוצרי טיפוח': '🧴',
    'מוצרי תינוק': '🍼',
    'קפואים': '🧊'
  };
  
  return category ? categoryDefaultIcons[category] || '🛒' : '🛒';
}

// Global variable to store pending custom item data
let pendingCustomItem = null;

async function addCustomItem(suggestedCategory = null){
  if (DEBUG_MODE) console.log('addCustomItem called with suggestedCategory:', suggestedCategory);
  const rawName = await customPrompt("הכנס שם פריט חדש:");
  if (!rawName) return;
  const name = String(rawName).trim();
  const unit = String(await customPrompt("הכנס יחידת מידה (למשל: ק\"ג, יח', ליטר):", "יח'") || "יח'").trim();
  
  // Detect category or use suggested one
  let targetCategory = suggestedCategory;
  if (DEBUG_MODE) console.log('targetCategory before detection:', targetCategory);
  if (!targetCategory) {
    targetCategory = detectCategory(name);
  }
  
  // If no category detected or suggested, ask user
  if (!targetCategory) {
    const categories = ['פירות וירקות', 'מוצרי חלב', 'מאפים ולחמים', 'בשר ועופות', 'דגים', 
                       'מזווה ייבשים', 'משקאות', 'חטיפים וממתקים', 'מוצרי ניקיון', 
                       'מוצרי טיפוח', 'מוצרי תינוק', 'קפואים', 'פריטים מותאמים אישית'];
    const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const choice = await customPrompt(`לאיזו קטגוריה להוסיף את "${name}"?\n\n${categoryList}\n\nהכנס מספר (או אישור לקטגוריה מותאמת אישית):`, String(categories.length));
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
      const choice = await customPrompt(`לאיזו קטגוריה להוסיף את "${name}"?\n\n${categoryList}\n\nהכנס מספר:`, '1');
      if (!choice) return;
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < categories.length) {
        targetCategory = categories[index];
      } else {
        targetCategory = 'פריטים מותאמים אישית';
      }
    }
  }
  
  if (DEBUG_MODE) console.log('Final targetCategory:', targetCategory);
  
  // Try to detect icon automatically
  const detectedIcon = detectIcon(name);
  
  // Ask user if they want to use the detected icon or choose manually
  const useDetected = confirm(`זיהינו את האייקון ${detectedIcon} עבור "${name}".\n\nלחץ אישור להשתמש באייקון זה, או ביטול לבחור אייקון אחר.`);
  
  if (useDetected) {
    // Use detected icon directly
    finishAddingCustomItem(detectedIcon);
  } else {
    // Store pending item data and open icon picker for manual selection
    pendingCustomItem = { name, unit, category: targetCategory };
    openIconPickerForCustomItem();
  }
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
  if (DEBUG_MODE) console.log('Finishing custom item with icon:', icon, 'category:', category);
  
  // Add to list
  createListItem(name, icon, 1, unit);
  
  // Save to appropriate category
  const saved = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
  if (!saved.some(it => String(it.name || "").trim().toLowerCase() === name.toLowerCase())) {
    const newItem = { name, icon, unit, category: category };
    if (DEBUG_MODE) console.log('Saving new item:', newItem);
    saved.push(newItem);
    localStorage.setItem('customChooseItems', JSON.stringify(saved));
    if (DEBUG_MODE) console.log('customChooseItems after save:', JSON.parse(localStorage.getItem('customChooseItems')));
  }
  
  // Reload choose items to show in correct category
  loadDefaultChooseItems();
  
  // Clear pending item
  pendingCustomItem = null;
  
  saveListToStorage();
  renderAllPrices();
  renderTotal();
}

/* ====== Barcode Scanner ====== */
let barcodeScanner = null;

function startBarcodeScanner() {
  const modal = document.getElementById('barcodeScannerModal');
  const viewport = document.getElementById('barcodeScannerViewport');
  
  if (!modal || !viewport) {
    alert('שגיאה: לא נמצא אלמנט הסורק');
    return;
  }
  
  // בדיקה אם הספרייה נטענה
  if (typeof Quagga === 'undefined') {
    alert('שגיאה: ספריית הסריקה לא נטענה. נסה לרענן את הדף.');
    return;
  }
  
  // בדיקת HTTPS (נדרש ב-iOS)
  const isSecure = window.location.protocol === 'https:' || 
                   window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1';
  
  if (!isSecure) {
    alert('⚠️ דרושה גישה מאובטחת!\n\nסורק הברקודים דורש HTTPS.\n\nפתרונות:\n1. העלה לשרת עם HTTPS\n2. השתמש ב-localhost\n3. השתמש ב-ngrok או Cloudflare Tunnel');
    return;
  }
  
  // בדיקה אם יש תמיכה במצלמה
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('⚠️ הדפדפן לא תומך בגישה למצלמה.\n\nוודא שאתה משתמש בדפדפן מעודכן (Safari, Chrome).');
    return;
  }
  
  modal.style.display = 'flex';
  viewport.innerHTML = ''; // נקה תוכן קודם
  
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: viewport,
      constraints: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "environment" // מצלמה אחורית
      }
    },
    decoder: {
      readers: [
        "ean_reader",      // EAN-13 (הכי נפוץ בישראל)
        "ean_8_reader",    // EAN-8
        "code_128_reader", // Code 128
        "code_39_reader",  // Code 39
        "upc_reader"       // UPC
      ],
      debug: {
        drawBoundingBox: true,
        showFrequency: false,
        drawScanline: true,
        showPattern: false
      }
    },
    locate: true,
    numOfWorkers: navigator.hardwareConcurrency || 4,
    frequency: 10
  }, function(err) {
    if (err) {
      console.error("Barcode scanner initialization error:", err);
      modal.style.display = 'none';
      
      // הודעת שגיאה מפורטת
      let errorMsg = '❌ לא ניתן לפתוח מצלמה\n\n';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg += 'הרשאת מצלמה נדחתה.\n\nפתרון:\n';
        errorMsg += '1. הגדרות Safari → מצלמה → אפשר\n';
        errorMsg += '2. רענן את הדף\n';
        errorMsg += '3. נסה שוב';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg += 'לא נמצאה מצלמה במכשיר.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg += 'המצלמה בשימוש על ידי אפליקציה אחרת.\n\nסגור אפליקציות אחרות ונסה שוב.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        errorMsg += 'הגדרות המצלמה אינן נתמכות.\n\nנסה דפדפן אחר.';
      } else {
        errorMsg += 'שגיאה: ' + (err.message || err.name || 'לא ידועה');
        errorMsg += '\n\nוודא:\n';
        errorMsg += '• האתר ב-HTTPS\n';
        errorMsg += '• נתת הרשאת מצלמה\n';
        errorMsg += '• המצלמה לא בשימוש';
      }
      
      alert(errorMsg);
      return;
    }
    
    if (DEBUG_MODE) console.log("Barcode scanner initialized successfully");
    Quagga.start();
  });

  // כשברקוד מזוהה:
  Quagga.onDetected(handleBarcodeDetected);
  
  barcodeScanner = true;
}

function stopBarcodeScanner() {
  if (barcodeScanner && typeof Quagga !== 'undefined') {
    Quagga.offDetected(handleBarcodeDetected);
    Quagga.stop();
    barcodeScanner = null;
  }
  const modal = document.getElementById('barcodeScannerModal');
  if (modal) modal.style.display = 'none';
}

function handleBarcodeDetected(result) {
  if (!result || !result.codeResult) return;
  
  const barcode = result.codeResult.code;
  if (DEBUG_MODE) console.log("Barcode detected:", barcode);
  
  // עצור סריקה
  stopBarcodeScanner();
  
  // חפש מוצר לפי ברקוד
  fetchProductByBarcode(barcode)
    .then(product => {
      if (product) {
        // הוסף לרשימה
        createListItem(product.name, product.icon, 1, product.unit);
        saveListToStorage();
        renderAllPrices();
        renderTotal();
        showToast(`✅ נוסף: ${product.name}` + (product.price ? ` - ${product.price}₪` : ''), 'success');
      } else {
        showToast(`ברקוד ${barcode} לא נמצא במערכת`, 'warning', 4000);
      }
    })
    .catch(err => {
      console.error("Error fetching product:", err);
      showToast(`שגיאה בחיפוש מוצר`, 'error');
    });
}

async function fetchProductByBarcode(barcode) {
  const network = localStorage.getItem('selectedNetwork') || 'shufersal';
  const url = `${WORKER_URL}/product/${encodeURIComponent(network)}/${encodeURIComponent(barcode)}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (DEBUG_MODE) console.log(`Product not found for barcode: ${barcode}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch product by barcode:", err);
    return null;
  }
}

/* ====== Voice Input ====== */
let recognition = null;
let isListening = false;
let noSpeechTimeout = null;

function startVoiceInput() {
  // Check for Web Speech API support
  const hasWebSpeech = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
  
  if (!hasWebSpeech) {
    alert('⚠️ הדפדפן לא תומך בזיהוי דיבור.\n\n' +
          '✅ Chrome - תמיכה מלאה\n' +
          '✅ Edge - תמיכה מלאה\n' +
          '⚠️ Safari iOS - אין תמיכה\n' +
          '⚠️ Safari macOS - תמיכה חלקית\n\n' +
          'מומלץ להשתמש ב-Chrome על מכשיר Android או Windows.');
    return;
  }

  // Detect Safari iOS (which has very limited support)
  const isSafariIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && 
                      /Safari/.test(navigator.userAgent) && 
                      !(/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
  
  if (isSafariIOS) {
    alert('⚠️ Safari על iPhone אינו תומך בזיהוי דיבור!\n\n' +
          'פתרונות:\n' +
          '1. התקן את דפדפן Chrome על iPhone\n' +
          '2. פתח את האתר דרך Chrome\n' +
          '3. לחץ על כפתור 🎤 שוב\n\n' +
          'או השתמש בסורק הברקוד במקום 📷');
    return;
  }

  const voiceBtn = document.getElementById('btnVoiceInput');
  
  if (isListening) {
    // Stop listening
    if (DEBUG_MODE) console.log('🛑 User stopped listening manually');
    
    if (recognition) {
      recognition.stop();
    }
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.textContent = '🎤';
    
    return;
  }

  // Check for HTTPS
  const isSecure = window.location.protocol === 'https:' || 
                   window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1';
  
  if (!isSecure) {
    alert('⚠️ דרושה גישה מאובטחת!\n\nזיהוי דיבור דורש HTTPS.\n\nפתח את האתר דרך:\nhttps://hamalci.github.io/shopping-list/');
    return;
  }

  // Test microphone permission first
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then(result => {
      if (DEBUG_MODE) console.log('🎤 Microphone permission:', result.state);
      if (result.state === 'denied') {
        alert('🔒 המיקרופון חסום!\n\n' +
              'לפתוח:\n' +
              '1. לחץ על 🔒 בשורת הכתובת\n' +
              '2. מצא "מיקרופון"\n' +
              '3. בחר "אפשר"\n' +
              '4. רענן את הדף');
        return;
      }
    }).catch(e => {
      if (DEBUG_MODE) console.log('Permission API not supported:', e);
    });
  }

  // Initialize recognition - must be sync with user gesture
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.lang = 'he-IL'; // Hebrew first, will fallback if needed
  recognition.continuous = false; // SIMPLE: One phrase at a time - fast and reliable
  recognition.interimResults = false; // Only final results - no confusion
  recognition.maxAlternatives = 5; // Get more alternatives

  // Add event handlers BEFORE starting
  recognition.onstart = () => {
    if (DEBUG_MODE) console.log('🎤 Recognition started - speak now!');
    isListening = true;
    voiceBtn.classList.add('listening');
    voiceBtn.textContent = '🔴';
    
    // Set timeout for no speech detected
    noSpeechTimeout = setTimeout(() => {
      if (isListening) {
        if (DEBUG_MODE) console.log('⏱️ Timeout: No speech detected');
        recognition.stop();
        alert('⏱️ לא זוהה דיבור!\n\n' +
              'טיפים:\n' +
              '1. דבר קרוב למיקרופון\n' +
              '2. דבר בקול רם וברור\n' +
              '3. נסה להגיד: "חלב" או "לחם"\n' +
              '4. ודא שהמיקרופון עובד במכשיר\n\n' +
              '💡 אפשר גם להקליד או לסרוק ברקוד 📷');
      }
    }, 8000); // 8 seconds timeout
  };

  recognition.onspeechstart = () => {
    if (DEBUG_MODE) console.log('🗣️ Speech detected!');
    // Clear timeout when speech is detected
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      noSpeechTimeout = null;
    }
  };

  recognition.onresult = (event) => {
    if (DEBUG_MODE) console.log('📝 Voice recognized!');
    
    // Get the final transcript
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    transcript = transcript.trim();
    
    if (DEBUG_MODE) console.log('✅ Recognized text:', transcript);
    
    // Clear no-speech timeout
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      noSpeechTimeout = null;
    }
    
    // Stop recognition
    recognition.stop();
    isListening = false;
    
    // Search for the product
    const product = findProductByVoice(transcript);
    
    if (product) {
      // Show success feedback
      voiceBtn.textContent = '✅';
      voiceBtn.classList.remove('listening');
      
      // Create the item
      createListItem(product.name, product.icon, 1, product.unit);
      
      // Reset button after delay
      setTimeout(() => {
        voiceBtn.textContent = '🎤';
      }, 1500);
      
    } else {
      // Product not found - add as custom item
      voiceBtn.textContent = '❓';
      voiceBtn.classList.remove('listening');
      
      setTimeout(() => {
        if (confirm(`לא מצאתי "${transcript}" ברשימה.\n\nהאם להוסיף כפריט חדש?`)) {
          const icon = detectIconByName(transcript);
          
          // Save to custom items in localStorage
          const savedCustom = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
          const newItem = {
            name: transcript,
            icon: icon,
            unit: 'יח\'',
            category: 'פריטים מותאמים אישית'
          };
          
          // Check if item already exists
          const exists = savedCustom.some(item => item.name === transcript);
          if (!exists) {
            savedCustom.push(newItem);
            localStorage.setItem('customChooseItems', JSON.stringify(savedCustom));
            
            // Reload choose grid to show new item
            loadDefaultChooseItems();
            
            if (DEBUG_MODE) console.log(`✅ המוצר "${transcript}" נשמר בקטגוריות`);
          }
          
          // Add to shopping list
          createListItem(transcript, icon, 1, 'יח\'');
        }
        voiceBtn.textContent = '🎤';
      }, 100);
    }
  };

  recognition.onerror = (event) => {
    console.error('Voice recognition error:', event.error);
    
    // Clear timeout
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      noSpeechTimeout = null;
    }
    
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.textContent = '🎤';
    
    let errorMsg = '❌ שגיאה בזיהוי דיבור\n\n';
    
    // Check if Safari
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    switch (event.error) {
      case 'not-allowed':
      case 'permission-denied':
      case 'service-not-allowed':
        if (isSafari) {
          errorMsg += '🍎 Safari אינו תומך בזיהוי דיבור!\n\n';
          errorMsg += 'פתרונות:\n';
          errorMsg += '1. התקן Chrome על iPhone/iPad\n';
          errorMsg += '2. פתח דרך Chrome במקום Safari\n';
          errorMsg += '3. השתמש בסורק ברקוד � במקום\n\n';
          errorMsg += 'Chrome זמין בחינם ב-App Store';
        } else {
          errorMsg += '�🔒 גישה למיקרופון נדחתה!\n\n';
          errorMsg += 'פתרונות:\n';
          errorMsg += '1. בדפדפן: לחץ על סמל המנעול 🔒 ליד הכתובת\n';
          errorMsg += '2. בחר "הגדרות אתר" / "Site Settings"\n';
          errorMsg += '3. אפשר גישה למיקרופון\n';
          errorMsg += '4. רענן את הדף';
        }
        break;
      case 'no-speech':
        errorMsg += 'לא זוהה דיבור.\n\nנסה שוב ודבר בבירור.';
        break;
      case 'network':
        errorMsg += 'בעיית רשת.\n\nבדוק את החיבור לאינטרנט.';
        break;
      default:
        errorMsg += `שגיאה: ${event.error}\n\n`;
        if (isSafari) {
          errorMsg += 'Safari יכול לא לתמוך בזיהוי דיבור.\nנסה Chrome במקום.';
        }
    }
    
    alert(errorMsg);
  };

  recognition.onend = () => {
    // Clear timeouts
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      noSpeechTimeout = null;
    }
    if (finalResultTimeout) {
      clearTimeout(finalResultTimeout);
      finalResultTimeout = null;
    }
    
    isListening = false;
    voiceBtn.classList.remove('listening');
    // Don't reset button text if it was already changed to ✅ or ❓
    if (voiceBtn.textContent === '🔴' || voiceBtn.textContent === '⏹️' || voiceBtn.textContent === '⏳') {
      voiceBtn.textContent = '🎤';
    }
    if (DEBUG_MODE) console.log('🛑 Voice recognition ended');
  };

  // Start listening (must be after defining handlers)
  try {
    if (DEBUG_MODE) console.log('Starting recognition...');
    recognition.start();
  } catch (err) {
    console.error('Failed to start recognition:', err);
    alert('❌ לא ניתן להפעיל זיהוי דיבור.\n\nודא שנתת הרשאה למיקרופון בהגדרות הדפדפן.');
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.textContent = '🎤';
  }
}

function findProductByVoice(voiceText) {
  // Normalize: remove ALL types of whitespace AND directional marks (RTL/LTR)
  const searchText = voiceText
    .replace(/[\u200E\u200F]/g, '') // Remove LTR/RTL marks (8206, 8207)
    .toLowerCase()
    .trim()
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, ' ');
  
  if (DEBUG_MODE) console.log('🔍 Searching for:', `"${searchText}"`);
  if (DEBUG_MODE) console.log('📚 Categories available:', Object.keys(categories));
  
  let exactMatch = null;
  let partialMatch = null;
  
  // FIRST PASS: Search for EXACT match in ALL categories
  for (const [categoryName, categoryProducts] of Object.entries(categories)) {
    for (const productName of categoryProducts) {
      // Normalize product name - remove directional marks and whitespace
      const productLower = productName
        .replace(/[\u200E\u200F]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, ' ');
      
      if (productLower === searchText) {
        if (DEBUG_MODE) console.log(`  ✅ EXACT MATCH FOUND: "${productName}" in "${categoryName}"`);
        exactMatch = productName;
        break;
      }
    }
    if (exactMatch) break;
  }
  
  // SECOND PASS: If no exact match, search for partial match
  if (!exactMatch) {
    for (const [categoryName, categoryProducts] of Object.entries(categories)) {
      for (const productName of categoryProducts) {
        const productLower = productName
          .replace(/[\u200E\u200F]/g, '')
          .toLowerCase()
          .trim()
          .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, ' ');
        
        // Partial match: product contains search text (not vice versa!)
        if (productLower.includes(searchText)) {
          if (DEBUG_MODE) console.log(`  ⚠️ Partial match found: "${productName}" in "${categoryName}"`);
          partialMatch = productName;
          break;
        }
      }
      if (partialMatch) break;
    }
  }
  
  const foundProduct = exactMatch || partialMatch;
  if (DEBUG_MODE) console.log('🎯 Final result:', foundProduct ? `"${foundProduct}"` : 'NOT FOUND');
  
  if (!foundProduct) return null;
  
  // Find the product details from chooseGrid
  const chooseItem = Array.from(document.querySelectorAll('.choose-item')).find(
    btn => btn.textContent.trim() === foundProduct || btn.textContent.includes(foundProduct)
  );
  
  if (chooseItem) {
    // Extract icon and unit from data attributes
    const icon = chooseItem.getAttribute('data-icon') || '🛒';
    const unit = chooseItem.getAttribute('data-unit') || 'יח\'';
    if (DEBUG_MODE) console.log(`  📦 Product details: icon="${icon}", unit="${unit}"`);
    return { name: foundProduct, icon, unit };
  }
  
  return null;
}

function detectIconByName(name) {
  const lowerName = name.toLowerCase();
  
  // Icon mapping by keywords
  const iconMap = {
    'חלב': '🥛', 'גבינה': '🧀', 'יוגורט': '🥛', 'ביצים': '🥚', 'חמאה': '🧈',
    'לחם': '🍞', 'חלה': '🍞', 'פיתה': '🥙', 'בורקס': '🥐',
    'עוף': '🍗', 'בשר': '🥩', 'נקניק': '🌭',
    'דג': '🐟', 'סלמון': '🐟', 'טונה': '🐟',
    'גזר': '🥕', 'מלפפון': '🥒', 'עגבני': '🍅', 'בצל': '🧅', 'שום': '🧄',
    'תפוח': '🍎', 'בננה': '🍌', 'תפוז': '🍊', 'לימון': '🍋', 'אבוקדו': '🥑',
    'אורז': '🍚', 'פסטה': '🍝', 'קמח': '🌾',
    'מים': '💧', 'מיץ': '🧃', 'קולה': '🥤', 'בירה': '🍺', 'יין': '🍷',
    'שוקולד': '🍫', 'במבה': '🥜', 'ביסלי': '🥔', 'גלידה': '🍦', 'עוגיות': '🍪',
    'נייר טואלט': '🧻', 'סבון': '🧴', 'אבקת כביסה': '📦',
    'חיתול': '👶', 'מטליות': '🧻'
  };
  
  for (const [keyword, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(keyword)) {
      return icon;
    }
  }
  
  return '🛒'; // Default icon
}

/* ====== Selection Mode & Context Menu ====== */

/* ====== init ====== */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize DOM cache
  DOM.init();
  
  // First run deep clean to handle all types of corruption
  deepCleanCorruptedData();
  
  // Clean corrupted icon data first
  const wasCorrupted = cleanCorruptedIcons();
  
  // If still corrupted after cleaning, do emergency reset
  setTimeout(() => {
    try {
      const testItems = JSON.parse(localStorage.getItem('customChooseItems') || '[]');
      const stillCorrupted = testItems.some(item => 
        !item.name || 
        item.icon?.length > 100 || 
        (item.icon?.length > 10 && !item.icon.startsWith('data:image/') && !/^[\u{1F300}-\u{1F9FF}]$/u.test(item.icon))
      );
      
      if (stillCorrupted) {
        console.warn('Still corrupted data detected, doing emergency reset');
        emergencyResetCustomItems();
        return;
      }
    } catch (e) {
      console.error('Error checking for corruption:', e);
      emergencyResetCustomItems();
      return;
    }
    
    loadDefaultChooseItems();
  }, 100);
  
  // Make emergency functions available globally for console access
  window.emergencyResetCustomItems = emergencyResetCustomItems;
  window.deepCleanCorruptedData = deepCleanCorruptedData;
  window.cleanCorruptedIcons = cleanCorruptedIcons;
  window.debugCustomItems = debugCustomItems;
  
  // Check for shared Firebase list in URL (?list=xxxxx)
  const params = new URLSearchParams(window.location.search);
  const listId = params.get('list');
  if (listId && listId.trim() !== '') {
    // Load from Firebase
    loadListFromFirebase(listId).then(() => {
      // Remove the list parameter from URL after loading
      window.history.replaceState({}, document.title, window.location.pathname);
    });
  } else {
    // Load local list if no shared list
    loadListFromStorage();
  }

  // Dark mode toggle button
  document.getElementById("btnToggleDarkMode")?.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("viewMode", document.body.classList.contains("dark-mode") ? "dark" : "light");
    
    // Update button icon
    const btn = document.getElementById("btnToggleDarkMode");
    if (btn) {
      btn.textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙";
      btn.title = document.body.classList.contains("dark-mode") ? "מצב יום" : "מצב לילה";
    }
    
    if (document.body.classList.contains('dark-mode')) {
      document.querySelectorAll('#chooseSection, #settingsSection, #categoriesList, .choose-item, .list-footer').forEach(el => {
        if (el && !el.classList.contains('panel')) el.classList.add('panel');
      });
    }
  });

  // Load saved dark mode preference
  if (localStorage.getItem("viewMode") === "dark") {
    document.body.classList.add("dark-mode");
    const btn = document.getElementById("btnToggleDarkMode");
    if (btn) {
      btn.textContent = "☀️";
      btn.title = "מצב יום";
    }
    document.querySelectorAll('#chooseSection, #settingsSection, #categoriesList, .choose-item, .list-footer').forEach(el => {
      if (el && !el.classList.contains('panel')) el.classList.add('panel');
    });
  }

  // Open choose modal button
  document.getElementById("btnOpenChooseModal")?.addEventListener("click", openChooseModal);

  // Barcode scanner button
  document.getElementById("btnScanBarcode")?.addEventListener("click", startBarcodeScanner);
  document.getElementById("closeBarcodeScanner")?.addEventListener("click", stopBarcodeScanner);
  document.getElementById("btnCancelScan")?.addEventListener("click", stopBarcodeScanner);

  // Voice input button
  document.getElementById("btnVoiceInput")?.addEventListener("click", startVoiceInput);

  // Share List button (main button next to "הרשימה שלי")
  const shareBtn = document.getElementById('btnShareList');
  if (shareBtn) {
    shareBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // בדוק אם יש רשימה לפני שמתחילים
      const list = getShoppingList();
      if (!list || list.length === 0) {
        showToast("אין רשימה לשיתוף. הוסף פריטים לרשימה כדי לשתף", 'warning', 4000);
        return;
      }
      
      // משוב ויזואלי מיידי
      const img = shareBtn.querySelector('img');
      const originalTitle = shareBtn.title;
      if (img) {
        img.style.opacity = '0.6';
        img.style.transform = 'scale(0.9)';
      }
      shareBtn.title = 'שומר...';
      shareBtn.style.pointerEvents = 'none'; // מונע לחיצות כפולות
      
      try {
        const url = await saveListToFirebase(true); // true = silent
        if (url) showShareModal(url);
      } catch (err) {
        console.error('Share error:', err);
        showToast("שגיאה בשיתוף הרשימה", 'error');
      }
      
      // החזר למצב רגיל
      if (img) {
        img.style.opacity = '1';
        img.style.transform = 'scale(1)';
      }
      shareBtn.title = originalTitle;
      shareBtn.style.pointerEvents = 'auto';
    }, { passive: false });
  }

  // Removed: btnHdrResetChoices and btnHdrAddCustom - no longer needed with + buttons in categories
  // header 'רשימות' button and old clear/save buttons removed; footer will handle actions
  // Categories settings UI removed - categories now managed directly in loadDefaultChooseItems()

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
  
  // Emergency clean button functionality
  document.getElementById('btnEmergencyClean')?.addEventListener('click', () => {
    if (confirm('האם אתה בטוח שברצונך לבצע ניקוי יסודי של כל הנתונים הפגומים?\n\nפעולה זו תתקן או תמחק פריטים עם נתונים לא תקינים.')) {
      deepCleanCorruptedData();
      closeMainMenu();
    }
  });
  
  // Show emergency clean button on long press of the "save store" button
  let emergencyButtonTimeout;
  document.getElementById('btnSaveStore')?.addEventListener('touchstart', (e) => {
    emergencyButtonTimeout = setTimeout(() => {
      const emergencyBtn = document.getElementById('btnEmergencyClean');
      if (emergencyBtn) {
        emergencyBtn.style.display = 'block';
        // Hide after 10 seconds if not used
        setTimeout(() => {
          emergencyBtn.style.display = 'none';
        }, 10000);
      }
    }, 2000); // 2 seconds long press
  });
  
  document.getElementById('btnSaveStore')?.addEventListener('touchend', () => {
    if (emergencyButtonTimeout) {
      clearTimeout(emergencyButtonTimeout);
    }
  });
  
  // Also support mouse events for desktop
  document.getElementById('btnSaveStore')?.addEventListener('mousedown', (e) => {
    emergencyButtonTimeout = setTimeout(() => {
      const emergencyBtn = document.getElementById('btnEmergencyClean');
      if (emergencyBtn) {
        emergencyBtn.style.display = 'block';
        setTimeout(() => {
          emergencyBtn.style.display = 'none';
        }, 10000);
      }
    }, 2000);
  });
  
  document.getElementById('btnSaveStore')?.addEventListener('mouseup', () => {
    if (emergencyButtonTimeout) {
      clearTimeout(emergencyButtonTimeout);
    }
  });
  
  document.getElementById('togglePrices')?.addEventListener('change', (e) => {
    togglePriceDisplay(e.target.checked);
    // Don't close menu - let user save the store selection too
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
  document.getElementById('btnListClear')?.addEventListener('click', () => {
    if (confirm('האם למחוק את כל הרשימה?')) clearList();
    closeListMenu();
  });
  
  document.getElementById('btnListClearChecked')?.addEventListener('click', () => {
    clearChecked();
    closeListMenu();
  });
  
  document.getElementById('btnClearCart')?.addEventListener('click', () => {
    const cartGrid = document.getElementById('cartGrid');
    const cartSection = document.getElementById('cartSection');
    if (cartGrid && confirm('האם לנקות את העגלה? (הפריטים יחזרו לרשימה)')) {
      // Move all cart items back to list
      const items = Array.from(cartGrid.children);
      items.forEach(item => {
        item.classList.remove('checked');
        if (DOM.listGrid) DOM.listGrid.appendChild(item);
      });
      // Hide cart section
      if (cartSection) cartSection.style.display = 'none';
      saveListToStorage();
    }
  });
  
  document.getElementById('btnListShare')?.addEventListener('click', () => {
    shareCurrentList();
    closeListMenu();
  });
  
  document.getElementById('btnListShareWA')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { showToast("הרשימה ריקה", 'warning'); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank');
    closeListMenu();
  });
  
  document.getElementById('btnListShareSMS')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { showToast("הרשימה ריקה", 'warning'); return; }
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
    if (!data) { showToast("הרשימה ריקה", 'warning'); return; }
    const encoded = encodeURIComponent(data);
    const url = `${location.origin}${location.pathname}?list=${encoded}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank');
    closeMainMenu();
  });
  
  document.getElementById('btnFooterShareSMS')?.addEventListener('click', () => {
    const data = localStorage.getItem("shoppingList") || "";
    if (!data) { showToast("הרשימה ריקה", 'warning'); return; }
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
  if (!data) { showToast("הרשימה ריקה", 'warning'); return; }
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
    showToast('קישור הרשימה הועתק ללוח! 📋', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('הקישור הועתק ללוח! 📋', 'success'); }
    catch { showToast(url, 'info', 6000); }
    document.body.removeChild(ta);
  }
}

// ===== Service Worker Update Handler =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(registration => {
    // Check for updates every time the page loads
    registration.update();
    
    // Listen for new service worker waiting to activate
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker available - show update notification
          showToast('עדכון זמין! רענן את הדף לגרסה החדשה 🔄', 'info', 8000);
          
          // Auto-reload after 3 seconds
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        }
      });
    });
  });
  
  // Force reload when service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
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
  const chooseItem = e.target.closest('.choose-item');
  const listItem = e.target.closest('.item');
  
  if (chooseItem) {
    e.preventDefault();
    // For choose items, trigger our context menu
    const itemData = {
      name: chooseItem.textContent.replace(/\d+$/, '').trim(),
      icon: chooseItem.getAttribute('data-icon') || '🛒',
      unit: chooseItem.getAttribute('data-unit') || "יח'"
    };
    showContextMenuForChooseItem(e.clientX, e.clientY, chooseItem, itemData);
    return false;
  } else if (listItem) {
    e.preventDefault();
    // For list items, trigger context menu
    showContextMenu(e.clientX, e.clientY, listItem);
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
      // Update the element - use textContent to prevent XSS
      data.name = sanitizeInput(newName.trim());
      const badge = element.querySelector('.badge');
      element.textContent = `${data.icon} ${data.name}`;
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
    // Update choose item - preserve the complex structure
    const iconContainer = iconPickerTarget.querySelector('div:first-child');
    const textSpan = iconPickerTarget.querySelector('span:not(.badge)');
    const badge = iconPickerTarget.querySelector('.badge');
    
    if (iconContainer && textSpan) {
      // Clear any existing overlay
      const existingOverlay = iconPickerTarget.querySelector('div[style*="background: linear-gradient"]');
      if (existingOverlay) existingOverlay.remove();
      
      // Reset button background
      iconPickerTarget.style.backgroundImage = '';
      iconPickerTarget.style.backgroundSize = '';
      iconPickerTarget.style.backgroundPosition = '';
      iconPickerTarget.style.backgroundRepeat = '';
      iconPickerTarget.classList.remove('has-image-background');
      
      // Reset text styling
      textSpan.style.color = '';
      textSpan.style.textShadow = '';
      textSpan.style.fontWeight = '600';
      textSpan.style.padding = '0.2rem 0';
      textSpan.style.backgroundColor = '';
      textSpan.style.borderRadius = '';
      textSpan.style.backdropFilter = '';
      
      // Update the icon
      if (icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://')) {
        // It's an image - use background approach
        iconPickerTarget.style.backgroundImage = `url(${icon})`;
        iconPickerTarget.style.backgroundSize = 'cover';
        iconPickerTarget.style.backgroundPosition = 'center';
        iconPickerTarget.style.backgroundRepeat = 'no-repeat';
        iconPickerTarget.classList.add('has-image-background');
        
        // Add overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100%);
          border-radius: inherit;
          pointer-events: none;
        `;
        iconPickerTarget.appendChild(overlay);
        
        // Hide icon container and style text for visibility
        iconContainer.style.display = 'none';
        textSpan.style.color = 'white';
        textSpan.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        textSpan.style.fontWeight = '700';
        textSpan.style.padding = '0.3rem 0.5rem';
        textSpan.style.backgroundColor = 'rgba(0,0,0,0.4)';
        textSpan.style.borderRadius = '6px';
        textSpan.style.backdropFilter = 'blur(4px)';
        textSpan.style.position = 'relative';
        textSpan.style.zIndex = '2';
        
      } else {
        // It's an emoji - use icon container
        iconContainer.style.display = 'flex';
        iconContainer.innerHTML = '';
        iconContainer.style.fontSize = '34px';
        iconContainer.textContent = icon;
      }
      
      // Update the data attribute
      iconPickerTarget.setAttribute('data-icon', icon);
      
      // Save to storage
      saveChooseItemsToStorage();
    }
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

// Image upload functionality
const btnUploadImage = document.getElementById('btnUploadImage');
const iconImageUpload = document.getElementById('iconImageUpload');

btnUploadImage.addEventListener('click', () => {
  iconImageUpload.click();
});

iconImageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // Check if it's an image first
  if (!file.type.startsWith('image/')) {
    showToast('אנא בחר קובץ תמונה בפורמט JPG, PNG או GIF', 'warning', 4000);
    return;
  }
  
  // Show processing message for large files
  if (file.size > 100 * 1024) { // Files larger than 100KB
    showToast('מעבד תמונה גדולה... אנא המתן', 'info', 2000);
  }
  
  // Read the file and convert to base64
  const reader = new FileReader();
  reader.onload = (event) => {
    const imageData = event.target.result;
    
    // Create a preview and process image
    const img = new Image();
    img.onload = () => {
      try {
        // Check if canvas is supported
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          // Fallback for browsers without canvas support
          showToast('הדפדפן לא תומך בעיבוד תמונות. נסה דפדפן אחר', 'error', 4000);
          return;
        }
        
        let width = img.width;
        let height = img.height;
        const maxSize = 60; // Even smaller for mobile
        
        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Use better image rendering if supported
        if (ctx.imageSmoothingEnabled !== undefined) {
          ctx.imageSmoothingEnabled = true;
          if (ctx.imageSmoothingQuality) {
            ctx.imageSmoothingQuality = 'high';
          }
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get optimized base64 with higher compression
        let optimizedImageData;
        try {
          optimizedImageData = canvas.toDataURL('image/jpeg', 0.5); // Even higher compression for mobile
        } catch (e) {
          // Fallback if toDataURL fails
          optimizedImageData = canvas.toDataURL(); // Use default PNG
        }
        
        // Check final size - simple length check instead of Blob
        const sizeKB = Math.round(optimizedImageData.length / 1024 * 0.75); // Approximate KB size
        if (sizeKB > 40) { // 40KB limit for mobile
          showToast(`התמונה גדולה מדי (${sizeKB}KB). נסה תמונה קטנה יותר`, 'warning', 5000);
          return;
        }
        
        // Success message
        showToast(`תמונה עובדה בהצלחה! (${sizeKB}KB)`, 'success', 3000);
        
        // Use the image as icon based on mode
        if (iconPickerMode === 'custom-item') {
          finishAddingCustomItem(optimizedImageData);
        } else if (iconPickerMode === 'choose') {
          // Use the new selectIcon function that handles choose items properly
          selectIcon(optimizedImageData);
        } else if (iconPickerTarget) {
          // For list items
          const iconContainer = iconPickerTarget.querySelector('.item-icon');
          if (iconContainer) {
            iconContainer.textContent = '';
            const imgElement = document.createElement('img');
            imgElement.src = optimizedImageData;
            imgElement.style.width = '100%';
            imgElement.style.height = '100%';
            imgElement.style.objectFit = 'cover';
            imgElement.style.borderRadius = '4px';
            iconContainer.appendChild(imgElement);
            iconPickerTarget.dataset.icon = optimizedImageData;
            saveListToStorage();
          }
        }
        
        closeIconPicker();
        iconImageUpload.value = ''; // Reset input
        
      } catch (error) {
        console.error('Error processing image:', error);
        showToast('שגיאה בעיבוד התמונה. נסה תמונה אחרת או דפדפן אחר', 'error', 4000);
      }
    };
    
    img.onerror = () => {
      showToast('לא ניתן לטעון את התמונה. נסה תמונה אחרת', 'error', 4000);
    };
    
    img.src = imageData;
  };
  
  reader.onerror = () => {
    showToast('שגיאה בקריאת הקובץ', 'error');
  };
  
  reader.readAsDataURL(file);
});

// URL input functionality
const btnUseUrl = document.getElementById('btnUseUrl');
const iconUrlInput = document.getElementById('iconUrlInput');

btnUseUrl.addEventListener('click', () => {
  const url = iconUrlInput.value.trim();
  if (!url) {
    showToast('אנא הכנס כתובת URL תקינה', 'warning', 3000);
    return;
  }
  
  // Basic URL validation
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showToast('כתובת URL חייבת להתחיל ב-http:// או https://', 'warning', 4000);
    return;
  }
  
  // Test if the URL loads an image
  const testImg = new Image();
  testImg.onload = () => {
    // Image loaded successfully, use it
    selectIcon(url);
    iconUrlInput.value = ''; // Clear input
    showToast('תמונה נטענה בהצלחה!', 'success', 2000);
  };
  
  testImg.onerror = () => {
    showToast('לא ניתן לטעון תמונה מהכתובת הזו. בדוק שהקישור תקין', 'error', 4000);
  };
  
  testImg.src = url;
});

// Allow Enter key to submit URL
iconUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    btnUseUrl.click();
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
    if (DEBUG_MODE) console.log('No icons found for:', searchTerm);
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
    // Don't auto-focus on mobile to prevent keyboard popup
    // User can tap search field if they want to search
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

// Choose search functionality with debouncing
const chooseSearchInput = document.getElementById('chooseSearch');
let searchDebounceTimer = null;

if (chooseSearchInput) {
  chooseSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    
    // Clear previous timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    // Set new timer with 300ms delay
    searchDebounceTimer = setTimeout(() => {
      filterChooseItems(searchTerm);
    }, 300);
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
