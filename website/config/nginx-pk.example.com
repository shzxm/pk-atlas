# Public example: replace example.com, certificate paths and static root before use.
# Do not copy your production certificate/private key into any repository.
server {
    listen 443 ssl;
    server_name example.com;
    root /var/www/pk-atlas;
    index index.html;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'" always;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types application/javascript text/javascript text/css application/manifest+json;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8766;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        add_header Cache-Control "no-store, max-age=0" always;
    }
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache" always;
    }
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }
    location ~* \.(js|css|png|ico|webp)$ {
        add_header Cache-Control "public, max-age=600" always;
    }
    location ~* \.html$ {
        add_header Cache-Control "public, max-age=0, must-revalidate, s-maxage=120" always;
    }
    location = / {
        add_header Cache-Control "public, max-age=0, must-revalidate, s-maxage=120" always;
        try_files /index.html =404;
    }
    location / {
        try_files $uri $uri/ =404;
    }
}
