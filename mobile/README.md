# StudyHub — application mobile (React Native, Android & iOS)

Réseau social éducatif façon TikTok pour étudiants : fil vidéo vertical, posts, communautés,
messagerie temps réel, notifications, recherche avancée et profils. L'application est
**entièrement branchée sur l'API réelle** (`../backend`, contrat dans [`../docs/API.md`](../docs/API.md)) :
il n'y a plus aucune donnée fictive (seules les icônes de catégories restent embarquées comme
repli hors-ligne, elles sont identiques à `GET /categories`).

## Compatibilité

| Plateforme | Version minimale | Où c'est configuré |
|------------|------------------|--------------------|
| Android    | **7.0 (API 24)** | `android/build.gradle` → `minSdkVersion = 24` |
| iOS        | **12.4**         | `ios/Podfile` (`min_ios_version_supported`) + projet Xcode (`IPHONEOS_DEPLOYMENT_TARGET = 12.4`) |

- **React Native 0.72.17** (dernière version supportant iOS 12), ancienne architecture, **Hermes** activé.
- Toutes les dépendances sont **épinglées** (versions exactes). Ne les mettez pas à jour sans
  vérifier leur version iOS / Android minimale (tableau ci-dessous).
- Le `Podfile` aligne la cible de déploiement de tous les pods sur 12.4 (`post_install`) : certains pods
  déclarent 8.0/9.0, ce que Xcode 14.3+ refuse (libarclite absente).

## Architecture

```
mobile/
├── App.tsx                       # QueryClient + SafeArea + Auth + ActionSheet + Navigation
├── react-native.config.js        # autolinking : react-native-video → implémentation ExoPlayer
├── patches/                      # patch-package (react-native-video, cf. plus bas)
├── src/
│   ├── env.ts                    # ⚙️ URL de l'API (surcharge locale)
│   ├── config.ts                 # résolution de l'URL (émulateur / simulateur / prod), mediaUrl()
│   ├── api/
│   │   ├── types.ts              # types = miroir de docs/API.md
│   │   ├── client.ts             # fetch typé, Bearer, refresh single-flight, uploads XHR + progression
│   │   ├── errors.ts             # ApiError normalisée (codes du contrat + NETWORK_ERROR/TIMEOUT…)
│   │   ├── endpoints.ts          # une fonction par route du contrat
│   │   └── tokenStorage.ts       # tokens dans le Keychain iOS / Keystore Android
│   ├── auth/AuthContext.tsx      # session : restauration au démarrage, login/register/logout, Me
│   ├── query/                    # React Query : clés, hooks, mises à jour optimistes, messagerie
│   ├── realtime/SocketProvider.tsx  # Socket.IO (messages, lecture, saisie, notifications)
│   ├── media/picker.ts           # caméra / galerie (react-native-image-picker) + permissions
│   ├── components/               # kit UI (ui.tsx), éléments de liste, lecteur vidéo, feuille d'actions
│   ├── screens/                  # un écran par fichier (+ screens/auth)
│   ├── navigation/               # pile auth / pile connectée + onglets
│   └── theme, utils, constants
├── __tests__/                    # Jest (client API, cache, parcours auth, écrans)
└── integration/                  # test live contre un backend lancé (hors `npm test`)
```

**Couche API** (`src/api/client.ts`)
- Ajoute `Authorization: Bearer <accessToken>` ; sur `401`, **un seul** `POST /auth/refresh`
  est lancé même si plusieurs requêtes échouent en même temps (single-flight), puis les requêtes
  sont rejouées avec le nouveau token. Le refresh token est **renouvelé à chaque rotation** et
  re-sauvegardé dans le Keychain.
- Refresh refusé par le serveur → session effacée et retour à l'écran d'accueil.
  Échec réseau pendant le refresh → la session est conservée.
- Erreurs normalisées en `ApiError {status, code, message, details}` ; `error.fields` donne les
  erreurs par champ (`VALIDATION_ERROR` → `[{path, message}]`, `CONFLICT` → `{field}`), affichées
  directement sous les champs des formulaires.
- Uploads multipart via `XMLHttpRequest` pour la **barre de progression** (vidéos ≤ 100 Mo).

**Données serveur** : tout passe par React Query (v4) — listes infinies à curseur
(`{items, nextCursor}`), pull-to-refresh, états chargement / vide / erreur + « Réessayer » partout.
Les actions like, favori, suivre, rejoindre sont **optimistes** : l'entité est patchée dans
*tous* les caches (fils, détail, recherche, profils…) puis restaurée en cas d'erreur.

**Temps réel** : Socket.IO connecté tant que l'utilisateur est connecté (`auth` lu à chaque
connexion → toujours le dernier access token ; `connect_error: UNAUTHORIZED` → refresh puis
reconnexion). Événements : `message:new` (chat + liste + badges), `typing`, `conversation:read`
(« Vu »), `notification:new` (badge cloche + onglet Inbox). Déconnexion en arrière-plan,
resynchronisation au retour.

## Écrans

| Domaine | Fonctionnalités |
|---------|-----------------|
| Auth | Accueil, connexion (email ou nom d'utilisateur), inscription (université avec suggestions `/universities`, rôle), mot de passe oublié → code à 6 chiffres. Validation côté client avec erreurs en ligne. |
| Accueil | Fil vidéo plein écran *For You / Following* : lecture auto de la vidéo visible, pause des autres / écran quitté / app en arrière-plan, tap = pause, double tap = like + cœur animé, boucle, miniature pendant le chargement, indicateur de buffering, son on/off, rail (profil + suivre, like, commentaires, favori, partage natif, options), légende, hashtags, catégorie, vue comptée, défilement infini. |
| Discover | Recherche, catégories, *Trending Topics*, contenus populaires, suggestions de comptes, accès Posts / Users / Communities. |
| Recherche | Onglets All / Posts / Users / Communities, filtres (type, catégorie, université, tri), requêtes « debounced », hashtags tendance. |
| Posts | *For You / Following / Popular / Latest*, posts texte / image / audio (lecture des notes vocales). |
| Users | All / Students / Professors / Top Creators, recherche, suivre. |
| Communautés | Populaires, les miennes, toutes (par type), détail (posts + membres), rejoindre / quitter, créer, modifier et supprimer (propriétaire). |
| Création (+) | **Vidéo** (caméra ou galerie, aperçu lu, légende, catégorie, communauté) ou **Post** (texte + photo) avec barre de progression, puis ouverture du contenu publié. |
| Détail / commentaires | Lecture vidéo ou post, actions, auteur, aperçu des commentaires ; écran commentaires (ajout, suppression des siens, signalement). |
| Inbox | Conversations avec badges non lus, filtres All / Messages / Notifications / Mentions, nouveau message (recherche d'utilisateurs), groupes, mise en sourdine. Chat temps réel (liste inversée paginée, texte + photo, « en train d'écrire », « Vu »). |
| Notifications | Liste paginée, tout marquer lu à l'ouverture. |
| Profil | Statistiques, onglets Vidéos (grille 3 colonnes) / Posts / Favoris / Communautés, édition (nom, pseudo, bio, université, rôle, avatar), abonnés / abonnements, réglages : mot de passe, comptes bloqués, déconnexion, suppression du compte. |
| Autre profil | Suivre, Message (DM créé ou retrouvé), bloquer / débloquer, signaler. Signalement aussi sur posts, commentaires, communautés. |

Responsive (colonne max 680 pt sur tablette), safe areas, clavier, libellés d'accessibilité.

## Configurer l'URL de l'API

Éditez **`src/env.ts`** :

```ts
export const API_URL: string | null = null;            // null = valeur de dev automatique
export const PRODUCTION_API_URL: string | null = null; // utilisée en build release si API_URL est null
```

| Cas | Valeur |
|-----|--------|
| Émulateur Android | `null` → `http://10.0.2.2:4000` |
| Simulateur iOS | `null` → `http://localhost:4000` |
| Téléphone réel (même Wi-Fi) | `'http://192.168.x.y:4000'` (IP LAN de votre machine) |
| Production | `'https://api.votre-domaine.com'` (**HTTPS obligatoire**) |

En dev, les URLs médias renvoyées en `http://localhost:4000/uploads/…` sont réécrites vers l'URL
configurée (`mediaUrl()` dans `src/config.ts`) pour qu'elles soient joignables depuis l'émulateur.
Le mieux reste de régler `PUBLIC_URL` du backend sur l'adresse réellement joignable.

**HTTP en clair** : autorisé uniquement en **debug** (Android : `src/debug/res/xml/network_security_config.xml` ;
le build release utilise `src/main/res/xml/network_security_config.xml` = HTTPS seulement).
iOS : `NSAllowsLocalNetworking` (localhost / réseau local) dans `Info.plist`.

## Dépendances natives et compatibilité

Vérifié dans les podspecs et `android/build.gradle` des paquets installés :

| Paquet | Version | iOS min (podspec) | Android | Pourquoi compatible |
|--------|---------|-------------------|---------|---------------------|
| `react-native-keychain` | 8.2.0 | 9.0 | minSdk 21, compile/target = valeurs du projet (33) | Ancienne archi, Java ; dépendances AndroidX + `com.facebook.conceal:conceal:1.1.3` (Maven Central). |
| `@react-native-async-storage/async-storage` | 1.23.1 | 9.0 (ancienne archi ; 13.4 seulement si nouvelle archi) | minSdk/compileSdk du projet, `namespace` posé pour AGP ≥ 7 | Stockage local non sensible (cache du profil `Me`). Room/KSP non activés par défaut. |
| `react-native-image-picker` | 7.1.2 | 9.0 (PHPicker protégé par `@available(iOS 14)`, sinon UIImagePickerController) | compileSdk 33, minSdk 21 | Fournit son propre `FileProvider` (`${applicationId}.imagepickerprovider`). La 7.2.x impose compileSdk 35 → écartée. |
| `react-native-video` | 5.2.1 | 8.0 | **implémentation ExoPlayer** (`android-exoplayer`) : ExoPlayer 2.13.3 + AndroidX + OkHttp | La 6.x exige iOS 13. L'implémentation Android par défaut de la 5.x dépend d'un artefact JitPack et force des `abiFilters` : on lie `android-exoplayer` via `react-native.config.js`. ExoPlayer ≥ 2.13 est publié sur le dépôt Maven de Google (`google()`). |
| `react-native-vector-icons`, `linear-gradient`, `safe-area-context`, `screens` | inchangées | ≤ 12.4 | — | déjà présentes. |

Dépendances JS pures : `@tanstack/react-query@4.36.1`, `socket.io-client@4.7.5`.
Dev : `patch-package@8.0.0`, `@testing-library/react-native@12.4.3`, `@types/react-native-video@5.0.20`.

**Patch** `patches/react-native-video+5.2.1.patch` (appliqué par `postinstall`) : dans
`android-exoplayer/build.gradle`, la dépendance `'com.squareup.okhttp3:okhttp:${OKHTTP_VERSION}'`
est entre guillemets simples (jamais interpolée par Groovy → résolution impossible) ; elle est
remplacée par OkHttp 4.9.2 (version de RN 0.72, surchargeable via `ext.okhttpVersion`), et les
valeurs par défaut compileSdk/buildTools passent à 33.

Permissions : iOS `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
`NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` ; Android `INTERNET`,
`CAMERA` (demandée à l'exécution avant la caméra), `RECORD_AUDIO`, `READ_MEDIA_IMAGES`,
`READ_MEDIA_VIDEO`, `READ_EXTERNAL_STORAGE` (maxSdk 32).

## Démarrage

Pré-requis : Node ≥ 18, JDK 17, Android Studio (SDK 33), et pour iOS : macOS + Xcode + CocoaPods.
Lancez d'abord le backend (`../backend/README.md`).

```bash
cd mobile
npm install                 # applique aussi les patches (postinstall)

# Android (émulateur ou appareil)
npm run android

# iOS
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

Vérifications :

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint + Prettier
npm test            # Jest (mocks : keychain, vidéo, image-picker, socket.io-client, AsyncStorage)

# Test d'intégration live (backend lancé sur :4000)
API_URL=http://localhost:4000 npx jest -c jest.integration.config.js
```

## Build de production

1. Renseignez `PRODUCTION_API_URL` (ou `API_URL`) dans `src/env.ts` avec une URL **HTTPS**, et
   `PUBLIC_URL` du backend en HTTPS (les médias doivent aussi être servis en HTTPS).
2. **Android** : créez une clé (`keytool -genkeypair -v -keystore release.keystore -alias studyhub -keyalg RSA -keysize 2048 -validity 10000`),
   déclarez-la dans `android/app/build.gradle` (`signingConfigs.release`, mots de passe via
   `~/.gradle/gradle.properties`, jamais commités) puis `cd android && ./gradlew bundleRelease` (AAB pour le Play Store).
3. **iOS** : dans Xcode, choisissez votre équipe et le profil de distribution, schéma *Release*,
   `Product → Archive`. Retirez `NSExceptionDomains/localhost` de l'`Info.plist` si vous le souhaitez
   (`NSAllowsLocalNetworking` n'affecte pas les domaines publics).
4. La suppression de compte (exigence App Store) est disponible dans *Réglages*.

## Limites connues / à tester sur appareil

- Pas de SDK Android ni de Xcode sur la machine de développement : la compilation native
  (Gradle/CocoaPods) et la lecture vidéo réelle doivent être validées sur appareil/émulateur.
- Les accusés de lecture (« Vu ») ne sont affichés que pour les lectures survenues pendant que
  l'app est ouverte (le contrat REST n'expose pas l'état de lecture par participant).
- Notifications push (FCM/APNs) non implémentées (l'endpoint `/users/me/push-token` existe côté API).
- Création de communauté sans avatar (icône + couleur uniquement).
