# Portainer Stack - Shopping List with HTTPS

## הוראות:

### שלב 1: צור volume לתעודות SSL
בטרמינל של Portainer או SSH לשרת:
```bash
docker volume create shopping-ssl
```

### שלב 2: העתק את ה-Stack הזה ל-Portainer

1. פתח Portainer: http://192.168.1.180:9443
2. לחץ **Stacks** → **Add Stack**
3. שם Stack: `shopping-list`
4. בחר **Web editor**
5. העתק והדבק את התוכן למטה:

```yaml
version: '3.8'

services:
  shopping-list:
    image: nginx:alpine
    container_name: shopping-list-app
    restart: unless-stopped
    ports:
      - "8443:443"   # HTTPS
      - "8080:80"    # HTTP (redirects to HTTPS)
    volumes:
      # We'll use a simple config - no SSL for now, just HTTP
      - shopping-html:/usr/share/nginx/html
    networks:
      - web
    command: >
      sh -c "echo 'server { 
        listen 80; 
        root /usr/share/nginx/html; 
        index index.html; 
        location / { try_files \$$uri \$$uri/ /index.html; }
      }' > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"

volumes:
  shopping-html:
    driver: local

networks:
  web:
    external: false
```

6. לחץ **Deploy the stack**

### שלב 3: העלה קבצים ל-Volume

אחרי ש-Stack רץ, צריך להעלות את הקבצים:

**באמצעות Portainer:**
1. לך ל-**Volumes** → `shopping-list_shopping-html`
2. לחץ **Browse**
3. העלה את כל הקבצים מ-`E:\deploy-shopl\`

**או באמצעות Docker exec:**
```bash
# התחבר לשרת ב-SSH
ssh user@192.168.1.180

# העתק קבצים לתוך הקונטיינר
docker cp /path/to/your/files/. shopping-list-app:/usr/share/nginx/html/
```

### שלב 4: גישה

גש ל: **http://192.168.1.180:8080**

---

## הערה חשובה: 
בגלל שזה HTTP (לא HTTPS), **החיפוש הקולי לא יעבוד עדיין**.

לתיקון זה, צריך להוסיף HTTPS. רוצה שאכין גרסה עם HTTPS מוכנה?
