#!/usr/bin/env bash
# Configure l'envoi des e-mails du site depuis la boîte du cabinet.
# Usage : sudo bash /var/www/juno/deploy/configure-mail.sh
# Le mot de passe est saisi ici, masqué, et n'est enregistré que sur ce serveur (/etc/juno-admin.env).
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo."; exit 1; }

SITE=/var/www/juno
ENV_FILE=/etc/juno-admin.env

read -r -p "Adresse d'envoi [contact@juno-avocates.fr] : " ADDR
ADDR=${ADDR:-contact@juno-avocates.fr}
DOMAIN=${ADDR#*@}

# serveur d'envoi selon l'hébergeur de la messagerie (enregistrement MX du domaine)
MX=$( (dig +short MX "$DOMAIN" 2>/dev/null || true) | tr 'A-Z' 'a-z')
case "$MX" in
  *google*)              HOST=smtp.gmail.com;        PORT=465; PROVIDER="Google Workspace" ;;
  *outlook*|*office365*) HOST=smtp.office365.com;    PORT=587; PROVIDER="Microsoft 365" ;;
  *ionos*|*kundenserver*) HOST=smtp.ionos.fr;        PORT=587; PROVIDER="IONOS" ;;
  *ovh*)                 HOST=ssl0.ovh.net;          PORT=465; PROVIDER="OVH" ;;
  *)                     HOST=smtp.gmail.com;        PORT=465; PROVIDER="inconnu (Google par défaut)" ;;
esac
echo "Messagerie détectée : $PROVIDER → $HOST:$PORT"
read -r -p "Serveur d'envoi [$HOST] : " IN; HOST=${IN:-$HOST}
read -r -p "Port [$PORT] : " IN; PORT=${IN:-$PORT}

MODE=password
if [ "$HOST" = "smtp.gmail.com" ]; then
  echo
  echo "Deux façons d'envoyer avec Google Workspace :"
  echo "  1) mot de passe d'application (16 lettres)"
  echo "  2) relais SMTP Google : sans mot de passe, ce serveur est autorisé par son adresse IP"
  echo "     (à configurer d'abord dans admin.google.com → Gmail → Routage → Service de relais SMTP)"
  read -r -p "Votre choix [2] : " IN
  [ "${IN:-2}" = "1" ] || MODE=relay
fi

# réglages conservés, seules les lignes e-mail sont remplacées
touch "$ENV_FILE"
sed -i '/^\s*#\?\s*\(SMTP_HOST\|SMTP_PORT\|SMTP_USER\|SMTP_PASS\|SMTP_PASS_B64\|SMTP_FROM\|SMTP_HELO\|NOTIFY_TO\|REPLY_BCC\|SITE_URL\)=/d' "$ENV_FILE"

if [ "$MODE" = relay ]; then
  IP=$(curl -4 -s --max-time 5 ifconfig.me || echo "?")
  echo "→ Relais SMTP : l'adresse IP de ce serveur ($IP) doit être autorisée dans la console Google."
  cat >> "$ENV_FILE" <<CONF
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_HELO=juno-avocates-paris.walautao.fr
SMTP_FROM="JUNO Avocat·es <$ADDR>"
NOTIFY_TO=$ADDR
REPLY_BCC=$ADDR
SITE_URL=https://juno-avocates-paris.walautao.fr
CONF
else
  [ "$HOST" = "smtp.gmail.com" ] && echo "Mot de passe d'application : myaccount.google.com/apppasswords (connecté avec $ADDR)"
  read -r -s -p "Mot de passe de $ADDR : " PASS; echo
  [ -n "$PASS" ] || { echo "Mot de passe vide, abandon."; exit 1; }
  PASS=${PASS// /}   # Google affiche le mot de passe d'application par groupes de 4 lettres
  cat >> "$ENV_FILE" <<CONF
SMTP_HOST=$HOST
SMTP_PORT=$PORT
SMTP_USER=$ADDR
SMTP_PASS_B64=$(printf '%s' "$PASS" | base64 -w0)
SMTP_FROM="JUNO Avocat·es <$ADDR>"
NOTIFY_TO=$ADDR
SITE_URL=https://juno-avocates-paris.walautao.fr
CONF
  unset PASS
fi
chown root:www-data "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "→ Installation du module d'envoi"
(cd "$SITE/server" && sudo -u www-data env npm_config_cache=/tmp/juno-npm npm install --omit=dev --no-audit --no-fund --loglevel=error)

echo "→ Test de connexion et e-mail de test"
if node "$SITE/server/send-test.js"; then
  systemctl restart juno-admin
  echo
  echo "E-mails activés : vérifiez la boîte $ADDR (e-mail « Test des e-mails du site JUNO »)."
else
  echo
  echo "Le test a échoué : le service n'a pas été redémarré. Corrigez puis relancez ce script."
  exit 1
fi
