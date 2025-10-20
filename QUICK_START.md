# ⚡ התחלה מהירה - Cloudflare Worker

## 🎯 מה אתה צריך לעשות:

### 1️⃣ התקנת כלים (חד פעמי)

פתח PowerShell והרץ:

```powershell
npm install -g wrangler
```

המתן עד שההתקנה תסתיים.

---

### 2️⃣ התחברות ל-Cloudflare (חד פעמי)

```powershell
wrangler login
```

זה יפתח דפדפן - התחבר עם Google/GitHub או צור חשבון חדש (חינמי).

---

### 3️⃣ קבלת Account ID

1. לך ל-https://dash.cloudflare.com/
2. לחץ על **Workers & Pages** בתפריט השמאלי
3. בפינה הימנית העליונה תראה **Account ID**
4. לחץ על Copy

---

### 4️⃣ עדכון הקובץ wrangler.toml

1. פתח את `wrangler.toml`
2. מצא את השורה:
   ```toml
   account_id = "YOUR_ACCOUNT_ID_HERE"
   ```
3. החלף ל:
   ```toml
   account_id = "THE_ID_YOU_COPIED"
   ```
4. שמור את הקובץ

---

### 5️⃣ פריסה!

ב-PowerShell, בתיקייה של הפרויקט:

```powershell
cd "e:\my-list ver3.3"
wrangler deploy
```

אם הכל תקין, תראה:

```
✨ Success! Deployed worker shopping-list-prices
   URL: https://shopping-list-prices.YOUR_USERNAME.workers.dev
```

**העתק את ה-URL הזה!**

---

### 6️⃣ חיבור לאפליקציה

1. פתח `script.js`
2. מצא את השורות (שורה ~130):
   ```javascript
   const USE_CLOUDFLARE_WORKER = false;
   const WORKER_URL = 'https://shopping-list-prices.YOUR_USERNAME.workers.dev';
   ```
3. שנה ל:
   ```javascript
   const USE_CLOUDFLARE_WORKER = true;
   const WORKER_URL = 'THE_URL_YOU_COPIED_IN_STEP_5';
   ```
4. שמור

---

### 7️⃣ בדיקה

1. פתח את האפליקציה בדפדפן
2. לחץ על תפריט (☰) → **בחר סניף**
3. בחר רשת (שופרסל/רמי לוי/יוחננוף)
4. בחר סניף
5. לחץ **שמור בחירה**

אם הכל עובד, תראה מחירים!

---

## 🧪 בדיקה ישירה של ה-Worker

פתח בדפדפן:

```
https://shopping-list-prices.YOUR_USERNAME.workers.dev/
```

אמור לראות:

```json
{
  "name": "Israeli Supermarket Prices API",
  "version": "1.0.0",
  ...
}
```

נסה גם:

```
https://shopping-list-prices.YOUR_USERNAME.workers.dev/prices/shufersal/123
```

אמור לראות מחירים (כרגע MOCK, אבל זה עובד!).

---

## 🎉 זהו!

עכשיו יש לך:
- ✅ Worker פעיל
- ✅ API למחירים
- ✅ אפליקציה מחוברת
- ✅ הכל חינמי!

---

## 🔧 עדכון Worker

כשתשנה את `cloudflare-worker.js`:

```powershell
wrangler deploy
```

זה יעדכן את ה-Worker תוך שניות.

---

## 🆘 בעיות?

### "command not found: wrangler"
- הפעל מחדש את PowerShell
- או הרץ: `npm install -g wrangler` שוב

### "Authentication required"
- הרץ: `wrangler login`

### "Account ID not found"
- ודא ש-`wrangler.toml` מעודכן נכון
- בדוק שאין רווחים או מרכאות מיותרות

### CORS Error בדפדפן
- ה-Worker כבר מטפל ב-CORS
- נקה Cache: Ctrl+Shift+Delete
- נסה בחלון Incognito

---

## 📊 ניטור

ראה כמה בקשות יש:

1. לך ל-https://dash.cloudflare.com/
2. לחץ על `shopping-list-prices`
3. ראה **Analytics**

---

**צריך עזרה? פתח issue ב-GitHub!** 🚀
