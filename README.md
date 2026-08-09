# Budgex

Une application de **gestion de budget personnel**, en français, qui fonctionne
entièrement dans le navigateur — **sans compte, sans serveur, sans connexion**.
Tes données restent sur ton téléphone (dans le stockage local du navigateur) et
n'en sortent jamais.

C'est une **PWA** (Progressive Web App) : tu peux l'installer sur l'écran
d'accueil de ton téléphone et l'utiliser comme une vraie application, hors ligne.

## Ce que fait l'app

- **Accueil** — le « ruban du mois » montre d'un coup d'œil ce qui est payé, ce
  qui reste à payer et ce qui est libre. En dessous : le disponible après charges
  fixes, l'épargne du mois, l'enveloppe sorties et les prochaines échéances.
- **Factures** — coche ce que tu paies ; les factures redeviennent
  automatiquement « à payer » au début de chaque mois.
- **Épargne** — un total cumulé, une courbe d'évolution, la liste des versements.
- **Sorties** — une enveloppe mensuelle et le suivi de ce qu'il en reste.
- **Crédits** — le restant dû, la durée restante, les remboursements anticipés.
  Chaque crédit se décrémente automatiquement de sa mensualité, une fois par mois.
- **Historique** — un récapitulatif de chaque mois écoulé.
- **Réglages** — revenu, objectifs, export/import de sauvegarde.

Aucune dépendance externe, aucun framework, aucun CDN pour la logique : juste du
HTML, du CSS et du JavaScript. Les polices sont chargées depuis Google Fonts avec
une pile de repli système, donc l'app reste lisible même hors connexion.

## Structure du projet

```
index.html        les vues
css/style.css     tout le style
js/store.js       données, calculs, bascule de mois
js/ui.js          formatage, feuilles modales, graphique SVG
js/app.js         navigation et rendu
sw.js             service worker (cache hors connexion)
manifest.json     installation sur écran d'accueil
icons/            icônes 192px, 512px et maskable 512px
```

## Déploiement sur GitHub Pages

1. Pousse le code sur la branche `main` de ton dépôt GitHub.
2. Dans le dépôt, va dans **Settings → Pages**.
3. Sous **Build and deployment**, choisis **Source : Deploy from a branch**.
4. Sélectionne la branche **`main`** et le dossier **`/ (root)`**, puis **Save**.
5. Patiente une minute : l'URL publique s'affiche en haut de la page
   (`https://<ton-compte>.github.io/<nom-du-dépôt>/`).

L'app étant 100 % statique, aucune étape de build n'est nécessaire.

> Les chemins sont **relatifs**, donc l'app fonctionne aussi bien à la racine
> d'un domaine que dans un sous-dossier `/budget/` de GitHub Pages.

## Installation sur téléphone

### Android (Chrome)

1. Ouvre l'URL de l'app dans **Chrome**.
2. Menu **⋮** en haut à droite → **Ajouter à l'écran d'accueil** (ou une
   bannière « Installer l'application » apparaît directement).
3. Confirme. L'icône Budgex apparaît sur ton écran d'accueil ; elle s'ouvre en
   plein écran, sans barre d'adresse.

### iPhone / iPad (Safari)

1. Ouvre l'URL dans **Safari** (l'installation d'une PWA ne marche pas depuis
   Chrome sur iOS).
2. Appuie sur le bouton **Partager** (le carré avec une flèche vers le haut).
3. Fais défiler et choisis **Sur l'écran d'accueil**.
4. Appuie sur **Ajouter**. L'icône apparaît sur l'écran d'accueil.

Une fois installée, l'app fonctionne **hors connexion** : le service worker met
tous les fichiers en cache au premier lancement.

## Sauvegarde de tes données

Comme tout est stocké **localement**, tes données disparaissent si tu effaces les
données du navigateur, changes de téléphone ou désinstalles l'app **sans
sauvegarde**. Prends l'habitude d'exporter :

- **Réglages → Sauvegarde → Exporter (.json)** télécharge un fichier contenant
  tout ton budget.
- **Réglages → Sauvegarde → Importer un fichier** restaure ces données (avec un
  message d'erreur clair si le fichier est illisible).

Range ce fichier quelque part de sûr (mail, cloud, ordinateur).

## Mettre à jour l'app (⚠️ important)

Le service worker met les fichiers en **cache** pour le hors-ligne. Si tu
modifies le code sans changer la version du cache, **le téléphone continue de
servir l'ancienne version**.

À chaque mise à jour, **incrémente le numéro de version dans `sw.js`** :

```js
const CACHE = 'budgex-v1';   // → 'budgex-v2', 'budgex-v3', etc.
```

Au prochain lancement, le service worker détecte le nouveau nom de cache,
supprime l'ancien et récupère les fichiers à jour.

## Développement local

Ouvrir `index.html` directement (`file://`) fonctionne pour l'essentiel, mais le
service worker exige un vrai serveur HTTP. Le plus simple :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Confidentialité

Aucune donnée n'est envoyée nulle part. Pas de compte, pas de tracking, pas de
réseau (hors le chargement initial des polices). Tout vit dans le
`localStorage` de ton navigateur.
