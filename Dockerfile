# Nginx with HTTPS for Shopping List App
FROM nginx:alpine

# Copy all application files
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY styles-new.css /usr/share/nginx/html/
COPY icons.css /usr/share/nginx/html/
COPY icon-btn-border-fix.css /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY service-worker.js /usr/share/nginx/html/
COPY modal-add-custom-item.html /usr/share/nginx/html/
COPY icons/ /usr/share/nginx/html/icons/
COPY data/ /usr/share/nginx/html/data/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
