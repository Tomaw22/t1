# Rémi — La Légende de la Clôture 🌳🔨

Un jeu d'aventure top-down façon Zelda, en pur JavaScript/Canvas (aucune dépendance),
où **Rémi**, poseur de clôture chez **Daniel Moquet** (*signe vos clôtures*), doit
sécuriser trois chantiers avant d'affronter le terrible **Sanglier Royal**.

## Jouer

Ouvrez simplement `index.html` dans un navigateur, ou servez le dossier :

```bash
npx serve .        # ou : python3 -m http.server
```

## Commandes

| Touche | Action |
|---|---|
| ZQSD / WASD / Flèches | Se déplacer |
| ESPACE (ou J) | Coup de masse |
| E (ou Entrée) | Parler / planter un piquet / valider |
| M | Musique on/off |
| N | Nouvelle partie (depuis le titre) |

Sur **mobile** : en portrait, une manette dédiée s'affiche sous le jeu
(joystick + boutons ATT/E) ; en paysage, les contrôles sont en surimpression.
Le bouton E s'allume en vert quand une action est possible.

## L'aventure

1. **Parlez à Daniel Moquet** au QG : il vous confie 3 chantiers et 10 piquets.
2. **Clôturez les 3 chantiers** : plantez un piquet (touche E) dans chaque trou
   marqué au sol — le grillage se tend tout seul entre les piquets.
   - Le Verger de Mme Bichon (sud-ouest)
   - Le Potager de M. Grelin (est)
   - Le Ponton du Marais (sud-est)
3. **Retournez voir chaque client** une fois son chantier fini : leur petit plat
   maison vous donne un **cœur de vie supplémentaire**.
4. **Vainquez le Sanglier Royal** dans la Plaine du Nord.

La progression est **sauvegardée automatiquement** (localStorage) : on peut
fermer l'onglet et reprendre plus tard. La minimap en haut à droite indique
les chantiers (jaune = à faire, vert = terminé) et le boss (rouge clignotant).
La musique change de thème quand le boss apparaît.

## Le monde (9 écrans)

```
Forêt des Ronces   | Plaine du Nord (boss) | Colline Caillouteuse
Lac de l'Ouest     | QG Daniel Moquet      | Champ de l'Est (chantier)
Verger SO (chantier)| Grande Allée         | Marais Brumeux (chantier)
```

## Bestiaire

- 🦔 **Taupe** — erre sur les chantiers, lâche parfois des piquets
- 🐗 **Sanglier** — charge quand vous êtes dans son axe
- 🌿 **Ronce** — crache des épines à distance
- 👑 **Sanglier Royal** — le boss : il charge, fait trembler le sol et invoque des taupes

À court de piquets ? Cherchez les **bottes de piquets** cachées dans la nature,
ou secouez quelques taupes.

## Tests

Le fichier de jeu embarque un auto-test du monde (dimensions des cartes,
accessibilité de chaque trou de chantier, ennemi, bonus et PNJ) :

```bash
node game.js
# AUTO-TEST OK — monde valide, tout est atteignable
```

*Jeu fan-made non officiel, sans affiliation avec Daniel Moquet.*
