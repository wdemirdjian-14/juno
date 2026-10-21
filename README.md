# JUNO AVOCAT·ES — site vitrine

Site statique (un seul `index.html` + dossier `assets/`).

## Structure

- `index.html` : la page
- `assets/css/style.css` : styles (mobile first)
- `assets/js/main.js` : animations au défilement, menu, widget de contact
- `assets/img/` : images optimisées

Après une modification du CSS ou du JS, incrémenter `?v=` dans `index.html` pour forcer les navigateurs à recharger.

## Formulaire de contact (widget enveloppe)

Les messages sont envoyés via [FormSubmit](https://formsubmit.co) à l'adresse définie par `CONTACT_EMAIL` en haut de `assets/js/main.js`.
Au premier envoi depuis le site en ligne, FormSubmit envoie un e-mail d'activation à cette adresse : il faut cliquer sur le lien une fois.
Si l'envoi échoue, le visiteur se voit proposer d'écrire directement depuis sa messagerie.

## Installation sur le VPS IONOS (Ubuntu/Debian) — une seule fois

```bash
ssh root@IP_DU_VPS
apt update && apt install -y nginx git certbot python3-certbot-nginx
git clone https://github.com/wdemirdjian-14/juno.git /var/www/juno
chown -R www-data:www-data /var/www/juno

cp /var/www/juno/deploy/nginx-juno.conf /etc/nginx/sites-available/juno
ln -s /etc/nginx/sites-available/juno /etc/nginx/sites-enabled/juno
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# HTTPS gratuit (une fois le DNS du domaine pointé vers l'IP du VPS)
certbot --nginx -d juno-avocates-paris.walautao.fr
```

Si le dépôt GitHub est privé, utiliser un *token* GitHub (ou une clé SSH de déploiement) pour le `git clone`.

## Mettre à jour le site

1. Modifier les fichiers en local, puis `git add . && git commit -m "..." && git push`
2. Sur le VPS : `sudo bash /var/www/juno/deploy/deploy.sh`
