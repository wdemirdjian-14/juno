#!/usr/bin/env bash
# Vérifie le site en ligne de bout en bout. Usage : sudo bash /var/www/juno/deploy/check.sh
# (ajoutez « --mail » pour envoyer aussi un e-mail de test à la boîte du cabinet)
DOMAIN=juno-avocates.fr
OLD=juno-avocates-paris.walautao.fr
U=https://$DOMAIN
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then echo "✓ $1"; pass=$((pass+1)); else echo "✗ $1${3:+ — $3}"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -m 10 -w '%{http_code}' "$@"; }
loc()  { curl -s -o /dev/null -m 10 -w '%{redirect_url}' "$@"; }

echo "== Site"
c=$(code $U/);                      [ "$c" = 200 ]; ok "page d'accueil $U ($c)" $?
curl -s -m 10 $U/ | grep -q 'application/ld+json'; ok "données structurées présentes" $?
r=$(loc http://$DOMAIN/);           [ "$r" = "$U/" ]; ok "http → https ($r)" $?
r=$(loc https://www.$DOMAIN/);      [ "$r" = "$U/" ]; ok "www → $DOMAIN ($r)" $?
r=$(loc https://$OLD/);             [ "$r" = "$U/" ]; ok "ancienne adresse → $DOMAIN ($r)" $?
for f in robots.txt sitemap.xml site.webmanifest assets/img/og-juno.jpg assets/fonts/manrope-latin.woff2; do
  c=$(code $U/$f); [ "$c" = 200 ]; ok "/$f ($c)" $?
done
curl -s -m 10 -H 'Accept-Encoding: gzip' -o /dev/null -D - $U/assets/css/style.css | grep -qi 'content-encoding: gzip'; ok "compression gzip" $?

echo "== Sécurité"
for f in server/server.js deploy/deploy.sh README.md .git/config; do
  c=$(code $U/$f); [ "$c" = 403 ] || [ "$c" = 404 ]; ok "/$f non accessible ($c)" $?
done
c=$(code $U/api/admin/messages); [ "$c" = 401 ]; ok "API du back-office protégée ($c)" $?
end=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
[ -n "$end" ]; ok "certificat HTTPS valide jusqu'au ${end:-?}" $?

echo "== Back-office et formulaire"
systemctl is-active --quiet juno-admin; ok "service juno-admin actif" $?
c=$(code $U/admin/); [ "$c" = 200 ]; ok "page /admin/ ($c)" $?
c=$(code -X POST -H 'Content-Type: application/json' -A 'check' -d '{}' $U/api/contact); [ "$c" = 400 ]; ok "API du formulaire répond ($c)" $?
nginx -t >/dev/null 2>&1; ok "configuration Nginx valide" $?

echo "== DNS et messagerie"
dig +short MX $DOMAIN | grep -qi google;                     ok "MX Google" $?
dig +short TXT $DOMAIN | grep -q 'v=spf1.*_spf.google.com';  ok "SPF" $?
dig +short TXT google._domainkey.$DOMAIN | grep -q 'v=DKIM1'; ok "DKIM" $?
dig +short TXT _dmarc.$DOMAIN | grep -q 'v=DMARC1';          ok "DMARC" $?
grep -q '^SMTP_HOST=' /etc/juno-admin.env 2>/dev/null;       ok "envoi d'e-mails configuré" $?
if [ "${1:-}" = "--mail" ]; then node /var/www/juno/server/send-test.js; ok "e-mail de test envoyé" $?; fi

echo; echo "$pass réussis, $fail en échec"
