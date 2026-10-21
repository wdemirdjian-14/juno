#!/usr/bin/env bash
# Installe le back-office JUNO sur le VPS (une seule fois).
# Usage : sudo bash /var/www/juno/deploy/install-backoffice.sh
set -euo pipefail

SITE=/var/www/juno
DATA=/var/lib/juno
NGINX_SITE=/etc/nginx/sites-available/juno

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo."; exit 1; }

# 1. Node.js 18 ou plus
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "→ Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "→ Node.js $(node -v)"

# 2. Le port 3100 doit être libre (ou déjà utilisé par le back-office)
if ss -ltn | grep -q '127.0.0.1:3100 \|\*:3100 \|:::3100 ' && ! systemctl is-active --quiet juno-admin; then
  echo "Le port 3100 est déjà utilisé par une autre application. Abandon."; exit 1
fi

# 3. Dossier des données (messages, textes, statistiques) : hors du dossier public
mkdir -p "$DATA"
chown www-data:www-data "$DATA"
chmod 711 "$DATA"  # Nginx (quel que soit son utilisateur) atteint public/ sans pouvoir lister ni lire les données
chown -R www-data:www-data "$SITE"

# 4. Dépendance facultative (notifications e-mail)
echo "→ Installation des dépendances"
(cd "$SITE/server" && sudo -u www-data env npm_config_cache=/tmp/juno-npm npm install --omit=dev --no-audit --no-fund --loglevel=error) \
  || echo "  (nodemailer non installé : les notifications e-mail seront désactivées)"

# 5. Mot de passe du back-office
if [ ! -f "$DATA/auth.json" ]; then
  echo "→ Choix du mot de passe du back-office"
  sudo -u www-data env JUNO_DATA="$DATA" node "$SITE/server/set-password.js"
fi

# 6. Réglages
[ -f /etc/juno-admin.env ] || install -m 640 -o root -g www-data "$SITE/deploy/juno-admin.env.example" /etc/juno-admin.env

# 7. Service
cp "$SITE/deploy/juno-admin.service" /etc/systemd/system/juno-admin.service
systemctl daemon-reload
systemctl enable --quiet juno-admin
systemctl restart juno-admin
sleep 1
systemctl is-active --quiet juno-admin || { journalctl -u juno-admin -n 30 --no-pager; exit 1; }
echo "→ Service juno-admin démarré"

# 8. Nginx : ajoute les routes du back-office dans chaque bloc du site (HTTP et HTTPS)
cp "$SITE/deploy/nginx-backoffice.conf" /etc/nginx/snippets/juno-backoffice.conf
if ! grep -q 'snippets/juno-backoffice.conf' "$NGINX_SITE"; then
  cp "$NGINX_SITE" "/root/nginx-juno.backup.$(date +%Y%m%d%H%M%S)"
  sed -i 's#^\(\s*\)root /var/www/juno;#&\n\1include snippets/juno-backoffice.conf;#' "$NGINX_SITE"
fi
nginx -t
systemctl reload nginx

echo
echo "Back-office installé : https://juno-avocates-paris.walautao.fr/admin/"
