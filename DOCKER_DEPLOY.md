# Shopping List - Docker Deployment

## Deploy to Ubuntu Server with Docker

### Option 1: Quick Deploy (Self-Signed Certificate)

1. **Upload files to server:**
   ```bash
   scp -r . user@your-server-ip:/home/user/shopping-list/
   ```

2. **On the server, generate SSL certificates:**
   ```bash
   cd /home/user/shopping-list
   chmod +x generate-ssl.sh
   ./generate-ssl.sh
   ```

3. **Start the container:**
   ```bash
   docker-compose up -d
   ```

4. **Access your app:**
   ```
   https://192.168.1.180:8443
   ```
   
   Your PhotoPrism is already on: `https://192.168.1.180:2342`

### Option 2: Production Deploy (Let's Encrypt)

1. **Install Certbot on server:**
   ```bash
   sudo apt update
   sudo apt install certbot
   ```

2. **Get SSL certificate:**
   ```bash
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. **Copy certificates to project:**
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
   sudo chmod 644 ./ssl/*.pem
   ```

4. **Update docker-compose.yml ports (optional):**
   ```yaml
   ports:
     - "443:443"   # HTTPS
     - "80:80"     # HTTP
   ```

5. **Start container:**
   ```bash
   docker-compose up -d
   ```

### Portainer Deployment

If using Portainer:

1. Go to Portainer UI
2. Click "Stacks" → "Add Stack"
3. Name: `shopping-list`
4. Upload `docker-compose.yml` or paste its contents
5. Add environment variables if needed
6. Click "Deploy the stack"

### Managing the Container

```bash
# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

### Accessing from Mobile Devices

1. Make sure your server IP (192.168.1.180) is accessible on your local network
2. Access: `https://192.168.1.180:8443`
3. Accept the security warning (for self-signed certs)
4. Voice recognition will now work! 🎤
5. PhotoPrism images will sync from: `https://192.168.1.180:2342`

### Firewall Configuration

If you have a firewall, allow the ports:

```bash
sudo ufw allow 8443/tcp
sudo ufw allow 8080/tcp
# Or for production:
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
```

### Auto-Renewal for Let's Encrypt

Add to crontab:
```bash
0 0 * * * certbot renew --quiet && docker-compose restart shopping-list
```
