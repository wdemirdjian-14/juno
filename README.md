# JUNO AVOCAT·ES — site vitrine

Site statique (un seul `index.html` + dossier `assets/`).

## Images à ajouter

Placer ces 3 fichiers dans `assets/` :

- `juno-signature.png` (logo en-tête)
- `juno-identite.jpg` (logo principal)
- `judith-et-jade.jpg` (photo de l'équipe)

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
