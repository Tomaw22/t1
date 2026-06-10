# RémiCraft 🧱⛏

Un **Minecraft-like en WebGL pur** (aucune dépendance, ~700 lignes) : monde
voxel généré procéduralement, vue à la première personne, on casse et on pose
des blocs, le tout jouable **clavier+souris et tactile**.

Le jeu vit dans `index.html` + `craft.js`. Ouvrez `index.html` dans un
navigateur, ou servez le dossier (`npx serve .`).

## Fonctionnalités

- Terrain procédural (bruit à octaves) : collines, plages, lacs, arbres
- 8 blocs posables : herbe, terre, pierre, sable, bois, feuilles, planches, brique
- Casser / poser avec visée par raycast et surbrillance du bloc ciblé
- Physique : gravité, saut, collisions, nage (l'eau ralentit et porte)
- Cycle jour/nuit (4 min) avec brouillard assorti au ciel
- Textures 16×16 générées en code (atlas canvas), bruitages WebAudio
- **Monde sauvegardé automatiquement** (graine + modifications, localStorage),
  bouton « Nouveau monde » dans le menu
- Moteur : monde 96×48×96, maillage par tronçons 16×16 avec faces cachées
  retirées, re-maillage local à chaque modification

## Commandes

**Bureau** : ZQSD/WASD bouger, souris regarder (clic pour capturer), ESPACE
sauter, clic gauche casser, clic droit poser, molette ou 1-8 choisir le bloc,
Échap menu.

**Mobile** : joystick (moitié gauche) pour bouger, glisser (moitié droite)
pour regarder, ⛏ casser, 🧱 poser, ⬆ sauter, toucher la barre pour choisir
le bloc. Fonctionne en portrait comme en paysage.

---

## Aussi dans ce dépôt : Rémi — La Légende de la Clôture 🌿

Un jeu d'aventure top-down façon Zelda où Rémi, poseur de clôture chez
Daniel Moquet (*signe vos clôtures*), sécurise trois chantiers avant
d'affronter le Sanglier Royal. → [`zelda/index.html`](zelda/index.html)

Son auto-test de monde : `node zelda/game.js`.

*Jeux fan-made non officiels, sans affiliation avec Daniel Moquet ni Mojang.*
