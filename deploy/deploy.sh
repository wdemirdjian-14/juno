#!/usr/bin/env bash
# Met à jour le site sur le VPS depuis GitHub. Usage : sudo bash /var/www/juno/deploy/deploy.sh
set -euo pipefail
cd /var/www/juno
git -c safe.directory=/var/www/juno pull --ff-only origin main
chown -R www-data:www-data /var/www/juno

# Back-office (s'il est installé) : routes Nginx et service à jour
if systemctl list-unit-files juno-admin.service >/dev/null 2>&1 && [ -f /etc/systemd/system/juno-admin.service ]; then
  (cd server && sudo -u www-data env npm_config_cache=/tmp/juno-npm npm install --omit=dev --no-audit --no-fund --loglevel=error) || true
  cp deploy/juno-admin.service /etc/systemd/system/juno-admin.service
  systemctl daemon-reload
  systemctl restart juno-admin
  cp deploy/nginx-backoffice.conf /etc/nginx/snippets/juno-backoffice.conf
  nginx -t && systemctl reload nginx
fi
echo "Site JUNO mis à jour."
