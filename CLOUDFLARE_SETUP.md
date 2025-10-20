# 🚀 Cloudflare Worker Setup - Israeli Supermarket Prices API

## מה זה?
Worker חינמי שמביא מחירים אמיתיים מרשתות השיווק בישראל.

## 📋 דרישות
- חשבון Cloudflare (חינמי)
- Node.js מותקן על המחשב

---

## 🔧 התקנה

### שלב 1: התקנת Wrangler CLI

```bash
npm install -g wrangler
```

או עם pnpm:
```bash
pnpm add -g wrangler
```

### שלב 2: התחברות ל-Cloudflare

```bash
wrangler login
```

זה יפתח דפדפן - התחבר עם חשבון Cloudflare שלך.

### שלב 3: קבלת Account ID

1. לך ל-https://dash.cloudflare.com/
2. בחר **Workers & Pages**
3. העתק את ה-**Account ID**
4. עדכן את `wrangler.toml`:
   ```toml
   account_id = "YOUR_ACCOUNT_ID_HERE"  # הדבק כאן
   ```

---

## 🚀 פריסה (Deploy)

### בדיקה מקומית (אופציונלי)

```bash
wrangler dev
```

זה יריץ את ה-Worker על http://localhost:8787

### פריסה לפרודקשן

```bash
wrangler deploy
```

זה יפרוס את ה-Worker ויחזיר לך URL כמו:
```
https://shopping-list-prices.YOUR_USERNAME.workers.dev
```

---

## 📡 שימוש ב-API

### נקודות קצה (Endpoints)

#### 1. בדיקת תקינות
```
GET https://shopping-list-prices.YOUR_USERNAME.workers.dev/
```

תשובה:
```json
{
  "name": "Israeli Supermarket Prices API",
  "version": "1.0.0",
  "endpoints": {...}
}
```

#### 2. קבלת מחירים לחנות
```
GET https://shopping-list-prices.YOUR_USERNAME.workers.dev/prices/shufersal/123
```

תשובה:
```json
{
  "chain": "shufersal",
  "chainName": "שופרסל",
  "storeId": "123",
  "updated": "2025-10-20T10:00:00.000Z",
  "prices": {
    "חלב": 5.90,
    "לחם": 6.50,
    "ביצים": 12.90,
    ...
  },
  "cached": false,
  "source": "cloudflare-worker-live"
}
```

### רשתות נתמכות
- `shufersal` / `שופרסל`
- `rami-levy` / `רמי-לוי`
- `yohananof` / `יוחננוף`

---

## ⚙️ אינטגרציה באפליקציה שלך

עדכן את `script.js`:

```javascript
// החלף את fetchPricesForBranch הקיים
async function fetchPricesForBranch(network, branchId) {
  if (!network || !branchId) return null;
  
  // ה-URL של ה-Worker שלך
  const WORKER_URL = 'https://shopping-list-prices.YOUR_USERNAME.workers.dev';
  const url = `${WORKER_URL}/prices/${network}/${branchId}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    
    if (!data || !data.prices) throw new Error("Invalid price data");

    saveApiPrices(data.prices || {});
    const normMap = buildNormalizedPriceMap(data.prices || {});
    localStorage.setItem('apiPricesNormalized', JSON.stringify(normMap));
    localStorage.setItem('lastFetchedPrices', JSON.stringify({ 
      network, 
      branchId, 
      updated: data.updated || new Date().toISOString(),
      cached: data.cached 
    }));
    
    renderAllPrices();
    renderTotal();
    
    return data.prices;
  } catch (err) {
    console.error("Failed to fetch prices:", err);
    alert(`שגיאה בטעינת מחירים: ${err.message}`);
    return null;
  }
}
```

---

## 🔄 עדכון Worker

אחרי שינויים ב-`cloudflare-worker.js`:

```bash
wrangler deploy
```

---

## 💰 עלויות

### Free Tier (חינמי לצמיתות):
- ✅ 100,000 בקשות ליום
- ✅ 10ms CPU time לבקשה
- ✅ אין הגבלת bandwidth
- ✅ SSL חינמי

זה מספיק ל-**אלפי משתמשים** ביום!

### אם תרצה יותר:
- **Workers Paid** ($5/חודש): 10 מיליון בקשות
- **KV Storage** ($0.50/חודש): Cache מתקדם

---

## 🛠️ העברה למחירים אמיתיים

כרגע ה-Worker משתמש ב-**MOCK DATA** (מחירים דמה).

כדי לקבל מחירים **אמיתיים**, צריך:

### אפשרות 1: API רשמי (אם קיים)
עדכן את `fetchShufersalPrices`:
```javascript
async function fetchShufersalPrices(storeId) {
  const response = await fetch(
    `https://api.shufersal.co.il/stores/${storeId}/products`,
    {
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  
  // המרה לפורמט שלך
  const prices = {};
  data.products.forEach(p => {
    prices[p.name] = p.price;
  });
  
  return {
    chain: 'shufersal',
    storeId,
    prices,
    updated: new Date().toISOString()
  };
}
```

### אפשרות 2: Web Scraping (מתקדם)
דורש ספריות נוספות ועבודה עם HTML.

### אפשרות 3: שימוש ב-API צד שלישי
יש שירותים שכבר אוספים את המידע (בתשלום).

---

## 📊 ניטור

ראה סטטיסטיקות ב-Cloudflare Dashboard:
1. לך ל-https://dash.cloudflare.com/
2. בחר **Workers & Pages**
3. לחץ על `shopping-list-prices`
4. ראה **Analytics** - בקשות, שגיאות, זמני תגובה

---

## 🆘 בעיות נפוצות

### Worker לא עולה
```bash
# בדוק שאתה מחובר
wrangler whoami

# בדוק לוגים
wrangler tail
```

### CORS Error
ודא שה-CORS headers נכונים ב-`cloudflare-worker.js`.

### Rate Limit
100,000 בקשות ליום. אם עברת, שקול:
- KV caching (מגדיל TTL)
- Workers Paid plan

---

## 🎯 צעדים הבאים

1. ✅ פרוס את ה-Worker הבסיסי
2. 🔄 בדוק שהוא עובד
3. 🔗 חבר לאפליקציה
4. 🎨 הוסף UI למחירים
5. 🚀 העבר למחירים אמיתיים (אם יש API)

---

## 📚 קישורים שימושיים

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)

---

**יש שאלות? פתח issue ב-GitHub!** 🚀
