# StudyHub — réseau social étudiant (React Native)

Application mobile multiplateforme (Android & iOS) réalisée à partir de la maquette fournie :
fil vidéo vertical, découverte de contenus, communautés universitaires, messagerie, recherche
avancée avec filtres, publications, annuaire d'utilisateurs et profils.

## Compatibilité

| Plateforme | Version minimale | Où c'est configuré |
|------------|------------------|--------------------|
| Android    | **7.0 (API 24)** | `android/build.gradle` → `minSdkVersion = 24` |
| iOS        | **12.4**         | `ios/Podfile` (`min_ios_version_supported`) et projet Xcode (`IPHONEOS_DEPLOYMENT_TARGET = 12.4`) |

- **React Native 0.72.17** est la dernière version de React Native qui supporte iOS 12 (à partir
  de la 0.73, iOS 13.4 minimum). Toutes les dépendances sont **épinglées** sur des versions
  compatibles iOS 12.4 / Android 7 : ne les mettez pas à jour sans vérifier leur version iOS minimale.
- iOS 12.0 à 12.3 ne sont pas supportés par React Native lui-même (12.4 minimum). Tous les
  appareils compatibles iOS 12 (iPhone 5s et plus récents) peuvent installer la 12.5.x.
- Le moteur JavaScript **Hermes** est activé sur les deux plateformes : le JS ne dépend pas du
  moteur JavaScriptCore du système, ce qui évite les problèmes de compatibilité avec les anciennes versions d'iOS.

## Fonctionnalités

| Écran | Fonctionnalités |
|-------|-----------------|
| **Accueil** (fil vidéo) | Onglets *For You / Following*, défilement vertical page par page, like (bouton ou double tap avec animation), commentaires, favoris, partage natif, suivre l'auteur, hashtags, son, badge de notifications |
| **Discover** | Barre de recherche, puces de catégories filtrantes, raccourcis Posts / Users / Communities, *Trending Topics*, *Popular Content* (durée, vues, favoris), bannière communauté |
| **Communities** | Bannière, communautés populaires (cartes horizontales), *My Communities*, *Join / Joined*, page détail, **création de communauté** (formulaire validé) |
| **Inbox** | Filtres *All / Messages / Notifications / Mentions*, badges non lus, utilisateurs en ligne, conversations en sourdine, accusés de lecture, recherche, **chat** (envoi de messages) |
| **Recherche** | Résultats mixtes (contenus, utilisateurs, communautés), onglets par type, compteur de résultats, **panneau de filtres** (type de contenu, catégorie, université, tri) |
| **Posts** | Onglets *For You / Following / Popular / Latest*, zone *Share something…*, posts avec image, hashtags, **note vocale** (forme d'onde), likes / commentaires / partages / favoris, *pull-to-refresh* |
| **Users** | Onglets *All / Students / Professors / Top Creators*, abonnés et relations communes, Follow / Following, recherche |
| **Profil** | Statistiques, *Edit Profile*, onglets Posts / Videos / Saved / Communities ; profils des autres utilisateurs avec Follow et **Message** |
| **Création** (bouton +) | Rédaction d'un post avec hashtags, catégorie, photo, compteur de caractères |
| **Notifications / Commentaires** | Liste des notifications (marquées lues automatiquement), fil de commentaires avec ajout |

### Responsive / réactif

- Les tailles de police s'adaptent à la taille de l'écran (`moderateScale`, `src/theme`).
- `useWindowDimensions` (`src/utils/responsive.ts`) : la mise en page se recalcule à la rotation,
  en mode multi-fenêtre Android 7+ et en Slide Over sur iPad.
- Sur tablette / en paysage, le contenu est centré dans une colonne de 680 pt maximum et les grilles
  passent de 4 à 5 puis 7 colonnes.
- Encoches et barres système gérées avec `react-native-safe-area-context` ; clavier géré
  (`KeyboardAvoidingView` sur iOS, `adjustResize` sur Android).

## Structure

```
mobile/
├── App.tsx                     # Providers + navigation
├── src/
│   ├── theme/                  # couleurs, espacements, typographie
│   ├── data/                   # types + données de démonstration
│   ├── context/AppContext.tsx  # état global (useReducer) : follow, like, favoris, messages…
│   ├── navigation/             # onglets du bas + pile native
│   ├── components/             # UI réutilisable (ui.tsx, items.tsx, ProfileView.tsx)
│   ├── screens/                # un fichier par écran
│   └── utils/                  # responsive, formats de dates/nombres
├── android/  ios/              # projets natifs
└── __tests__/                  # tests Jest (logique + navigation)
```

## Démarrage

Pré-requis : Node ≥ 18, JDK 17, Android Studio (SDK 33), et pour iOS : macOS + Xcode + CocoaPods.

```bash
cd mobile
npm install

# Android (émulateur ou appareil connecté)
npm run android

# iOS
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

Vérifications :

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint + Prettier
npm test            # Jest
```

## Brancher un vrai backend

Les données sont pour l'instant fictives (`src/data/mock.ts`) et l'état vit en mémoire
(`src/context/AppContext.tsx`). Pour passer en production :

1. Remplacer les imports de `mock.ts` par des appels API (REST/GraphQL) et charger l'état initial au démarrage.
2. Faire persister les actions du reducer (`toggleFollow`, `sendMessage`, `addPost`…) côté serveur.
3. Ajouter l'authentification et les notifications push (FCM / APNs).

### Vidéo

Le fil d'accueil affiche une image plein écran par publication (`VideoCard` dans
`src/screens/HomeScreen.tsx`). Aucune bibliothèque vidéo récente ne supporte encore iOS 12 :
`react-native-video` 6.x exige iOS 13, et la 5.x dépend d'un build Android abandonné. Pour lire de
vraies vidéos, remplacez l'`ImageBackground` de `VideoCard` par un lecteur, et utilisez la prop
`active` (déjà calculée) pour mettre en pause les vidéos qui ne sont pas à l'écran.

### Photos

Le bouton *Photo* de la création de post ajoute une image de démonstration. Pour choisir une vraie photo,
ajoutez une bibliothèque comme `react-native-image-picker`, en choisissant une version qui supporte encore iOS 12.4 ; la permission
`NSPhotoLibraryUsageDescription` est déjà déclarée dans `Info.plist`.
