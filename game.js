/* ============================================================
   RÉMI — LA LÉGENDE DE LA CLÔTURE
   Un jeu d'aventure façon Zelda où Rémi, poseur de clôture
   chez Daniel Moquet, doit sécuriser 3 chantiers et vaincre
   le terrible Sanglier Royal.
   Pur JavaScript / Canvas, aucune dépendance.
   ============================================================ */
'use strict';

// ---------------------------------------------------------- constantes
const TILE = 40;
const COLS = 24;
const ROWS = 15;
const HUD_H = 40;
const W = COLS * TILE;            // 960
const H = ROWS * TILE + HUD_H;    // 640
const WORLD_W = 3, WORLD_H = 3;   // monde 3x3 écrans

// tuiles : . herbe  , fleurs  p chemin  s enrobé  c culture  g gravier
//          t arbre  r rocher  w eau  b bâtiment   (solides : t r w b)
const SOLID = new Set(['t', 'r', 'w', 'b']);

// ---------------------------------------------------------- génération du monde
// Chaque écran part d'un gabarit : herbe, bordure d'arbres, ouvertures
// (couloir central) vers les écrans voisins. On garde dégagées les bandes
// rangées 6-8 et colonnes 11-13 pour garantir la circulation.
function blankScreen(sx, sy) {
  const g = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      row.push(border ? 't' : '.');
    }
    g.push(row);
  }
  const openV = x => x >= 11 && x <= 13;
  const openH = y => y >= 6 && y <= 8;
  for (let x = 0; x < COLS; x++) {
    if (openV(x)) {
      if (sy > 0) g[0][x] = 'p';
      if (sy < WORLD_H - 1) g[ROWS - 1][x] = 'p';
    }
  }
  for (let y = 0; y < ROWS; y++) {
    if (openH(y)) {
      if (sx > 0) g[y][0] = 'p';
      if (sx < WORLD_W - 1) g[y][COLS - 1] = 'p';
    }
  }
  return g;
}

function fillRect(g, x0, y0, x1, y1, ch) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) g[y][x] = ch;
}

// pseudo-aléatoire déterministe (les cartes sont identiques à chaque partie)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const inCorridor = (x, y) => (y >= 6 && y <= 8) || (x >= 11 && x <= 13);

function scatter(g, ch, n, seed, reserved) {
  const r = rng(seed);
  let tries = 0;
  while (n > 0 && tries < 600) {
    tries++;
    const x = 1 + Math.floor(r() * (COLS - 2));
    const y = 1 + Math.floor(r() * (ROWS - 2));
    if (g[y][x] !== '.') continue;
    if (SOLID.has(ch) && inCorridor(x, y)) continue;
    if (reserved.has(x + ',' + y)) continue;
    g[y][x] = ch;
    n--;
  }
}

// chantiers : chaînes ordonnées de trous ; le grillage relie les piquets
// consécutifs une fois plantés (loop = enclos fermé)
const CHANTIERS = [
  { id: 0, name: 'le Verger de Mme Bichon', screen: '0,2', loop: true,
    holes: [[2, 10], [5, 10], [8, 10], [8, 13], [5, 13], [2, 13]] },
  { id: 1, name: 'le Potager de M. Grelin', screen: '2,1', loop: true,
    holes: [[16, 3], [19, 3], [22, 3], [22, 11], [19, 11], [16, 11]] },
  { id: 2, name: 'le Ponton du Marais', screen: '2,2', loop: true,
    holes: [[15, 10], [18, 10], [21, 10], [21, 13], [18, 13], [15, 13]] },
];

// apparitions d'ennemis [type, tileX, tileY] et bottes de piquets par écran
const SPAWNS = {
  '0,0': [['ronce', 6, 4], ['ronce', 16, 11], ['taupe', 9, 7]],
  '1,0': [['sanglier', 5, 4], ['sanglier', 18, 10]],
  '2,0': [['taupe', 6, 4], ['taupe', 15, 10], ['taupe', 9, 11], ['sanglier', 18, 4]],
  '0,1': [['ronce', 4, 11], ['taupe', 16, 3]],
  '1,1': [],
  '2,1': [['taupe', 5, 4], ['taupe', 7, 11], ['sanglier', 4, 12]],
  '0,2': [['taupe', 16, 4], ['taupe', 18, 12], ['sanglier', 19, 3]],
  '1,2': [['ronce', 4, 4], ['ronce', 19, 4], ['taupe', 9, 11]],
  '2,2': [['ronce', 16, 3], ['ronce', 19, 7], ['taupe', 10, 11]],
};

const PICKUPS = [   // bottes de 3 piquets [écran, x, y]
  ['0,0', 3, 12], ['2,0', 20, 2], ['0,1', 2, 2], ['1,2', 12, 12],
];

const SCREEN_NAMES = {
  '0,0': 'Forêt des Ronces', '1,0': 'Plaine du Nord', '2,0': 'Colline Caillouteuse',
  '0,1': 'Lac de l’Ouest', '1,1': 'QG Daniel Moquet', '2,1': 'Champ de l’Est',
  '0,2': 'Verger du Sud-Ouest', '1,2': 'Grande Allée', '2,2': 'Marais Brumeux',
};

const DANIEL_POS = { screen: '1,1', x: 6, y: 5 };
const PLAYER_START = { screen: '1,1', x: 12, y: 10 };
const BOSS_SCREEN = '1,0';

function buildWorld() {
  const maps = {};
  for (let sy = 0; sy < WORLD_H; sy++) {
    for (let sx = 0; sx < WORLD_W; sx++) {
      const key = sx + ',' + sy;
      const g = blankScreen(sx, sy);
      const reserved = new Set();
      (SPAWNS[key] || []).forEach(([, x, y]) => {
        reserved.add(x + ',' + y);
        reserved.add((x + 1) + ',' + y); reserved.add((x - 1) + ',' + y);
        reserved.add(x + ',' + (y + 1)); reserved.add(x + ',' + (y - 1));
      });
      CHANTIERS.filter(c => c.screen === key).forEach(c =>
        c.holes.forEach(([x, y]) => {
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              reserved.add((x + dx) + ',' + (y + dy));
        }));
      PICKUPS.filter(p => p[0] === key).forEach(p => reserved.add(p[1] + ',' + p[2]));
      reserved.add(DANIEL_POS.x + ',' + DANIEL_POS.y);
      reserved.add(PLAYER_START.x + ',' + PLAYER_START.y);

      switch (key) {
        case '1,1': // QG : bâtiment + grande allée en enrobé signée Daniel Moquet
          fillRect(g, 2, 5, 9, 10, 's');
          fillRect(g, 3, 2, 8, 4, 'b');
          fillRect(g, 12, 9, 13, 13, 'p');
          fillRect(g, 14, 7, 22, 8, 'p');
          scatter(g, ',', 14, 11, reserved);
          scatter(g, 't', 5, 12, reserved);
          break;
        case '0,0': // forêt dense
          scatter(g, 't', 26, 21, reserved);
          scatter(g, 'r', 3, 22, reserved);
          scatter(g, ',', 8, 23, reserved);
          break;
        case '1,0': // plaine du boss : arène ouverte, rochers aux coins
          fillRect(g, 2, 2, 3, 3, 'r');
          fillRect(g, 20, 2, 21, 3, 'r');
          fillRect(g, 2, 11, 3, 12, 'r');
          fillRect(g, 20, 11, 21, 12, 'r');
          scatter(g, ',', 10, 31, reserved);
          break;
        case '2,0': // colline
          scatter(g, 'r', 16, 41, reserved);
          scatter(g, 't', 6, 42, reserved);
          scatter(g, 'g', 10, 43, reserved);
          break;
        case '0,1': // lac
          fillRect(g, 3, 2, 9, 5, 'w');
          fillRect(g, 4, 10, 9, 13, 'w');
          fillRect(g, 15, 10, 20, 12, 'w');
          scatter(g, 't', 8, 51, reserved);
          scatter(g, ',', 8, 52, reserved);
          break;
        case '2,1': // champ : cultures à protéger (chantier 2)
          fillRect(g, 17, 3, 21, 5, 'c');
          fillRect(g, 17, 9, 21, 10, 'c');
          scatter(g, 't', 7, 61, reserved);
          scatter(g, ',', 6, 62, reserved);
          break;
        case '0,2': // verger : pommiers dans l'enclos (chantier 1)
          g[11][4] = 't'; g[12][6] = 't'; g[11][7] = 't';
          fillRect(g, 3, 2, 8, 4, 't');
          scatter(g, 't', 6, 71, reserved);
          scatter(g, ',', 10, 72, reserved);
          break;
        case '1,2': // grande allée d'exposition en enrobé
          fillRect(g, 3, 6, 20, 8, 's');
          scatter(g, 't', 8, 81, reserved);
          scatter(g, ',', 10, 82, reserved);
          break;
        case '2,2': // marais
          fillRect(g, 3, 2, 9, 5, 'w');
          fillRect(g, 3, 10, 7, 13, 'w');
          scatter(g, 'g', 8, 91, reserved);
          scatter(g, 't', 6, 92, reserved);
          scatter(g, ',', 6, 93, reserved);
          break;
      }
      // ne jamais murer les trous de chantier ni les points d'apparition
      CHANTIERS.filter(c => c.screen === key).forEach(c =>
        c.holes.forEach(([x, y]) => { if (SOLID.has(g[y][x])) g[y][x] = '.'; }));
      (SPAWNS[key] || []).forEach(([, x, y]) => { if (SOLID.has(g[y][x])) g[y][x] = '.'; });
      PICKUPS.filter(p => p[0] === key).forEach(([, x, y]) => { if (SOLID.has(g[y][x])) g[y][x] = '.'; });
      maps[key] = g;
    }
  }
  return maps;
}

const MAPS = buildWorld();

// ---------------------------------------------------------- état du jeu
const game = {
  state: 'title',          // title | play | dialog | gameover | victory
  screen: PLAYER_START.screen,
  quest: 0,                // 0 parler à Daniel, 1 chantiers, 2 boss, 3 fini
  chantiersDone: 0,
  bossDefeated: false,
  takenPickups: new Set(),
  filled: new Set(),       // "chantierId:index" piquets plantés
  time: 0,
  shake: 0,
  toasts: [],
  dialog: null,            // { lines:[], i:0, speaker, onEnd }
  musicOn: true,
};

const player = {
  x: PLAYER_START.x * TILE + TILE / 2,
  y: PLAYER_START.y * TILE + TILE / 2,
  dir: 'down', hp: 6, maxHp: 6, piquets: 0,
  speed: 150, attackT: 0, attackCd: 0, invuln: 0,
  kbx: 0, kby: 0, walkT: 0, moving: false,
};

let enemies = [];
let projectiles = [];
let drops = [];
let boss = null;

// ---------------------------------------------------------- audio (WebAudio, généré)
let actx = null;
let musicTimer = null;

function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); startMusic(); }
    catch (e) { /* pas d'audio dispo */ }
  }
}

function beep(freq, dur, type = 'square', vol = 0.06, when = 0) {
  if (!actx) return;
  const t = actx.currentTime + when;
  const o = actx.createOscillator();
  const gn = actx.createGain();
  o.type = type; o.frequency.value = freq;
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn).connect(actx.destination);
  o.start(t); o.stop(t + dur);
}

const sfx = {
  swing: () => { beep(220, 0.08, 'sawtooth', 0.05); beep(180, 0.1, 'sawtooth', 0.04, 0.04); },
  hit: () => beep(120, 0.12, 'square', 0.08),
  hurt: () => { beep(140, 0.15, 'sawtooth', 0.09); beep(90, 0.2, 'sawtooth', 0.07, 0.08); },
  plant: () => { beep(300, 0.06, 'square', 0.07); beep(420, 0.08, 'square', 0.06, 0.07); },
  pickup: () => { beep(660, 0.07, 'square', 0.05); beep(880, 0.1, 'square', 0.05, 0.07); },
  kill: () => { beep(330, 0.06, 'triangle', 0.08); beep(165, 0.15, 'triangle', 0.06, 0.05); },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'square', 0.07, i * 0.13)),
  bigFanfare: () => [392, 523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.2, 'square', 0.07, i * 0.15)),
  denied: () => beep(110, 0.2, 'sawtooth', 0.07),
  talk: () => beep(500, 0.04, 'square', 0.04),
};

// petite boucle musicale champêtre
const MELODY = [392, 440, 494, 392, 440, 587, 523, 440, 392, 440, 494, 587, 523, 494, 440, 392];
let melIdx = 0;
function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!actx || !game.musicOn || game.state === 'title') return;
    beep(MELODY[melIdx % MELODY.length] / 2, 0.22, 'triangle', 0.025);
    if (melIdx % 4 === 0) beep(MELODY[melIdx % MELODY.length] / 4, 0.3, 'sine', 0.03);
    melIdx++;
  }, 280);
}

// ---------------------------------------------------------- entrées
const keys = {};
const pressed = new Set();

const KEYMAP = {
  up: ['ArrowUp', 'z', 'Z', 'w', 'W'],
  down: ['ArrowDown', 's', 'S'],
  left: ['ArrowLeft', 'q', 'Q', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
};
const dirDown = dir => KEYMAP[dir].some(k => keys[k]);

// contrôles tactiles (mobile) : joystick à gauche, boutons à droite
const touchUI = {
  enabled: false,
  joyId: null, joyX: 0, joyY: 0, vecX: 0, vecY: 0,
  btnA: { x: W - 95, y: H - 100, r: 56, label: 'ATT' },   // masse
  btnB: { x: W - 230, y: H - 70, r: 44, label: 'E' },     // action
};

// ---------------------------------------------------------- aides monde
function tileAt(grid, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 't';
  return grid[ty][tx];
}

function postAt(tx, ty, screen) {
  for (const c of CHANTIERS) {
    if (c.screen !== screen) continue;
    for (let i = 0; i < c.holes.length; i++) {
      if (c.holes[i][0] === tx && c.holes[i][1] === ty && game.filled.has(c.id + ':' + i))
        return true;
    }
  }
  return false;
}

function isSolidAt(px, py, screen) {
  const t = tileAt(MAPS[screen], px, py);
  if (SOLID.has(t)) return true;
  return postAt(Math.floor(px / TILE), Math.floor(py / TILE), screen);
}

// déplacement avec collision AABB (demi-boîte aux pieds)
function moveEntity(e, dx, dy, screen, hw = 12, hh = 10) {
  if (dx !== 0) {
    const nx = e.x + dx;
    const edge = nx + Math.sign(dx) * hw;
    if (!isSolidAt(edge, e.y - hh, screen) && !isSolidAt(edge, e.y + hh, screen)) e.x = nx;
  }
  if (dy !== 0) {
    const ny = e.y + dy;
    const edge = ny + Math.sign(dy) * hh;
    if (!isSolidAt(e.x - hw, edge, screen) && !isSolidAt(e.x + hw, edge, screen)) e.y = ny;
  }
}

// ---------------------------------------------------------- ennemis
function makeEnemy(type, tx, ty) {
  const base = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type, hitT: 0, kbx: 0, kby: 0 };
  if (type === 'taupe') return { ...base, hp: 2, speed: 45, dmg: 1, t: Math.random() * 2, vx: 0, vy: 0 };
  if (type === 'sanglier') return { ...base, hp: 3, speed: 0, dmg: 1, mode: 'idle', cx: 0, cy: 0, stun: 0 };
  if (type === 'ronce') return { ...base, hp: 2, speed: 0, dmg: 1, shootT: 1 + Math.random() };
  return base;
}

function makeBoss() {
  return {
    x: 11.5 * TILE, y: 5 * TILE, type: 'boss', hp: 14, maxHp: 14, dmg: 2,
    mode: 'idle', cx: 0, cy: 0, stun: 0, hitT: 0, kbx: 0, kby: 0, roarT: 1.2,
  };
}

function spawnScreen(key) {
  enemies = (SPAWNS[key] || []).map(([t, x, y]) => makeEnemy(t, x, y));
  projectiles = [];
  drops = [];
  boss = null;
  if (key === BOSS_SCREEN && game.quest >= 2 && !game.bossDefeated) {
    enemies = [];
    boss = makeBoss();
    toast('LE SANGLIER ROYAL !', 3);
    sfx.hurt();
  }
}

// ---------------------------------------------------------- interactions
function toast(msg, dur = 2.2) { game.toasts.push({ msg, t: dur }); }

function openDialog(speaker, lines, onEnd) {
  game.state = 'dialog';
  game.dialog = { speaker, lines, i: 0, onEnd: onEnd || null };
  sfx.talk();
}

function talkToDaniel() {
  if (game.quest === 0) {
    openDialog('Daniel Moquet', [
      'Ah, Rémi ! Mon meilleur poseur de clôture !',
      'Trois clients nous attendent : le verger de Mme Bichon au sud-ouest, le potager de M. Grelin à l’est, et le ponton du marais au sud-est.',
      'Plante un piquet dans chaque trou marqué au sol avec la touche E. Le grillage suivra tout seul, je te fais confiance !',
      'Méfie-toi des taupes, des sangliers et des ronces... Tiens, voilà 10 piquets pour commencer.',
      'Et n’oublie pas notre devise : « Daniel Moquet signe vos clôtures » !',
    ], () => {
      game.quest = 1;
      player.piquets += 10;
      toast('+10 piquets ! Objectif : 3 chantiers');
      sfx.pickup();
    });
  } else if (game.quest === 1) {
    const left = CHANTIERS.filter(c => !chantierDone(c)).map(c => c.name);
    openDialog('Daniel Moquet', [
      'Alors, ça avance ? Il reste : ' + left.join(', ') + '.',
      'Cherche les bottes de piquets dans la nature si tu en manques. Les taupes en lâchent aussi parfois !',
    ]);
  } else if (game.quest === 2) {
    openDialog('Daniel Moquet', [
      'Rémi, c’est la catastrophe ! Le SANGLIER ROYAL saccage la plaine du nord !',
      'Aucune clôture ne lui résiste... sauf si son poseur a une bonne masse. Va lui régler son compte !',
    ]);
  } else {
    openDialog('Daniel Moquet', ['Tu es une légende, Rémi. La légende de la clôture !']);
  }
}

function chantierDone(c) {
  return c.holes.every((_, i) => game.filled.has(c.id + ':' + i));
}

function tryPlant() {
  const ptx = Math.floor(player.x / TILE), pty = Math.floor(player.y / TILE);
  for (const c of CHANTIERS) {
    if (c.screen !== game.screen) continue;
    for (let i = 0; i < c.holes.length; i++) {
      const [hx, hy] = c.holes[i];
      if (Math.abs(hx - ptx) + Math.abs(hy - pty) <= 1 && !game.filled.has(c.id + ':' + i)) {
        if (player.piquets <= 0) { toast('Plus de piquets !'); sfx.denied(); return true; }
        player.piquets--;
        game.filled.add(c.id + ':' + i);
        sfx.plant();
        game.shake = 0.15;
        if (chantierDone(c)) {
          game.chantiersDone++;
          sfx.fanfare();
          toast('Chantier terminé : ' + c.name + ' !', 3.5);
          if (game.chantiersDone >= CHANTIERS.length) {
            game.quest = 2;
            setTimeout(() => {
              if (game.state === 'play') openDialog('Radio chantier', [
                '*Bzzt* Rémi, ici Daniel ! Beau boulot sur les trois chantiers !',
                '*Bzzt* Mais on a un gros souci : le SANGLIER ROYAL est apparu dans la plaine du nord !',
                '*Bzzt* Prends ta masse et va le déloger, c’est toi le patron des piquets !',
              ]);
            }, 900);
          }
        }
        return true;
      }
    }
  }
  return false;
}

function interact() {
  // Daniel ?
  if (game.screen === DANIEL_POS.screen) {
    const dx = player.x - (DANIEL_POS.x * TILE + TILE / 2);
    const dy = player.y - (DANIEL_POS.y * TILE + TILE / 2);
    if (dx * dx + dy * dy < 90 * 90) { talkToDaniel(); return; }
  }
  tryPlant();
}

// ---------------------------------------------------------- combat
function attack() {
  if (player.attackCd > 0) return;
  player.attackT = 0.22;
  player.attackCd = 0.38;
  sfx.swing();
  const r = 30;
  let ax = player.x, ay = player.y;
  if (player.dir === 'up') ay -= r;
  if (player.dir === 'down') ay += r;
  if (player.dir === 'left') ax -= r;
  if (player.dir === 'right') ax += r;
  const hitR = 32;
  const targets = boss ? enemies.concat([boss]) : enemies;
  for (const e of targets) {
    if (Math.abs(e.x - ax) < hitR && Math.abs(e.y - ay) < hitR + 6) {
      e.hp -= 1;
      e.hitT = 0.18;
      const kn = e.type === 'boss' ? 60 : 160;
      const d = Math.hypot(e.x - player.x, e.y - player.y) || 1;
      e.kbx = (e.x - player.x) / d * kn;
      e.kby = (e.y - player.y) / d * kn;
      sfx.hit();
      game.shake = Math.max(game.shake, 0.1);
      if (e.hp <= 0) killEnemy(e);
    }
  }
}

function killEnemy(e) {
  sfx.kill();
  if (e.type === 'boss') {
    boss = null;
    game.bossDefeated = true;
    game.quest = 3;
    sfx.bigFanfare();
    game.shake = 0.5;
    setTimeout(() => { game.state = 'victory'; }, 1600);
    return;
  }
  enemies = enemies.filter(x => x !== e);
  const r = Math.random();
  if (r < 0.3) drops.push({ x: e.x, y: e.y, kind: 'coeur', t: 12 });
  else if (r < 0.65) drops.push({ x: e.x, y: e.y, kind: 'piquet', t: 12 });
}

function hurtPlayer(dmg, fromX, fromY) {
  if (player.invuln > 0) return;
  player.hp -= dmg;
  player.invuln = 1;
  sfx.hurt();
  game.shake = 0.25;
  const d = Math.hypot(player.x - fromX, player.y - fromY) || 1;
  player.kbx = (player.x - fromX) / d * 220;
  player.kby = (player.y - fromY) / d * 220;
  if (player.hp <= 0) {
    player.hp = 0;
    game.state = 'gameover';
  }
}

// ---------------------------------------------------------- mise à jour
function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (dirDown('up')) { dy -= 1; player.dir = 'up'; }
  if (dirDown('down')) { dy += 1; player.dir = 'down'; }
  if (dirDown('left')) { dx -= 1; player.dir = 'left'; }
  if (dirDown('right')) { dx += 1; player.dir = 'right'; }
  if (touchUI.joyId !== null && Math.hypot(touchUI.vecX, touchUI.vecY) > 0.25) {
    dx = touchUI.vecX; dy = touchUI.vecY;
    player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  player.moving = dx !== 0 || dy !== 0;
  if (player.moving) {
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    player.walkT += dt * 9;
  }
  const kdx = player.kbx * dt, kdy = player.kby * dt;
  player.kbx *= Math.pow(0.0001, dt);
  player.kby *= Math.pow(0.0001, dt);
  moveEntity(player, dx * player.speed * dt + kdx, dy * player.speed * dt + kdy, game.screen);

  player.attackT = Math.max(0, player.attackT - dt);
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.invuln = Math.max(0, player.invuln - dt);

  // transitions d'écran
  let [sx, sy] = game.screen.split(',').map(Number);
  let moved = false;
  if (player.x < 6 && sx > 0) { sx--; player.x = W - 8; moved = true; }
  else if (player.x > W - 6 && sx < WORLD_W - 1) { sx++; player.x = 8; moved = true; }
  else if (player.y < 6 && sy > 0) { sy--; player.y = ROWS * TILE - 8; moved = true; }
  else if (player.y > ROWS * TILE - 6 && sy < WORLD_H - 1) { sy++; player.y = 8; moved = true; }
  if (moved) {
    game.screen = sx + ',' + sy;
    spawnScreen(game.screen);
  }

  // ramassages
  for (const p of PICKUPS) {
    const key = p[0] + ':' + p[1] + ',' + p[2];
    if (p[0] !== game.screen || game.takenPickups.has(key)) continue;
    if (Math.hypot(player.x - (p[1] * TILE + 20), player.y - (p[2] * TILE + 20)) < 28) {
      game.takenPickups.add(key);
      player.piquets += 3;
      toast('+3 piquets !');
      sfx.pickup();
    }
  }
  drops = drops.filter(d => {
    d.t -= dt;
    if (d.t <= 0) return false;
    if (Math.hypot(player.x - d.x, player.y - d.y) < 26) {
      if (d.kind === 'coeur') { player.hp = Math.min(player.maxHp, player.hp + 2); toast('+1 coeur'); }
      else { player.piquets++; toast('+1 piquet'); }
      sfx.pickup();
      return false;
    }
    return true;
  });
}

function chargerAI(e, dt, speed, isBoss) {
  e.stun = Math.max(0, e.stun - dt);
  if (e.mode === 'idle') {
    if (e.stun > 0) return;
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    const aligned = Math.abs(dx) < 34 || Math.abs(dy) < 34;
    if (dist < (isBoss ? 420 : 270) && aligned) {
      e.mode = 'charge';
      const n = dist || 1;
      e.cx = dx / n; e.cy = dy / n;
      if (isBoss) sfx.denied();
    }
  } else {
    const nx = e.x + e.cx * speed * dt;
    const ny = e.y + e.cy * speed * dt;
    const hw = isBoss ? 26 : 16;
    if (isSolidAt(nx + Math.sign(e.cx) * hw, ny, game.screen) ||
        isSolidAt(nx, ny + Math.sign(e.cy) * hw, game.screen) ||
        nx < 20 || nx > W - 20 || ny < 20 || ny > ROWS * TILE - 20) {
      e.mode = 'idle';
      e.stun = isBoss ? 1.1 : 0.8;
      game.shake = Math.max(game.shake, 0.18);
      sfx.hit();
      if (isBoss && enemies.length < 3 && Math.random() < 0.5) {
        enemies.push(makeEnemy('taupe', Math.floor(e.x / TILE), Math.floor(e.y / TILE)));
        toast('Une taupe surgit !', 1.4);
      }
    } else { e.x = nx; e.y = ny; }
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    e.hitT = Math.max(0, (e.hitT || 0) - dt);
    e.x += e.kbx * dt; e.y += e.kby * dt;
    e.kbx *= Math.pow(0.0001, dt); e.kby *= Math.pow(0.0001, dt);

    if (e.type === 'taupe') {
      e.t -= dt;
      if (e.t <= 0) {
        e.t = 1 + Math.random() * 1.5;
        const toPlayer = Math.hypot(player.x - e.x, player.y - e.y) < 220;
        const a = toPlayer
          ? Math.atan2(player.y - e.y, player.x - e.x) + (Math.random() - 0.5)
          : Math.random() * Math.PI * 2;
        e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
      }
      moveEntity(e, e.vx * dt, e.vy * dt, game.screen, 12, 10);
    } else if (e.type === 'sanglier') {
      chargerAI(e, dt, 250, false);
    } else if (e.type === 'ronce') {
      e.shootT -= dt;
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (e.shootT <= 0 && d < 330) {
        e.shootT = 2.2;
        const n = d || 1;
        projectiles.push({
          x: e.x, y: e.y,
          vx: (player.x - e.x) / n * 190, vy: (player.y - e.y) / n * 190, t: 3,
        });
        beep(700, 0.05, 'sawtooth', 0.04);
      }
    }
    // contact
    if (player.invuln <= 0 && Math.abs(e.x - player.x) < 26 && Math.abs(e.y - player.y) < 26) {
      hurtPlayer(e.dmg, e.x, e.y);
    }
  }
  if (boss) {
    boss.hitT = Math.max(0, boss.hitT - dt);
    boss.x += boss.kbx * dt; boss.y += boss.kby * dt;
    boss.kbx *= Math.pow(0.0001, dt); boss.kby *= Math.pow(0.0001, dt);
    chargerAI(boss, dt, 300, true);
    if (player.invuln <= 0 && Math.abs(boss.x - player.x) < 38 && Math.abs(boss.y - player.y) < 36) {
      hurtPlayer(boss.dmg, boss.x, boss.y);
    }
  }
  projectiles = projectiles.filter(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
    if (p.t <= 0 || isSolidAt(p.x, p.y, game.screen)) return false;
    if (player.invuln <= 0 && Math.abs(p.x - player.x) < 18 && Math.abs(p.y - player.y) < 22) {
      hurtPlayer(1, p.x - p.vx, p.y - p.vy);
      return false;
    }
    return true;
  });
}

function update(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt);
  game.toasts = game.toasts.filter(t => (t.t -= dt) > 0);

  if (game.state === 'title') {
    if (pressed.has('e') || pressed.has('E') || pressed.has('Enter') || pressed.has(' ')) {
      game.state = 'play';
      spawnScreen(game.screen);
      toast('Allez voir Daniel Moquet ! (E pour parler)', 4);
    }
  } else if (game.state === 'dialog') {
    if (pressed.has('e') || pressed.has('E') || pressed.has('Enter') || pressed.has(' ')) {
      game.dialog.i++;
      sfx.talk();
      if (game.dialog.i >= game.dialog.lines.length) {
        const cb = game.dialog.onEnd;
        game.dialog = null;
        game.state = 'play';
        if (cb) cb();
      }
    }
  } else if (game.state === 'play') {
    if (pressed.has(' ') || pressed.has('j') || pressed.has('J')) attack();
    if (pressed.has('e') || pressed.has('E') || pressed.has('Enter')) interact();
    updatePlayer(dt);
    updateEnemies(dt);
  } else if (game.state === 'gameover') {
    if (pressed.has('e') || pressed.has('E') || pressed.has('Enter')) location.reload();
  }
  if (pressed.has('m') || pressed.has('M')) {
    game.musicOn = !game.musicOn;
    toast(game.musicOn ? 'Musique : ON' : 'Musique : OFF', 1.2);
  }
  pressed.clear();
}

// ---------------------------------------------------------- rendu
let ctx = null;

function drawTile(t, x, y, px, py) {
  const v = (x * 7 + y * 13) % 4;
  switch (t) {
    case '.': case ',': {
      ctx.fillStyle = v % 2 ? '#5fae46' : '#58a540';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      if (v === 0) ctx.fillRect(px + 8, py + 12, 4, 4);
      if (v === 2) ctx.fillRect(px + 24, py + 28, 4, 4);
      if (t === ',') {
        ctx.fillStyle = ['#f4d7e8', '#fff2a8', '#ffffff', '#f7b3c2'][v];
        ctx.fillRect(px + 10, py + 10, 5, 5);
        ctx.fillRect(px + 26, py + 24, 5, 5);
        ctx.fillStyle = '#e8c14d';
        ctx.fillRect(px + 11, py + 11, 3, 3);
      }
      break;
    }
    case 'p':
      ctx.fillStyle = v % 2 ? '#cdab6e' : '#c4a266';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(px + (v * 7) % 28, py + (v * 11) % 28, 5, 4);
      break;
    case 's': // enrobé signature Daniel Moquet : rouge-orangé, fini propre
      ctx.fillStyle = v % 2 ? '#b8543a' : '#b04e36';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(px + (v * 9) % 30, py + (v * 5) % 30, 4, 3);
      break;
    case 'g':
      ctx.fillStyle = '#a8a294';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#948e80';
      ctx.fillRect(px + 6, py + 8, 6, 5);
      ctx.fillRect(px + 22, py + 22, 7, 5);
      break;
    case 'c':
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#5d3f24';
      ctx.fillRect(px, py + 18, TILE, 4);
      ctx.fillStyle = '#6fbf4a';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + 6 + i * 12, py + 8, 4, 9);
        ctx.fillRect(px + 6 + i * 12, py + 26, 4, 9);
      }
      break;
    case 'w': {
      ctx.fillStyle = '#3a7bd5';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const off = Math.floor(Math.sin(game.time * 2 + x + y) * 4);
      ctx.fillRect(px + 6 + off, py + 12, 12, 3);
      ctx.fillRect(px + 20 - off, py + 28, 10, 3);
      break;
    }
    case 't':
      ctx.fillStyle = v % 2 ? '#5fae46' : '#58a540';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#6b4326';
      ctx.fillRect(px + 16, py + 24, 8, 14);
      ctx.fillStyle = '#2c6e2a';
      ctx.beginPath();
      ctx.arc(px + 20, py + 16, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#388a35';
      ctx.beginPath();
      ctx.arc(px + 15, py + 12, 9, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'r':
      ctx.fillStyle = v % 2 ? '#5fae46' : '#58a540';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#8d8d8d';
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 32);
      ctx.lineTo(px + 12, py + 12);
      ctx.lineTo(px + 26, py + 8);
      ctx.lineTo(px + 34, py + 28);
      ctx.lineTo(px + 28, py + 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a8a8a8';
      ctx.fillRect(px + 14, py + 14, 8, 6);
      break;
    case 'b':
      ctx.fillStyle = '#e8e2d4';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#d4cdbb';
      ctx.fillRect(px, py + TILE - 6, TILE, 6);
      break;
  }
}

function drawScreen() {
  const grid = MAPS[game.screen];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      drawTile(grid[y][x], x, y, x * TILE, HUD_H + y * TILE);

  // habillage du QG aux couleurs du logo (jaune + verts)
  if (game.screen === '1,1') {
    const bx = 3 * TILE, by = HUD_H + 2 * TILE, bw = 6 * TILE, bh = 3 * TILE;
    ctx.fillStyle = '#f5c400';                       // toit jaune
    ctx.fillRect(bx - 6, by - 10, bw + 12, 26);
    ctx.fillStyle = '#2f9e2b';
    ctx.fillRect(bx - 6, by + 10, bw + 12, 6);
    ctx.fillStyle = '#5a3a1e';                       // porte
    ctx.fillRect(bx + bw / 2 - 14, by + bh - 34, 28, 34);
    ctx.fillStyle = '#7ec8e3';                       // fenêtres
    ctx.fillRect(bx + 16, by + 30, 26, 22);
    ctx.fillRect(bx + bw - 42, by + 30, 26, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + 20, by + 2, bw - 40, 14);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DANIEL MOQUET', bx + bw / 2, by + 13);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#f5c400';
    ctx.fillText('signe vos clôtures', bx + bw / 2, by + bh - 40);
  }

  // chantiers : trous, piquets plantés, grillage
  for (const c of CHANTIERS) {
    if (c.screen !== game.screen) continue;
    const pts = c.holes.map(([hx, hy], i) => ({
      x: hx * TILE + TILE / 2, y: HUD_H + hy * TILE + TILE / 2,
      filled: game.filled.has(c.id + ':' + i),
    }));
    // grillage entre piquets consécutifs plantés
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    if (c.loop && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
    ctx.strokeStyle = '#9aa0a8';
    ctx.lineWidth = 2;
    for (const [a, b] of segs) {
      if (!a.filled || !b.filled) continue;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 22 + k * 7);
        ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 19 + k * 7, b.x, b.y - 22 + k * 7);
        ctx.stroke();
      }
    }
    for (const p of pts) {
      if (p.filled) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 8, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a5a2e';
        ctx.fillRect(p.x - 4, p.y - 26, 8, 34);
        ctx.fillStyle = '#a8713c';
        ctx.fillRect(p.x - 4, p.y - 26, 3, 34);
        ctx.fillStyle = '#6b4523';
        ctx.fillRect(p.x - 5, p.y - 28, 10, 4);
      } else {
        ctx.fillStyle = '#3d2b18';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 9, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5230';
        ctx.beginPath();
        ctx.ellipse(p.x + 10, p.y + 4, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // marqueur clignotant
        if (Math.sin(game.time * 5) > 0) {
          ctx.strokeStyle = '#ffe14d';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - 13, p.y - 13, 26, 26);
        }
      }
    }
  }

  // bottes de piquets
  for (const p of PICKUPS) {
    const key = p[0] + ':' + p[1] + ',' + p[2];
    if (p[0] !== game.screen || game.takenPickups.has(key)) continue;
    const px = p[1] * TILE + 8, py = HUD_H + p[2] * TILE + 6;
    const bob = Math.sin(game.time * 3) * 2;
    ctx.fillStyle = '#8a5a2e';
    for (let i = 0; i < 3; i++) ctx.fillRect(px + i * 8, py + bob + i % 2 * 2, 6, 26);
    ctx.strokeStyle = '#d9b24a';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 2, py + bob + 8, 26, 6);
  }
}

function drawRemi() {
  const x = player.x, y = HUD_H + player.y;
  if (player.invuln > 0 && Math.floor(game.time * 16) % 2) return;
  const step = player.moving ? Math.sin(player.walkT) * 3 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // jambes (jean)
  ctx.fillStyle = '#3b5a8a';
  ctx.fillRect(x - 8, y + 2 + step, 7, 14);
  ctx.fillRect(x + 1, y + 2 - step, 7, 14);
  // polo jaune Daniel Moquet, col vert
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(x - 10, y - 12, 20, 16);
  ctx.fillStyle = '#2f9e2b';
  ctx.fillRect(x - 10, y - 12, 20, 3);
  // bras
  ctx.fillStyle = '#e8a96e';
  ctx.fillRect(x - 13, y - 9, 4, 11);
  ctx.fillRect(x + 9, y - 9, 4, 11);
  // tête + casquette verte
  ctx.fillStyle = '#e8a96e';
  ctx.fillRect(x - 7, y - 26, 14, 14);
  ctx.fillStyle = '#2f9e2b';
  ctx.fillRect(x - 8, y - 28, 16, 6);
  if (player.dir !== 'up') {
    const vx = player.dir === 'left' ? -10 : player.dir === 'right' ? 2 : -8;
    ctx.fillRect(x + vx, y - 26, 8, 3); // visière
  }
  // yeux
  ctx.fillStyle = '#222';
  if (player.dir === 'down') { ctx.fillRect(x - 4, y - 20, 3, 3); ctx.fillRect(x + 2, y - 20, 3, 3); }
  if (player.dir === 'left') ctx.fillRect(x - 5, y - 20, 3, 3);
  if (player.dir === 'right') ctx.fillRect(x + 3, y - 20, 3, 3);
  // masse de chantier
  const swing = player.attackT > 0;
  ctx.save();
  ctx.translate(x, y - 4);
  let ang = { down: 2.4, up: -0.7, left: 3.6, right: 1.0 }[player.dir];
  if (swing) ang += Math.sin((0.22 - player.attackT) / 0.22 * Math.PI) * 1.6 * (player.dir === 'left' ? -1 : 1);
  ctx.rotate(ang);
  ctx.fillStyle = '#9a6a34';
  ctx.fillRect(-2, -26, 4, 26);
  ctx.fillStyle = '#555';
  ctx.fillRect(-7, -34, 14, 10);
  ctx.fillStyle = '#777';
  ctx.fillRect(-7, -34, 14, 3);
  ctx.restore();
}

function drawDaniel() {
  if (game.screen !== DANIEL_POS.screen) return;
  const x = DANIEL_POS.x * TILE + TILE / 2;
  const y = HUD_H + DANIEL_POS.y * TILE + TILE / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#444';
  ctx.fillRect(x - 8, y + 2, 7, 14);
  ctx.fillRect(x + 1, y + 2, 7, 14);
  ctx.fillStyle = '#ffffff';            // polo blanc du patron
  ctx.fillRect(x - 10, y - 12, 20, 16);
  ctx.fillStyle = '#2f9e2b';
  ctx.fillRect(x - 10, y - 12, 20, 4);
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(x - 3, y - 8, 6, 4);     // logo
  ctx.fillStyle = '#e8a96e';
  ctx.fillRect(x - 7, y - 26, 14, 14);
  ctx.fillStyle = '#b8b8b8';            // cheveux gris
  ctx.fillRect(x - 7, y - 27, 14, 5);
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 4, y - 20, 3, 3);
  ctx.fillRect(x + 2, y - 20, 3, 3);
  // bulle "!"
  if (game.quest === 0 || game.quest === 2) {
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 34 + Math.sin(game.time * 4) * 3);
  }
}

function drawEnemy(e) {
  const x = e.x, y = HUD_H + e.y;
  const flash = e.hitT > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (e.type === 'taupe') {
    ctx.fillStyle = flash ? '#fff' : '#5d4332';
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2a6b8';
    ctx.beginPath();
    ctx.arc(x, y + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 6, y - 4, 3, 3);
    ctx.fillRect(x + 3, y - 4, 3, 3);
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(x - 9, y + 8, 4, 3);
    ctx.fillRect(x + 5, y + 8, 4, 3);
  } else if (e.type === 'sanglier') {
    const ch = e.mode === 'charge';
    ctx.fillStyle = flash ? '#fff' : '#4a3526';
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#3a2a1e';
    ctx.beginPath();
    ctx.ellipse(x + (ch ? e.cx * 10 : 10), y + 2, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0e6d2';
    ctx.fillRect(x + 12, y + 4, 6, 3);
    ctx.fillStyle = '#d33';
    ctx.fillRect(x + 8, y - 4, 4, 3);
    if (ch) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - e.cx * 26 - 3, y - e.cy * 26, 6, 4);
    }
  } else if (e.type === 'ronce') {
    ctx.fillStyle = flash ? '#fff' : '#2e5e2a';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : '#1d401b';
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + game.time;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
      ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20);
      ctx.stroke();
    }
    ctx.fillStyle = '#d33';
    ctx.fillRect(x - 5, y - 4, 4, 4);
    ctx.fillRect(x + 2, y - 4, 4, 4);
  }
}

function drawBoss() {
  if (!boss) return;
  const x = boss.x, y = HUD_H + boss.y;
  const flash = boss.hitT > 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#3a2a1e';
  ctx.beginPath();
  ctx.ellipse(x, y, 34, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#2a1d14';
  const hx = x + (boss.mode === 'charge' ? boss.cx * 20 : 20);
  ctx.beginPath();
  ctx.ellipse(hx, y + 4, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f0e6d2';   // défenses
  ctx.fillRect(hx + 8, y + 8, 12, 5);
  ctx.fillRect(hx - 18, y + 8, 12, 5);
  ctx.fillStyle = '#f33';
  ctx.fillRect(hx - 4, y - 6, 5, 4);
  ctx.fillRect(hx + 4, y - 6, 5, 4);
  // couronne royale
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 20);
  ctx.lineTo(x - 14, y - 34);
  ctx.lineTo(x - 7, y - 26);
  ctx.lineTo(x, y - 36);
  ctx.lineTo(x + 7, y - 26);
  ctx.lineTo(x + 14, y - 34);
  ctx.lineTo(x + 14, y - 20);
  ctx.closePath();
  ctx.fill();
  // barre de vie
  ctx.fillStyle = '#000';
  ctx.fillRect(W / 2 - 152, HUD_H + 10, 304, 18);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(W / 2 - 150, HUD_H + 12, 300 * boss.hp / boss.maxHp, 14);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SANGLIER ROYAL', W / 2, HUD_H + 23);
}

function drawHUD() {
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, W, HUD_H);
  // coeurs
  for (let i = 0; i < player.maxHp / 2; i++) {
    const hx = 14 + i * 26, hy = 12;
    const full = player.hp >= (i + 1) * 2, half = player.hp === i * 2 + 1;
    drawHeart(hx, hy, full ? '#e23b3b' : half ? '#e23b3b' : '#4a3a3a', half);
  }
  // piquets
  ctx.fillStyle = '#8a5a2e';
  ctx.fillRect(110, 8, 8, 24);
  ctx.fillStyle = '#6b4523';
  ctx.fillRect(108, 6, 12, 5);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('x ' + player.piquets, 126, 27);
  // chantiers
  ctx.fillStyle = '#f5c400';
  ctx.fillText('Chantiers : ' + game.chantiersDone + '/' + CHANTIERS.length, 210, 27);
  // nom de l'écran
  ctx.fillStyle = '#cbb89a';
  ctx.textAlign = 'right';
  ctx.fillText(SCREEN_NAMES[game.screen] || '', W - 14, 27);
  // objectif
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9a8a72';
  ctx.font = '13px monospace';
  const obj = game.quest === 0 ? 'Parlez à Daniel (E)'
    : game.quest === 1 ? 'Clôturez les chantiers (E sur les trous)'
    : game.quest === 2 ? 'Vainquez le Sanglier Royal au nord !'
    : 'Mission accomplie !';
  ctx.fillText(obj, W / 2 + 60, 27);
}

function drawHeart(x, y, color, half) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 16);
  ctx.bezierCurveTo(x - 4, y + 6, x + 2, y - 4, x + 9, y + 3);
  ctx.bezierCurveTo(x + 16, y - 4, x + 22, y + 6, x + 9, y + 16);
  ctx.fill();
  if (half) {
    ctx.fillStyle = '#4a3a3a';
    ctx.fillRect(x + 9, y - 4, 12, 22);
  }
}

function drawDialog() {
  if (!game.dialog) return;
  const d = game.dialog;
  const bx = 40, by = H - 150, bw = W - 80, bh = 120;
  ctx.fillStyle = 'rgba(10,8,6,0.92)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#2f9e2b';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#f5c400';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(d.speaker, bx + 16, by + 24);
  ctx.fillStyle = '#f4ead8';
  ctx.font = '14px monospace';
  wrapText(d.lines[d.i], bx + 16, by + 48, bw - 32, 19);
  ctx.fillStyle = '#9a8a72';
  ctx.textAlign = 'right';
  ctx.font = '12px monospace';
  ctx.fillText('E pour continuer ' + (d.i + 1) + '/' + d.lines.length, bx + bw - 12, by + bh - 10);
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

function drawTitle() {
  ctx.fillStyle = '#1a2e14';
  ctx.fillRect(0, 0, W, H);
  // herbe décorative
  for (let i = 0; i < 60; i++) {
    const r = rng(i * 999)();
    ctx.fillStyle = 'rgba(95,174,70,0.25)';
    ctx.fillRect((i * 167) % W, (i * 211) % H, 6, 6);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c400';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('RÉMI', W / 2, 150);
  ctx.fillStyle = '#f4ead8';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('La Légende de la Clôture', W / 2, 200);
  ctx.fillStyle = '#8bc53f';
  ctx.font = '16px monospace';
  ctx.fillText('Une aventure non officielle « Daniel Moquet signe vos clôtures »', W / 2, 245);
  // logo : carré jaune, carrés verts, arbre
  const lx = W / 2 - 200, ly = 330;
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(lx, ly, 70, 70);
  ctx.fillStyle = '#8bc53f';
  ctx.save();
  ctx.translate(lx - 18, ly + 42);
  ctx.rotate(-0.06);
  ctx.fillRect(0, 0, 48, 48);
  ctx.restore();
  ctx.fillStyle = '#5cb531';
  ctx.save();
  ctx.translate(lx + 52, ly + 40);
  ctx.rotate(0.05);
  ctx.fillRect(0, 0, 52, 52);
  ctx.restore();
  ctx.strokeStyle = '#0f9d3a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(lx + 92, ly + 88);
  ctx.quadraticCurveTo(lx + 82, ly + 40, lx + 70, ly + 14);
  ctx.stroke();
  ctx.fillStyle = '#0f9d3a';
  [[58, 4, 22], [84, -4, 20], [104, 8, 16], [72, 22, 17], [94, 26, 14]].forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(lx + cx, ly + cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  // Rémi géant
  ctx.save();
  ctx.translate(W / 2 + 150, 420);
  ctx.scale(3, 3);
  const t = game.time;
  ctx.fillStyle = '#3b5a8a';
  ctx.fillRect(-8, 2, 7, 14);
  ctx.fillRect(1, 2, 7, 14);
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(-10, -12, 20, 16);
  ctx.fillStyle = '#2f9e2b';
  ctx.fillRect(-10, -12, 20, 3);
  ctx.fillStyle = '#e8a96e';
  ctx.fillRect(-13, -9, 4, 11);
  ctx.fillRect(9, -9 + Math.sin(t * 2) * 2, 4, 11);
  ctx.fillRect(-7, -26, 14, 14);
  ctx.fillStyle = '#2f9e2b';
  ctx.fillRect(-8, -28, 16, 6);
  ctx.fillRect(-8, -26, 8, 3);
  ctx.fillStyle = '#222';
  ctx.fillRect(-4, -20, 3, 3);
  ctx.fillRect(2, -20, 3, 3);
  ctx.restore();
  ctx.fillStyle = Math.sin(game.time * 4) > 0 ? '#ffe14d' : '#9a8a72';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Appuyez sur E pour pointer au chantier', W / 2, 560);
  ctx.fillStyle = '#6a5a48';
  ctx.font = '13px monospace';
  ctx.fillText('ZQSD bouger — ESPACE masse — E action — M musique', W / 2, 600);
}

function drawEnd(win) {
  ctx.fillStyle = win ? 'rgba(20,40,15,0.93)' : 'rgba(30,8,8,0.93)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (win) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('VICTOIRE !', W / 2, 200);
    ctx.fillStyle = '#f4ead8';
    ctx.font = '18px monospace';
    ctx.fillText('Le Sanglier Royal est vaincu. Les clôtures de la vallée', W / 2, 270);
    ctx.fillText('sont sauvées : Daniel Moquet a bien signé vos clôtures.', W / 2, 296);
    ctx.fillStyle = '#8bc53f';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('Daniel Moquet est fier de toi, Rémi.', W / 2, 360);
    ctx.fillStyle = '#cbb89a';
    ctx.font = '16px monospace';
    ctx.fillText('Employé du mois : RÉMI, poseur de clôture', W / 2, 400);
    ctx.fillStyle = '#9a8a72';
    ctx.font = '14px monospace';
    ctx.fillText('Merci d’avoir joué ! (F5 pour rejouer)', W / 2, 480);
  } else {
    ctx.fillStyle = '#e23b3b';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('GAME OVER', W / 2, 240);
    ctx.fillStyle = '#f4ead8';
    ctx.font = '18px monospace';
    ctx.fillText('Rémi est rentré à l’atelier se soigner...', W / 2, 310);
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('Appuyez sur E pour reprendre le chantier', W / 2, 380);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (game.state === 'title') { drawTitle(); return; }

  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake * 30, (Math.random() - 0.5) * game.shake * 30);
  }
  drawScreen();
  // drops
  for (const d of drops) {
    const bob = Math.sin(game.time * 4 + d.x) * 2;
    if (d.kind === 'coeur') drawHeart(d.x - 9, HUD_H + d.y - 8 + bob, '#e23b3b', false);
    else {
      ctx.fillStyle = '#8a5a2e';
      ctx.fillRect(d.x - 3, HUD_H + d.y - 14 + bob, 7, 26);
      ctx.fillStyle = '#6b4523';
      ctx.fillRect(d.x - 5, HUD_H + d.y - 16 + bob, 11, 4);
    }
  }
  drawDaniel();
  for (const e of enemies) drawEnemy(e);
  drawBoss();
  // projectiles (épines)
  ctx.fillStyle = '#5d4332';
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, HUD_H + p.y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillRect(-7, -2, 14, 4);
    ctx.restore();
  }
  drawRemi();
  ctx.restore();

  drawHUD();

  // toasts
  let ty = HUD_H + 18;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px monospace';
  for (const t of game.toasts) {
    ctx.fillStyle = 'rgba(10,8,6,0.8)';
    const tw = ctx.measureText(t.msg).width + 24;
    ctx.fillRect(W / 2 - tw / 2, ty - 14, tw, 24);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(t.msg, W / 2, ty + 3);
    ty += 30;
  }

  if (game.state === 'dialog') drawDialog();
  if (game.state === 'gameover') drawEnd(false);
  if (game.state === 'victory') drawEnd(true);
  if (touchUI.enabled && game.state === 'play') drawTouchControls();
}

function drawTouchControls() {
  ctx.save();
  ctx.globalAlpha = 0.4;
  // joystick : à l'endroit du doigt, sinon zone indicative
  const jx = touchUI.joyId !== null ? touchUI.joyX : 120;
  const jy = touchUI.joyId !== null ? touchUI.joyY : H - 110;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(jx, jy, 52, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(jx, jy, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f5c400';
  ctx.beginPath();
  ctx.arc(jx + touchUI.vecX * 34, jy + touchUI.vecY * 34, 24, 0, Math.PI * 2);
  ctx.fill();
  // boutons
  for (const [b, col] of [[touchUI.btnA, '#c0392b'], [touchUI.btnB, '#2f9e2b']]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x, b.y + 7);
  }
  ctx.restore();
}

// ---------------------------------------------------------- boucle & init
function init() {
  const canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');

  window.addEventListener('keydown', e => {
    ensureAudio();
    if (!keys[e.key]) pressed.add(e.key);
    keys[e.key] = true;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // --- tactile (mobile)
  const canvasPos = t => {
    const r = canvas.getBoundingClientRect();
    return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
  };
  const inBtn = (p, b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    ensureAudio();
    touchUI.enabled = true;
    for (const t of e.changedTouches) {
      const p = canvasPos(t);
      if (game.state !== 'play') { pressed.add('e'); continue; }
      if (inBtn(p, touchUI.btnA)) pressed.add(' ');
      else if (inBtn(p, touchUI.btnB)) pressed.add('e');
      else if (p.x < W * 0.55 && touchUI.joyId === null) {
        touchUI.joyId = t.identifier;
        touchUI.joyX = p.x; touchUI.joyY = p.y;
        touchUI.vecX = 0; touchUI.vecY = 0;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touchUI.joyId) continue;
      const p = canvasPos(t);
      const dx = (p.x - touchUI.joyX) / 45, dy = (p.y - touchUI.joyY) / 45;
      const m = Math.hypot(dx, dy);
      touchUI.vecX = m > 1 ? dx / m : dx;
      touchUI.vecY = m > 1 ? dy / m : dy;
    }
  }, { passive: false });

  const endTouch = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchUI.joyId) {
        touchUI.joyId = null;
        touchUI.vecX = 0; touchUI.vecY = 0;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------- auto-test (node game.js)
function selfTest() {
  let errors = 0;
  const walkable = (g, x, y) => !SOLID.has(g[y][x]);
  for (const key of Object.keys(MAPS)) {
    const g = MAPS[key];
    if (g.length !== ROWS) { console.error(key, 'mauvais nombre de rangées'); errors++; }
    g.forEach((row, i) => {
      if (row.length !== COLS) { console.error(key, 'rangée', i, 'mauvaise largeur'); errors++; }
    });
    (SPAWNS[key] || []).forEach(([t, x, y]) => {
      if (!walkable(g, x, y)) { console.error(key, 'spawn bloqué', t, x, y); errors++; }
    });
  }
  for (const c of CHANTIERS) {
    const g = MAPS[c.screen];
    c.holes.forEach(([x, y]) => {
      if (!walkable(g, x, y)) { console.error('trou bloqué', c.name, x, y); errors++; }
      let ok = false;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        if (walkable(g, x + dx, y + dy)) ok = true;
      });
      if (!ok) { console.error('trou inaccessible', c.name, x, y); errors++; }
    });
  }
  for (const [s, x, y] of PICKUPS) {
    if (!walkable(MAPS[s], x, y)) { console.error('piquets bloqués', s, x, y); errors++; }
  }
  const dg = MAPS[DANIEL_POS.screen];
  if (!walkable(dg, DANIEL_POS.x, DANIEL_POS.y)) { console.error('Daniel bloqué'); errors++; }
  if (!walkable(MAPS[PLAYER_START.screen], PLAYER_START.x, PLAYER_START.y)) { console.error('spawn joueur bloqué'); errors++; }

  // connectivité : depuis le spawn joueur, tout le monde doit être atteignable
  const seen = new Set();
  const stack = [[PLAYER_START.screen, PLAYER_START.x, PLAYER_START.y]];
  while (stack.length) {
    const [s, x, y] = stack.pop();
    const k = s + ':' + x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k);
    const [sx, sy] = s.split(',').map(Number);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      let nx = x + dx, ny = y + dy, ns = s, nsx = sx, nsy = sy;
      if (nx < 0) { nsx--; nx = COLS - 1; } else if (nx >= COLS) { nsx++; nx = 0; }
      if (ny < 0) { nsy--; ny = ROWS - 1; } else if (ny >= ROWS) { nsy++; ny = 0; }
      if (nsx < 0 || nsy < 0 || nsx >= WORLD_W || nsy >= WORLD_H) return;
      ns = nsx + ',' + nsy;
      if (walkable(MAPS[ns], nx, ny)) stack.push([ns, nx, ny]);
    });
  }
  const reach = (s, x, y, what) => {
    if (!seen.has(s + ':' + x + ',' + y)) { console.error('INATTEIGNABLE', what, s, x, y); errors++; }
  };
  CHANTIERS.forEach(c => c.holes.forEach(([x, y], i) => reach(c.screen, x, y, c.name + ' trou ' + i)));
  PICKUPS.forEach(([s, x, y]) => reach(s, x, y, 'piquets'));
  reach(DANIEL_POS.screen, DANIEL_POS.x, DANIEL_POS.y, 'Daniel');
  reach(BOSS_SCREEN, 11, 6, 'arène du boss');
  Object.keys(SPAWNS).forEach(s => SPAWNS[s].forEach(([t, x, y]) => reach(s, x, y, 'spawn ' + t)));

  console.log(errors === 0 ? 'AUTO-TEST OK — monde valide, tout est atteignable (' + seen.size + ' tuiles)' : errors + ' ERREUR(S)');
  if (typeof process !== 'undefined') process.exit(errors === 0 ? 0 : 1);
}

if (typeof window === 'undefined') selfTest();
else init();
