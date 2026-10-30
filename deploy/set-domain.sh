#!/usr/bin/env bash
# Passe le site sur son nom de domaine définitif, en HTTPS.
# Usage : sudo bash /var/www/juno/deploy/set-domain.sh [juno-avocates.fr]
# - https://juno-avocates.fr devient l'adresse principale
# - www.juno-avocates.fr et l'ancienne adresse juno-avocates-paris.walautao.fr y sont redirigés
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo."; exit 1; }

DOMAIN=${1:-juno-avocates.fr}
OLD=juno-avocates-paris.walautao.fr
SITE=/var/www/juno
CONF=/etc/nginx/sites-available/juno
ACME=/etc/nginx/sites-enabled/juno-acme-temp
ENV_FILE=/etc/juno-admin.env

# 1. Les deux adresses doivent déjà pointer vers ce serveur
IP=$(curl -4 -s --max-time 5 ifconfig.me)
for h in "$DOMAIN" "www.$DOMAIN"; do
  got=$(getent ahostsv4 "$h" | awk '{print $1; exit}')
  if [ "$got" != "$IP" ]; then
    echo "$h pointe vers « ${got:-rien} » au lieu de $IP (ce serveur)."
    echo "Les DNS ne sont pas encore à jour : réessayez plus tard."
    exit 1
  fi
done
echo "→ $DOMAIN et www.$DOMAIN pointent bien vers ce serveur ($IP)"

# 2. Certificat HTTPS pour les trois adresses (validation par fichier, sans couper le site actuel)
cat > "$ACME" <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $SITE; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}
CONF
nginx -t && systemctl reload nginx
certbot certonly --webroot -w "$SITE" --cert-name "$DOMAIN" \
  -d "$DOMAIN" -d "www.$DOMAIN" -d "$OLD" --non-interactive --agree-tos --keep-until-expiring \
  --register-unsafely-without-email
rm -f "$ACME"

# 3. Nouvelle configuration Nginx (l'ancienne est sauvegardée)
cp "$CONF" "/root/nginx-juno.backup.$(date +%Y%m%d%H%M%S)"
SSL="    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] && SSL="$SSL
    include /etc/letsencrypt/options-ssl-nginx.conf;"
[ -f /etc/letsencrypt/ssl-dhparams.pem ] && SSL="$SSL
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

cat > "$CONF" <<CONF
# Site JUNO AVOCAT·ES — généré par deploy/set-domain.sh

# HTTP : renouvellement des certificats, puis redirection vers https://$DOMAIN
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN $OLD;
    location ^~ /.well-known/acme-challenge/ { root $SITE; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

# HTTPS : www et ancienne adresse redirigées vers l'adresse principale
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.$DOMAIN $OLD;
$SSL
    return 301 https://$DOMAIN\$request_uri;
}

# HTTPS : le site
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
$SSL

    root $SITE;
    index index.html;
    include snippets/juno-backoffice.conf;

    # Ne jamais servir les fichiers internes du dépôt
    location ~ /\.(git|ht) { deny all; }
    location ^~ /deploy/ { deny all; }
    location ~ \.md\$ { deny all; }

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~* \.(jpg|jpeg|png|svg|webp|css|js|woff2?)\$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
CONF
nginx -t && systemctl reload nginx

# 4. Adresse du site utilisée dans les e-mails et le back-office
if [ -f "$ENV_FILE" ]; then
  sed -i '/^SITE_URL=/d' "$ENV_FILE"
  echo "SITE_URL=https://$DOMAIN" >> "$ENV_FILE"
  systemctl restart juno-admin
fi

echo
echo "Site en ligne sur https://$DOMAIN (back-office : https://$DOMAIN/admin/)"
echo "www.$DOMAIN et $OLD redirigent vers cette adresse."
