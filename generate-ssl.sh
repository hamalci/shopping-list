#!/bin/bash

# Generate self-signed SSL certificate for testing
# You can replace these with Let's Encrypt certificates later

echo "Creating SSL directory..."
mkdir -p ssl

echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -subj "/C=IL/ST=Israel/L=Local/O=Shopping-List/CN=192.168.1.180" \
  -addext "subjectAltName=DNS:localhost,IP:192.168.1.180,IP:127.0.0.1"

echo "✅ SSL certificates created in ./ssl/"
echo ""
echo "Next steps:"
echo "1. Upload this entire folder to your Ubuntu server (192.168.1.180)"
echo "2. Run: docker-compose up -d"
echo "3. Access via: https://192.168.1.180:8443"
echo ""
echo "PhotoPrism is on: https://192.168.1.180:2342"
echo "Shopping List will be on: https://192.168.1.180:8443"
echo ""
echo "⚠️  Remember to accept the self-signed certificate warning in your browser"

const cache = JSON.parse(localStorage.getItem('photoprismImageCache') || '{}');
console.log('Total images found:', Object.keys(cache).length);
console.log(cache);
