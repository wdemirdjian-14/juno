#!/usr/bin/env bash
# Met à jour le site sur le VPS depuis GitHub. Usage : sudo bash /var/www/juno/deploy/deploy.sh
set -euo pipefail
cd /var/www/juno
git -c safe.directory=/var/www/juno pull --ff-only origin main
chown -R www-data:www-data /var/www/juno
echo "Site JUNO mis à jour."
