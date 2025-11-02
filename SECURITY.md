# 🔒 מדריך אבטחה - רשימת קניות

## סקירת אבטחה

האפליקציה מיושמת עם שכבות אבטחה מרובות:

### ✅ הגנות שהוטמעו:

#### 1. **XSS Protection (Cross-Site Scripting)**
- ✅ Sanitization של כל ה-inputs
- ✅ שימוש ב-`textContent` במקום `innerHTML`
- ✅ הסרת תגי HTML מסוכנים
- ✅ הסרת JavaScript protocols

#### 2. **Content Security Policy (CSP)**
- ✅ Headers מוגדרים ב-`vercel.json`
- ✅ הגבלת מקורות לסקריפטים
- ✅ חסימת iframes
- ✅ הגנה מפני clickjacking

#### 3. **Firebase Security**
- ✅ Rules מוגדרים ב-`firestore.rules`
- ✅ הגבלת גודל דאטה (1MB)
- ✅ הגבלת מספר פריטים (100)
- ✅ Lists הם immutable (לא ניתן לעדכן)
- ✅ תאריך תפוגה (30 יום)

#### 4. **Input Validation**
- ✅ בדיקת גודל input
- ✅ הסרת תווים מסוכנים
- ✅ הגבלת אורך (500 תווים)
- ✅ Validation לפני שמירה ב-Firebase

#### 5. **Security Headers**
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection
- ✅ Referrer-Policy
- ✅ Permissions-Policy

## 🔧 הגדרת Firebase Security Rules

כדי להפעיל את ה-Security Rules ב-Firebase:

### Option 1: דרך Firebase Console
1. היכנס ל-[Firebase Console](https://console.firebase.google.com/)
2. בחר את הפרויקט שלך: `shopping-3a351`
3. לך ל-**Firestore Database** → **Rules**
4. העתק את התוכן מ-`firestore.rules`
5. לחץ **Publish**

### Option 2: דרך Firebase CLI
```bash
# התקן Firebase CLI
npm install -g firebase-tools

# התחבר
firebase login

# אתחל את הפרויקט
firebase init firestore

# פרוס את ה-rules
firebase deploy --only firestore:rules
```

## 🔐 Best Practices שהוטמעו:

### Client-Side Security:
- ✅ אין sensitive data ב-client
- ✅ כל ה-validation נעשה גם ב-server (Firebase Rules)
- ✅ API Keys חשופים אבל מוגנים ב-Firebase Rules
- ✅ localStorage נשמר רק locally

### Firebase Security:
- ✅ Lists הם read-only אחרי יצירה
- ✅ אין אפשרות למחוק lists של אחרים
- ✅ הגבלת גודל דאטה מונעת DOS attacks
- ✅ תאריך תפוגה מונע spam

### Network Security:
- ✅ כל התקשורת דרך HTTPS
- ✅ CSP מונע loading של resources חיצוניים לא מורשים
- ✅ Headers מונעים clickjacking ו-MIME sniffing

## ⚠️ נקודות לשים לב:

### Firebase API Keys
ה-API Keys של Firebase **אמורים להיות חשופים** ב-client-side apps. האבטחה האמיתית היא ב-**Firebase Security Rules**, לא ב-hiding של ה-keys.

**למה זה OK?**
- Firebase API Keys הם public identifiers
- האבטחה היא ב-Rules, לא ב-keys
- Google מומלץ על זה באופן רשמי

**מה שחייבים לעשות:**
- ✅ להגדיר Firebase Security Rules (כמו שעשינו)
- ✅ להגביל authorized domains ב-Firebase Console
- ✅ להוסיף App Check (אופציונלי, מומלץ)

### Rate Limiting
כרגע אין rate limiting ב-client. אפשר להוסיף:
- **Firebase App Check** - מומלץ מאוד!
- **Cloudflare** - אם יש domain משלך
- **reCAPTCHA** - לפני שמירה ב-Firebase

## 🎯 המלצות נוספות (אופציונליות):

### 1. Firebase App Check
```javascript
// הוסף ב-index.html
firebase.appCheck().activate('RECAPTCHA_V3_SITE_KEY');
```

### 2. Authorized Domains
ב-Firebase Console → Authentication → Settings → Authorized domains:
- הוסף את `shopping-app-zeta-eight.vercel.app`
- הסר domains לא מורשים

### 3. Monitoring
- הפעל **Firebase Analytics** לזיהוי שימוש חריג
- עקוב אחרי **Firestore Usage** ל-DOS attacks

## 📞 דיווח על בעיות אבטחה

אם מצאת בעיית אבטחה, נא לדווח ל:
- Email: [your-email]
- GitHub Issues: עם תג `security`

---

**גרסה אחרונה עודכנה:** נובמבר 2025
**מצב אבטחה:** ✅ מאובטח
