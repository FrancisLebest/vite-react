# StudyHub – Backend

API REST + temps réel (Socket.IO) de StudyHub, le réseau social éducatif façon TikTok pour étudiants.
Le contrat d'API partagé avec l'application mobile est dans [`../docs/API.md`](../docs/API.md).

## Stack

- **Node.js 22 + TypeScript**, **Express 4**
- **PostgreSQL 16** via `pg` (SQL paramétré, migrations SQL versionnées dans `migrations/`).
  Les compteurs dénormalisés (likes, commentaires, abonnés, membres…) sont maintenus par des **triggers** PostgreSQL : ils restent cohérents même lors des suppressions en cascade (suppression de compte, de post…).
  Extensions utilisées : `pg_trgm` (recherche floue) et `citext` (unicité insensible à la casse).
- **zod** (validation), **jsonwebtoken** (access token 15 min), refresh tokens opaques (30 jours, hachés en base, rotation + détection de réutilisation), **bcryptjs**
- **multer** (uploads), **ffmpeg/ffprobe** (miniature, durée et dimensions des vidéos, remux MP4 faststart), **sharp** (images/avatars : rotation EXIF, suppression des métadonnées, redimensionnement)
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

Aucune donnée fictive n'est jamais insérée : seules les catégories (liste de référence dans `src/lib/categories.ts`) existent dans le code.

## Tests

Les tests tournent contre une **vraie** base PostgreSQL (par défaut `postgres://postgres:postgres@localhost:5433/studyhub_test`, modifiable via `TEST_DATABASE_URL`). Le schéma est recréé à chaque exécution et les fichiers médias de test (mp4, png, m4a) sont générés avec ffmpeg.

```bash
npm test
```

Couverture : inscription/connexion/rotation des refresh tokens, mot de passe oublié/changement, auth obligatoire, format des erreurs de validation, follow + notifications, posts texte/vidéo (miniature ffmpeg)/image/audio, fil forYou/following/filtres, compteurs likes/favoris/partages/vues/commentaires, communautés (adhésion, règles propriétaire), recherche, messagerie (DM, groupes, non-lus, accusés de lecture, `message:new` via Socket.IO, typing), blocage (masquage dans les deux sens, DM interdits), suppression de compte en cascade, signalements.

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
| `REDIS_URL` | – | adaptateur Redis Socket.IO (plusieurs instances) |
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

Le conteneur applique les migrations au démarrage puis lance l'API. Les médias sont stockés dans le volume `uploads`, la base dans `pgdata`. Placez un reverse proxy HTTPS devant (Caddy, nginx, Traefik) en transmettant les WebSockets (`/socket.io`) et pensez à `TRUST_PROXY=1`.

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

## Limites connues / TODO

- Les notifications push (APNs/FCM) ne sont pas envoyées : les tokens sont seulement enregistrés (`POST /users/me/push-token`).
- Pas de transcodage vidéo (HLS / multi-débits) : les vidéos sont remuxées en MP4 « faststart » sans réencodage. Une vidéo HEVC venant d'un iPhone reste en HEVC.
- Le classement « Pour toi » est calculé en SQL à chaque requête (score engagement / ancienneté^1.5, bonus abonnements et université) : à grande échelle il faudra une table de scores pré-calculés.
- Pas d'interface de modération : les signalements sont stockés dans la table `reports` (statut `open`).
- Vérification d'e-mail non implémentée (le champ `verified` est géré manuellement, par ex. via `seed:admin`).
