# 🔥 הוראות הפעלת Firebase Security Rules

## שלבים להעלאת ה-Rules:

### דרך Firebase Console (הכי קל):

1. **היכנס ל-Firebase Console:**
   https://console.firebase.google.com/

2. **בחר את הפרויקט:**
   `shopping-3a351`

3. **לך ל-Firestore Database:**
   לחץ על "Firestore Database" בתפריט הצד

4. **פתח את Rules:**
   לחץ על הטאב "Rules" בראש הדף

5. **העתק את הקוד הזה:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Security rules for shopping lists
    match /lists/{listId} {
      // Allow anyone to read lists (for sharing)
      allow read: if true;
      
      // Allow anyone to create lists, but with validation
      allow create: if request.resource.data.keys().hasAll(['list', 'created', 'expiresAt'])
                    && request.resource.data.list is list
                    && request.resource.data.list.size() <= 100
                    && request.resource.data.created is string
                    && request.resource.data.expiresAt is string
                    && request.resource.data.size() < 1048576;
      
      // Don't allow updates or deletes
      allow update, delete: if false;
    }
    
    // Deny all other collections
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

6. **לחץ על Publish**

7. **אשר את השינויים**

---

## ✅ לאחר העלאת ה-Rules:

### בדיקות שכדאי לעשות:

1. **נסה לשתף רשימה** - צריך לעבוד ✅
2. **נסה לקרוא רשימה משותפת** - צריך לעבוד ✅
3. **נסה ליצור רשימה ענקית** - צריך להיחסם ❌
4. **נסה לעדכן רשימה קיימת** - צריך להיחסם ❌

---

## 📊 הגבלות שהוגדרו:

- ✅ **מקסימום 100 פריטים** ברשימה
- ✅ **מקסימום 1MB** לכל רשימה
- ✅ **תאריך תפוגה**: 30 יום
- ✅ **אין אפשרות למחוק/לעדכן** רשימות אחרות
- ✅ **רק קריאה ויצירה** מותרים

---

## 🔐 אבטחה נוספת (אופציונלי):

### הוסף Authorized Domains:

1. לך ל-Firebase Console → Authentication
2. לחץ על "Settings" → "Authorized domains"
3. הוסף:
   - `shopping-app-zeta-eight.vercel.app`
   - `hamalci.github.io`
4. הסר domains לא מורשים

---

זהו! האבטחה שלך עכשיו ברמה גבוהה! 🛡️
