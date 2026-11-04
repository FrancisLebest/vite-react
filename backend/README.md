# StudyHub – Backend

API REST + temps réel (Socket.IO) de StudyHub, le réseau social éducatif façon TikTok pour étudiants.
Le contrat d'API partagé avec l'application mobile est dans [`../docs/API.md`](../docs/API.md).

## Stack

- **Node.js 22 + TypeScript**, **Express 4**
- **PostgreSQL 16** via `pg` (SQL paramétré, migrations SQL versionnées dans `migrations/`).
  Les compteurs dénormalisés (likes, commentaires, abonnés, membres…) sont maintenus par des **triggers** PostgreSQL : ils restent cohérents même lors des suppressions en cascade (suppression de compte, de post…).
  Extensions utilisées : `pg_trgm` (recherche floue) et `citext` (unicité insensible à la casse).
- **zod** (validation), **jsonwebtoken** (access token 15 min), refresh tokens opaques (30 jours, hachés en base, rotation + détection de réutilisation), **bcryptjs**
- **multer** (uploads), **ffmpeg/ffprobe**, **sharp** (images/avatars : rotation EXIF, suppression des métadonnées, redimensionnement)
- **Pipeline vidéo** : chaque vidéo publiée est transcodée en tâche de fond en H.264/AAC MP4 720p max (`+faststart`), ce qui règle le HEVC des iPhone sur Android. File **BullMQ + Redis** si `REDIS_URL` est défini (worker séparé : `npm run worker`), sinon file en mémoire dans le processus API
- **Notifications push** via **FCM HTTP v1** (Android + iOS via APNs-through-FCM), préférences par utilisateur, suppression automatique des tokens invalides ; no-op si FCM n'est pas configuré
- Filtre de contenu (liste de mots FR/EN configurable), modération/admin, comptes privés, sondages/quiz, séries de cours, événements de communauté, statistiques créateur
- **Socket.IO** (rooms `user:<id>`, adaptateur Redis optionnel pour plusieurs instances)
- **helmet**, **cors**, **express-rate-limit** (limite stricte sur l'auth), **pino** (logs JSON), **nodemailer** (codes de réinitialisation)
- Stockage : disque local (`uploads/`, servi sur `/uploads`) ou **S3 compatible** (AWS S3, Cloudflare R2, MinIO, Scaleway…)
- Tests : **vitest + supertest** sur une vraie base PostgreSQL

> Pourquoi pas Prisma ? Le classement du fil « Pour toi », les indicateurs dépendants du lecteur (`likedByMe`, `isFollowing`…) et le masquage des utilisateurs bloqués s'expriment beaucoup plus simplement en SQL ; et l'image Docker n'a pas besoin de moteurs binaires supplémentaires.

## Arborescence

```
backend/
├── migrations/            # migrations SQL (appliquées dans l'ordre, suivies dans schema_migrations)
├── src/
│   ├── index.ts           # démarrage HTTP + Socket.IO
│   ├── app.ts             # application Express (middlewares, routes)
│   ├── config.ts          # lecture/validation des variables d'environnement
│   ├── db/                # pool pg, transactions, runner de migrations
│   ├── lib/               # erreurs, pagination, tokens, mail, catégories, texte (#hashtags/@mentions)
│   ├── media/             # traitement vidéo/image/audio (ffmpeg, sharp)
│   ├── middleware/        # auth, upload, erreurs, rate limit
│   ├── realtime/          # Socket.IO
│   ├── routes/            # auth, users, posts/feed, communities, search, conversations, notifications, reports, meta
│   ├── services/          # hydratation des objets API, notifications
│   ├── storage/           # stockage local / S3
│   └── scripts/seed-admin.ts
├── tests/                 # tests d'intégration (vitest + supertest + socket.io-client)
├── Dockerfile
└── docker-compose.yml
```

## Démarrage local

Prérequis : Node 22, PostgreSQL 16 (avec `pg_trgm`/`citext`, fournis par le paquet standard), ffmpeg.

```bash
cd backend
npm install
cp .env.example .env          # puis renseigner JWT_SECRET et DATABASE_URL

# Base locale (exemple avec un cluster jetable sur le port 5433)
initdb -D /tmp/pgdata -U postgres --auth=trust        # (sous l'utilisateur postgres si vous êtes root)
pg_ctl -D /tmp/pgdata -o "-p 5433 -k /tmp -c listen_addresses=localhost" -l /tmp/pgdata/server.log start
psql -h localhost -p 5433 -U postgres -c "ALTER USER postgres PASSWORD 'postgres'" \
     -c "CREATE DATABASE studyhub" -c "CREATE DATABASE studyhub_test"

npm run db:migrate            # applique les migrations
npm run dev                   # API sur http://localhost:4000 (rechargement à chaud)
curl http://localhost:4000/health   # {"status":"ok"}
```

Build de production :

```bash
npm run build                 # compile vers dist/
npm run db:deploy             # migrations avec le code compilé
npm start                     # node dist/index.js
```

Scripts disponibles :

| Script | Rôle |
|---|---|
| `npm run dev` | serveur de développement (tsx watch) |
| `npm run build` | compilation TypeScript (`dist/`) |
| `npm start` | démarre le serveur compilé |
| `npm test` | tests d'intégration (base `studyhub_test`) |
| `npm run db:migrate` | applique les migrations (sources TS) |
| `npm run db:deploy` | applique les migrations (code compilé, prod) |
| `npm run seed:admin` | crée **un seul** compte vérifié depuis `ADMIN_*` (aucune autre donnée) |
| `npm run worker` | worker vidéo autonome (BullMQ, nécessite `REDIS_URL`) — `npm run worker:prod` pour le code compilé |
| `npm run make-admin -- <email>` | donne les droits administrateur (`-- --revoke <email>` pour les retirer) — `make-admin:prod` en production |

Aucune donnée fictive n'est jamais insérée : seules les catégories (liste de référence dans `src/lib/categories.ts`) existent dans le code.

## Tests

Les tests tournent contre une **vraie** base PostgreSQL (par défaut `postgres://postgres:postgres@localhost:5433/studyhub_test`, modifiable via `TEST_DATABASE_URL`). Le schéma est recréé à chaque exécution et les fichiers médias de test (mp4, png, m4a) sont générés avec ffmpeg.

```bash
npm test
```

Couverture v1.1 en plus : transcodage d'un vrai clip HEVC (file en mémoire et BullMQ/Redis si `redis-server` est installé), push FCM contre un serveur FCM simulé, commentaires v2, sondages/quiz, séries, comptes privés et demandes d'abonnement, politique de DM, historique, reposts, hashtags, vérification e-mail, statistiques, admin/suspension, filtre de contenu, événements.

Couverture v1 : inscription/connexion/rotation des refresh tokens, mot de passe oublié/changement, auth obligatoire, format des erreurs de validation, follow + notifications, posts texte/vidéo (miniature ffmpeg)/image/audio, fil forYou/following/filtres, compteurs likes/favoris/partages/vues/commentaires, communautés (adhésion, règles propriétaire), recherche, messagerie (DM, groupes, non-lus, accusés de lecture, `message:new` via Socket.IO, typing), blocage (masquage dans les deux sens, DM interdits), suppression de compte en cascade, signalements.

## Variables d'environnement

Toutes sont documentées dans [`.env.example`](.env.example). Les principales :

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | – (obligatoire) | URL PostgreSQL |
| `DATABASE_SSL` | `false` | `true` pour les bases managées exigeant TLS |
| `JWT_SECRET` | – (obligatoire, ≥ 16 car.) | secret de signature des access tokens |
| `PUBLIC_URL` | `http://localhost:4000` | URL publique de l'API, utilisée pour les URLs absolues des médias |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | écoute HTTP |
| `AUTO_MIGRATE` | `false` | applique les migrations au démarrage |
| `CORS_ORIGINS` | `*` | origines autorisées (liste séparée par des virgules) |
| `TRUST_PROXY` | `false` | à mettre à `1` derrière un reverse proxy (Render, Railway, nginx) |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*` | 300 req/min, 30 req/15 min | limitation de débit globale / auth |
| `STORAGE_DRIVER` | `local` (ou `s3` si `S3_BUCKET` est défini) | stockage des médias |
| `UPLOAD_DIR` | `uploads` | dossier du stockage local (servi sur `/uploads`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL` | – | stockage S3 compatible |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | – | envoi des codes de réinitialisation ; sans `SMTP_HOST`, le code est écrit dans les logs |
| `REDIS_URL` | – | file BullMQ des vidéos + adaptateur Redis Socket.IO (plusieurs instances) |
| `WORKER_IN_API` | `false` | avec Redis, fait aussi tourner un worker vidéo dans le processus API |
| `VIDEO_TRANSCODE` / `VIDEO_CONCURRENCY` / `VIDEO_MAX_HEIGHT` | `true` / `1` / `720` | pipeline de transcodage (désactivable : vidéos publiées immédiatement, simple remux) |
| `FCM_PROJECT_ID`, `FCM_CREDENTIALS_JSON` (JSON brut ou base64) ou `FCM_CREDENTIALS_FILE` | – | notifications push Firebase (compte de service) |
| `CONTENT_FILTER` / `CONTENT_FILTER_WORDS` / `CONTENT_FILTER_DEFAULTS` | `mask` / – / `true` | filtre de mots (`mask`, `reject` ou `off`), mots supplémentaires, liste intégrée |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | binaires ffmpeg |
| `LOG_LEVEL` | `info` | niveau de logs pino |

## Déploiement

### VPS avec Docker Compose (recommandé pour démarrer)

```bash
cd backend
cp .env.example .env
# Éditer .env : JWT_SECRET (openssl rand -base64 48), PUBLIC_URL=https://api.mondomaine.fr, POSTGRES_PASSWORD=...
docker compose up -d --build
docker compose logs -f api
# Optionnel : compte vérifié
docker compose exec api node dist/scripts/seed-admin.js   # avec ADMIN_EMAIL/ADMIN_USERNAME/ADMIN_PASSWORD dans .env
```

Le compose lance PostgreSQL, Redis, l'API et un **worker vidéo** (`docker compose up -d --scale worker=2` pour en ajouter). Le conteneur API applique les migrations au démarrage. Les médias sont stockés dans le volume `uploads` (partagé par l'API et le worker), la base dans `pgdata`. Administrateur : `docker compose exec api node dist/scripts/make-admin.js vous@exemple.fr`. Placez un reverse proxy HTTPS devant (Caddy, nginx, Traefik) en transmettant les WebSockets (`/socket.io`) et pensez à `TRUST_PROXY=1`.

### Render / Railway / Fly.io

1. Créer une base PostgreSQL managée et récupérer son URL (`DATABASE_URL`, souvent avec `DATABASE_SSL=true`).
2. Créer un service Web à partir du dossier `backend/` avec le `Dockerfile` (ffmpeg y est installé).
3. Variables : `DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `PUBLIC_URL` (URL publique du service), `TRUST_PROXY=1`.
4. Le disque de ces plateformes est éphémère : utiliser le **stockage S3** (`S3_BUCKET`, `S3_ENDPOINT`, clés, `S3_PUBLIC_URL`) ou un disque persistant monté sur `UPLOAD_DIR`.
5. Health check : `GET /health`.

Sans Docker : `npm ci && npm run build && npm run db:deploy && npm start` (ffmpeg doit être installé sur la machine).

## Brancher l'application mobile

L'application mobile (`../mobile`) appelle `${API_URL}/api/v1` et se connecte à Socket.IO sur le même hôte (`path: /socket.io`, `auth: { token }`).

| Contexte | `API_URL` |
|---|---|
| Simulateur iOS | `http://localhost:4000` |
| Émulateur Android | `http://10.0.2.2:4000` |
| Téléphone physique (même Wi-Fi) | `http://<IP-de-votre-machine>:4000` |
| Production | `https://api.mondomaine.fr` |

Pensez à régler `PUBLIC_URL` sur une adresse joignable par le téléphone (sinon les URLs des vidéos/images renvoyées par l'API ne seront pas accessibles). Exemple pour un téléphone physique : `PUBLIC_URL=http://192.168.1.20:4000`.
En production, utilisez HTTPS (iOS bloque le HTTP en clair par défaut via ATS).

## Notifications push (FCM)

1. Dans la console Firebase, créer le projet, ajouter les apps Android et iOS (pour iOS, téléverser la clé APNs `.p8` dans *Paramètres du projet → Cloud Messaging*).
2. *Paramètres du projet → Comptes de service → Générer une nouvelle clé privée* : fichier JSON.
3. Renseigner `FCM_CREDENTIALS_FILE=/chemin/service-account.json` (ou `FCM_CREDENTIALS_JSON` avec le contenu, éventuellement en base64). `FCM_PROJECT_ID` est lu dans le JSON par défaut.
4. L'app mobile enregistre son token FCM avec `POST /users/me/push-token` et le retire à la déconnexion avec `DELETE /users/me/push-token`.

Sans configuration, l'envoi est simplement ignoré (log de niveau debug).

## Limites connues / TODO

- Pas de streaming adaptatif (HLS / multi-débits) : une seule rendition MP4 720p par vidéo. Les vidéos envoyées en **messages privés** sont seulement remuxées (pas transcodées).
- Sans Redis, la file vidéo est en mémoire : les vidéos en cours sont relancées au redémarrage de l'API, mais un seul processus API doit tourner.
- Pas de badge de compteur iOS calculé côté serveur dans les push ; pas d'envoi groupé (un appel FCM par appareil).
- Le filtre de contenu est basique (mots entiers/préfixes, sans détection du leetspeak ni modération d'images/vidéos).
- Le classement « Pour toi » est calculé en SQL à chaque requête (score engagement / ancienneté^1.5, bonus abonnements, centres d'intérêt et université, vidéos déjà vues en dernier) : à grande échelle il faudra une table de scores pré-calculés.
- La modération se fait via l'API `/admin/*` (pas d'interface web d'administration dédiée).
- La vérification d'e-mail n'est pas bloquante : un compte non vérifié garde l'accès complet (l'app affiche un rappel).
