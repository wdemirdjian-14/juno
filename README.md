# JUNO AVOCAT·ES — site vitrine

Site statique (un seul `index.html` + dossier `assets/`).

## Structure

- `index.html` : la page
- `assets/css/style.css` : styles (mobile first)
- `assets/js/main.js` : animations au défilement, menu, widget de contact
- `assets/img/` : images optimisées

Après une modification du CSS ou du JS, incrémenter `?v=` dans `index.html` pour forcer les navigateurs à recharger.

## Back-office (`/admin/`)

Accès unique par mot de passe : https://juno-avocates-paris.walautao.fr/admin/

- **Statistiques** : visiteurs, pages vues, sources, appareils, sections lues, heures de visite. Mesure maison, sans cookie : l'IP n'est jamais enregistrée (empreinte du jour effacée chaque nuit).
- **Messages** : les demandes du formulaire arrivent « À traiter ». Statut (nouveau, en cours, traité), notes internes, archivage, suppression définitive des archivés.
- **Textes** : tous les textes du site sont modifiables ; le site est régénéré à l'enregistrement. « Rétablir l'original » revient au texte de `index.html`.
- **Réglages** : changement du mot de passe.

Organisation :

- `server/` : serveur Node.js (aucune dépendance obligatoire ; `nodemailer` facultatif pour les notifications)
- `admin/` : interface du back-office
- données sur le VPS dans `/var/lib/juno` (hors du dossier public) : `messages.json`, `content.json`, `analytics/`, `auth.json`
- réglages facultatifs dans `/etc/juno-admin.env` (notifications e-mail, voir `deploy/juno-admin.env.example`)

Installation (une fois) : `sudo bash /var/www/juno/deploy/install-backoffice.sh`

Mot de passe oublié : `sudo -u www-data JUNO_DATA=/var/lib/juno node /var/www/juno/server/set-password.js`

Sauvegarde des messages : copier régulièrement le dossier `/var/lib/juno`.

Aperçu local : `JUNO_DATA=./.data SERVE_STATIC=1 node server/server.js` puis http://127.0.0.1:3100

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
