# 🛒 Shopping List PWA v3.3

Progressive Web App חכמה לניהול רשימת קניות עם מחירים בזמן אמת מרשתות השיווק בישראל.

---

## ✨ פיצ'רים

### 📱 ליבה
- ✅ רשימת קניות אינטראקטיבית
- ✅ מיון אוטומטי לפי קטגוריות
- ✅ חישוב סכום כולל
- ✅ שמירה ב-localStorage
- ✅ שיתוף רשימות (WhatsApp, SMS, Link)
- ✅ תמיכה ב-PWA (התקנה כאפליקציה)

### 💰 מחירים
- ✅ מחירים ידניים לכל פריט
- ✅ בחירת רשת וסניף
- 🆕 **Cloudflare Worker למחירים בזמן אמת** (אופציונלי)
- ✅ Cache חכם (6 שעות)

### 🎨 עיצוב
- ✅ ממשק עברי מותאם
- ✅ מצב לילה / יום
- ✅ Responsive Design
- ✅ אייקונים Emoji
- ✅ אנימציות חלקות

### 📊 קטגוריות
- פירות וירקות 🥕
- מוצרי חלב 🥛
- מאפים ולחמים 🍞
- בשר ועופות 🍗
- דגים 🐟
- מזווה ויבשים 🌾
- משקאות 🥤
- חטיפים וממתקים 🍫
- מוצרי ניקיון 🧹
- מוצרי טיפוח 🧴
- מוצרי תינוק 👶
- קפואים ❄️

---

## 🚀 התקנה מהירה

### דרישות
- Node.js (אם רוצים Worker)
- דפדפן מודרני
- (אופציונלי) חשבון Cloudflare

### התקנה בסיסית

```bash
# שכפל את הפרויקט
git clone https://github.com/hamalci/shopping-list.git
cd shopping-list

# פתח בדפדפן
# פשוט פתח את index.html או הרץ שרת מקומי
python -m http.server 8080
# או
npx serve
```

גש ל-http://localhost:8080

---

## ☁️ Cloudflare Worker Setup (מחירים בזמן אמת)

### שלב 1: התקנת Wrangler

```bash
npm install -g wrangler
```

### שלב 2: התחברות

```bash
wrangler login
```

### שלב 3: הגדרת Account ID

1. לך ל-https://dash.cloudflare.com/
2. העתק את ה-Account ID
3. עדכן ב-`wrangler.toml`:
   ```toml
   account_id = "YOUR_ACCOUNT_ID_HERE"
   ```

### שלב 4: פריסה

```bash
wrangler deploy
```

תקבל URL כמו:
```
https://shopping-list-prices.YOUR_USERNAME.workers.dev
```

### שלב 5: הפעלה באפליקציה

ב-`script.js`, עדכן:

```javascript
const USE_CLOUDFLARE_WORKER = true;
const WORKER_URL = 'https://shopping-list-prices.YOUR_USERNAME.workers.dev';
```

**למידע מפורט:** קרא את [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)

---

## 📖 שימוש

### הוספת פריט

1. לחץ על "בחר פריטים מהרשימה"
2. בחר קטגוריה
3. לחץ על פריט או לחץ ➕ להוספת פריט מותאם

### עריכת כמות

- לחץ על הכמות
- שנה את המספר
- לחץ Enter או לחץ מחוץ לשדה

### עריכת מחיר

- לחץ על המחיר
- הכנס מחיר חדש
- לחץ Enter או לחץ מחוץ לשדה

### סימון כקנוי

- לחץ על הפריט
- הוא יעבור לתחתית הרשימה

### שיתוף רשימה

1. פתח תפריט (☰)
2. בחר "📤 שתף רשימה"
3. בחר אפליקציה (WhatsApp / SMS / קישור)

---

## 🛠️ טכנולוגיות

### Frontend
- **Vanilla JavaScript** (אין תלויות!)
- **CSS3** עם custom properties
- **HTML5** סמנטי
- **Service Worker** (PWA)
- **localStorage** לשמירת נתונים

### Backend (אופציונלי)
- **Cloudflare Workers** (Serverless)
- **Edge Computing** (גלובלי)
- **KV Storage** (Cache)

---

## 📊 ביצועים

- ⚡ טעינה מהירה: < 1 שניה
- 📱 קל: < 500KB (כולל הכל)
- 🔄 Offline-first (PWA)
- 🚀 אופטימיזציות:
  - DOM caching
  - Document fragments
  - for...of במקום forEach
  - Regex optimization

---

## 🗂️ מבנה הפרויקט

```
shopping-list/
├── index.html              # עמוד ראשי
├── script.js               # לוגיקה מרכזית
├── style.css               # עיצוב ראשי
├── manifest.json           # PWA manifest
├── service-worker.js       # Service Worker
├── cloudflare-worker.js    # Worker למחירים
├── wrangler.toml           # הגדרות Worker
├── package.json            # Dependencies
├── CLOUDFLARE_SETUP.md     # מדריך Worker
└── data/
    └── prices/             # JSON מחירים מקומיים
        ├── shufersal/
        ├── rami/
        └── yohananof/
```

---

## 🔧 פיתוח

### הרצה מקומית

```bash
npm run dev
# או
python -m http.server 8080
```

### Worker Development

```bash
npm run worker:dev
```

### Deploy Worker

```bash
npm run worker:deploy
```

### ניטור Worker

```bash
npm run worker:tail
```

---

## 🤝 תרומה

רוצה לתרום? מעולה!

1. Fork את הפרויקט
2. צור branch חדש (`git checkout -b feature/amazing`)
3. Commit שינויים (`git commit -m 'Add amazing feature'`)
4. Push ל-branch (`git push origin feature/amazing`)
5. פתח Pull Request

---

## 📝 רישיון

MIT License - ראה [LICENSE](LICENSE) לפרטים

---

## 💬 תמיכה

- 🐛 **באגים:** [GitHub Issues](https://github.com/hamalci/shopping-list/issues)
- 💡 **רעיונות:** [GitHub Discussions](https://github.com/hamalci/shopping-list/discussions)
- 📧 **אימייל:** your-email@example.com

---

## 🎯 Roadmap

### v3.4 (בקרוב)
- [ ] מחירים אמיתיים מ-API רשתות
- [ ] תמונות מוצרים
- [ ] השוואת מחירים בין רשתות
- [ ] המלצות חכמות

### v4.0 (עתיד)
- [ ] סנכרון בין מכשירים
- [ ] שיתוף רשימות בזמן אמת
- [ ] ML להמלצות מוצרים
- [ ] תמיכה בברקודים

---

## 🙏 תודות

- **Cloudflare** - על Workers חינמי
- **Vercel** - על Hosting חינמי
- **הקהילה** - על הפידבקים והרעיונות

---

**עשוי עם ❤️ בישראל** 🇮🇱
