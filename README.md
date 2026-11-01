<p align="center">
  <img src="assets/icon.png" alt="Logo Seize16" width="160" />
</p>

<h1 align="center">Seize16</h1>

<p align="center">
  Le carnet de poche des rappeurs et chanteurs : écris tes textes, pose-les sur ton instru, enregistre tes prises.<br />
  100 % hors ligne, sans compte, en français.
</p>

---

## Fonctionnalités

- **Bibliothèque de morceaux** : recherche, tri, statut (idée, en cours, terminé), BPM, tonalité, crédits et tags.
- **Éditeur de paroles** : sections (intro, couplet, refrain, pont, outro, libre) réordonnables, sauvegarde automatique.
- **Lecteur d'instru** : importe un mp3 par morceau, lecture/pause, ±5 s, barre de progression.
- **Mode studio** : enregistre ta voix depuis l'éditeur, paroles sous les yeux, avec ou sans l'instru ; l'écran reste allumé pendant la prise.
- **Prises vocales** : réécoute, renomme, partage ou supprime tes prises.
- **Carnet d'idées** : notes rapides avec `#tags`, à envoyer ensuite dans un morceau.
- **Export** : paroles en PDF ou en texte.
- **Sauvegarde / restauration** : tout le carnet (textes, instrus, prises) dans un seul fichier `.carnet`.

Toutes les données restent sur le téléphone (SQLite + fichiers locaux). Rien n'est envoyé nulle part sans que tu le partages toi-même.

## Stack

- [Expo](https://expo.dev) SDK 58, React Native, TypeScript
- Expo Router (navigation par fichiers dans `src/app/`)
- expo-sqlite, expo-audio, expo-file-system, expo-print, expo-sharing

## Démarrer

```bash
npm install
npx expo start
```

Scanne le QR code avec **Expo Go** (Android ou iOS). Toutes les fonctionnalités marchent dans Expo Go ; l'icône de l'app n'apparaît qu'avec un vrai build.

## Vérifications

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Build

Les builds passent par [EAS](https://docs.expo.dev/eas/) (pas besoin d'Android Studio ni de Xcode) :

```bash
npx eas-cli@latest build --platform android
```

## Structure

```
src/
  app/          écrans (Expo Router)
  audio/        contexte du lecteur d'instru
  components/   UI partagée (lecteur, barre studio, modales…)
  db/           migrations, types et requêtes SQLite
  lib/          sauvegarde, export, fichiers, utilitaires
  theme.ts      couleurs et espacements (thème sombre)
```
