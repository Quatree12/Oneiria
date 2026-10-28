# ONEIRIA

**Your dreams, your universe.**

Journal de rêves interactif, entièrement en français, conçu en priorité pour **Safari sur iPhone XR**.
Écrire, dicter, dessiner, retrouver, observer les thèmes qui reviennent.

Aucun compte. Aucun serveur. Aucune analytics. Tout reste sur l'appareil.

---

## 1. Contenu du projet

```
oneiria/
├─ index.html              application complète (4 écrans + feuilles)
├─ styles.css              direction artistique « Cosmic Liquid Glass »
├─ app.js                  noyau applicatif (IndexedDB, dictée, dessin, Memory)
├─ guide.html + guide.js   guide de test : 14 scénarios + vérifications automatiques
├─ sw.js                   service worker (coquille hors-ligne ; ne met jamais les rêves en cache)
├─ manifest.webmanifest    installation sur l'écran d'accueil iOS
├─ build-archive.sh        prépare un dossier propre prêt à pousser
├─ .gitignore
├─ icons/                  icônes vectorielles (180 / 192 / 512)
└─ .github/workflows/pages.yml   publication automatique depuis `main`
```

Le **guide de test** est aussi accessible directement depuis l'application :
Réglages → *Vérifier l'application* → **Ouvrir le guide de test**.

Aucune dépendance, aucun build, aucun paquet npm : ce sont des fichiers statiques.

---

## 2. Tester en local

Un service worker et IndexedDB exigent un contexte sécurisé. Ouvrir `index.html` par double-clic
fonctionne, mais le service worker est alors ignoré (ce n'est pas grave : l'application reste
entièrement fonctionnelle et les données restent persistées).

Pour tester dans les conditions réelles :

```bash
cd oneiria
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Sur iPhone, sur le même réseau Wi-Fi : `http://<ip-de-votre-mac>:8080`.

---

## 3. Publier sur GitHub Pages (gratuit)

### a. Préparer un dossier propre

```bash
chmod +x build-archive.sh
./build-archive.sh ~/oneiria-repo
cd ~/oneiria-repo
```

Le script copie uniquement les fichiers utiles au site (pas les scripts d'outillage) et crée
le `.nojekyll` nécessaire.

### b. Créer le dépôt

```bash
cd oneiria
git init
git add .
git commit -m "ONEIRIA — première version"
git branch -M main
git remote add origin https://github.com/<votre-utilisateur>/oneiria.git
git push -u origin main
```

### c. Activer Pages

1. Dépôt → **Settings** → **Pages**
2. *Build and deployment* → **Source : GitHub Actions**
3. Le workflow `.github/workflows/pages.yml` se déclenche à chaque `push` sur `main`.
4. Attendre la coche verte dans l'onglet **Actions** (environ 1 minute).

### d. URL finale

```
https://<votre-utilisateur>.github.io/oneiria/
```

Tout étant en chemins relatifs (`./styles.css`, `scope: "./"`), l'application fonctionne aussi bien
à la racine d'un domaine que dans un sous-dossier de projet.

### e. Installer sur l'iPhone

1. Ouvrir l'URL dans **Safari** (obligatoire, pas Chrome).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Lancer ONEIRIA depuis l'icône : plein écran, sans barre d'adresse.

---

## 4. Utilisation

| Onglet | Rôle |
|---|---|
| **Univers** | Accueil, sphère cosmique, constellations de thèmes, derniers fragments |
| **Raccontes** | Écrire un rêve (titre, récit, émotion, mots-clés) |
| **Décrit** | Dicter un rêve, corriger la transcription, enregistrer |
| **Memory** | Archive, recherche, filtres, détail, modification, suppression, export/import |

Les **réglages et la confidentialité** s'ouvrent depuis l'icône en haut à droite de l'Univers.

Après un enregistrement (écrit ou raconté), l'écran **Dessine** propose de dessiner. On peut
passer cette étape ou y revenir plus tard depuis le détail du rêve.

### Émotions proposées

Émerveillement · Joie · Paix · Confusion · Peur · Mélancolie · Curiosité

### Filtres Memory

Tous · Écrits · Racontés · Oubliés · Avec dessin — plus la recherche textuelle (titre, récit,
émotion, mots-clés, date) et les filtres par thème issus des constellations.

---

## 5. Confidentialité et stockage — la vérité, sans arrondi

- Aucun compte utilisateur n'est créé, aucune donnée n'est envoyée à un service externe.
- Les rêves sont enregistrés **localement**, principalement dans **IndexedDB**.
  Si IndexedDB est indisponible (navigation privée, restrictions), l'application bascule
  automatiquement sur `localStorage`, et l'indique dans les réglages.
- **Aucune synchronisation entre appareils.** Le passage d'un iPhone à un autre ne transfère rien
  sans un export JSON manuel.
- **Effacer les données du site dans Safari supprime les rêves.** Réglages → Safari →
  Avancé → Données des sites web (ou la suppression des données de Oneiria).
- **Rien n'est chiffré.** Les données sont lisibles par quiconque utilise le navigateur de
  l'appareil déverrouillé.
- L'**export JSON** est la seule sauvegarde : il contient tous les fragments et tous les dessins.
  Exportez régulièrement.
- La **suppression totale** est disponible dans les réglages, avec une double confirmation.

### Reconnaissance vocale

La dictée utilise l'API `SpeechRecognition` / `webkitSpeechRecognition` du navigateur, lorsque
celle-ci est réellement présente. Sinon — et c'est fréquent dans Safari sur iOS — ONEIRIA **ne
prétend pas** que le microphone fonctionne : elle l'indique clairement et bascule sur la saisie
manuelle. Sur iPhone, la dictée du clavier iOS (icône microphone du clavier) reste alors le
meilleur chemin : la transcription arrive normalement dans le champ.

---

## 6. Guide de test

Le guide complet se trouve dans `guide.html` — ouvrez-le depuis l'application
(Réglages → *Vérifier l'application*) ou directement à la racine du site. Il exécute en direct
les vérifications de capacités du navigateur (contexte sécurisé, IndexedDB, canvas, service
worker, reconnaissance vocale, débordement horizontal) et liste les 14 scénarios.

Résumé des scénarios :

1. Ouvrir les quatre onglets. Chacun s'affiche sans défilement horizontal.
2. **Raccontes** → écrire un rêve → Enregistrer → l'écran **Dessine** s'ouvre.
3. Univers → « Je ne m’en souviens plus » → une entrée « Rêve oublié » datée apparaît.
4. **Décrit** → appuyer sur le cercle (ou lire le message si la dictée n'est pas disponible) → écrire à la main → Enregistrer.
5. Dessin : changer de couleur, gommer, annuler un trait, effacer avec confirmation.
6. Garder le dessin → l'associer au bon rêve (vérifier la vignette dans Memory).
7. Fermer complètement l'onglet puis rouvrir : les rêves sont toujours là.
8. Détail d'un rêve → **Modifier** → changer titre/texte → sauvegarder.
9. Détail d'un rêve → **Ajouter un fragment** → le premier récit reste intact.
10. Memory : tester la recherche et les cinq filtres.
11. Réglages → **Exporter en JSON** → **Importer un fichier JSON** → les rêves sont ajoutés.
12. Détail → **Supprimer ce rêve** → confirmation → disparition immédiate.
13. Réduire la fenêtre à 375 px de large (largeur iPhone XR).
14. Réglages → **Supprimer toutes mes données** → double confirmation.

---

## 7. Points à vérifier sur un appareil réel

Ces éléments ne peuvent pas être validés depuis un poste de développement :

- **Reconnaissance vocale iOS** : dépend du navigateur et de la version d'iOS. Si elle est
  absente, le mode manuel et la dictée du clavier iOS prennent le relais — c'est le comportement prévu.
- **Zones de sécurité de l'iPhone** : `viewport-fit=cover` + `env(safe-area-inset-*)` sont en
  place, mais le rendu exact (encoche, barre d'accueil) se juge sur l'appareil.
- **Installation sur l'écran d'accueil** et comportement en plein écran.
- **Performance réelle** des animations (les effets restent légers : pas de filtre `blur` animé,
  pas de `backdrop-filter` sur les éléments en mouvement).
- **Limite de stockage Safari** : environ 1 Go par origine, avec éventuelle éviction des données
  de sites non utilisés. D'où l'importance de l'export JSON.

---

## 8. Licence

Projet personnel. Faites-en ce que vous voulez.
