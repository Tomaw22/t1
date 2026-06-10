/* ============================================================
   RÉMICRAFT — un Minecraft-like en WebGL pur, sans dépendance.
   Monde voxel procédural, première personne, casser/poser des
   blocs, jouable clavier+souris et tactile (joystick + glisser
   pour regarder), sauvegarde locale du monde.
   ============================================================ */
'use strict';

// ---------------------------------------------------------- monde
const SX = 96, SY = 48, SZ = 96;      // taille du monde en blocs
const WATER = 13;                      // niveau de l'eau

// identifiants de blocs
const AIR = 0, HERBE = 1, TERRE = 2, PIERRE = 3, SABLE = 4,
      BOIS = 5, FEUILLES = 6, PLANCHES = 7, BRIQUE = 8, EAU = 9;
const HOTBAR = [HERBE, TERRE, PIERRE, SABLE, BOIS, FEUILLES, PLANCHES, BRIQUE];
const NAMES = ['air', 'herbe', 'terre', 'pierre', 'sable', 'bois', 'feuilles', 'planches', 'brique', 'eau'];
const isSolid = id => id > 0 && id !== EAU;

const world = new Uint8Array(SX * SY * SZ);
const idx = (x, y, z) => (y * SZ + z) * SX + x;
const inWorld = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
const getBlock = (x, y, z) => inWorld(x, y, z) ? world[idx(x, y, z)] : AIR;

let seed = 1337;
let edits = {};                        // modifications du joueur { index: id }

// ---------------------------------------------------------- bruit déterministe
function hash2(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 1274126177) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function noise2(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function octaves(x, z, s, n) {
  let v = 0, amp = 1, freq = 1, tot = 0;
  for (let i = 0; i < n; i++) {
    v += noise2(x * freq, z * freq, s + i * 77) * amp;
    tot += amp; amp *= 0.5; freq *= 2;
  }
  return v / tot;
}

// ---------------------------------------------------------- génération
function heightAt(x, z) {
  const n = octaves(x / 38, z / 38, seed, 4);
  const m = octaves(x / 90, z / 90, seed + 999, 2);     // grandes collines
  return Math.floor(8 + n * 16 + m * 14);
}

function generate() {
  world.fill(AIR);
  for (let x = 0; x < SX; x++) {
    for (let z = 0; z < SZ; z++) {
      const h = Math.min(SY - 10, heightAt(x, z));
      for (let y = 0; y <= h; y++) {
        let b = PIERRE;
        if (y === h) b = h <= WATER + 1 ? SABLE : HERBE;
        else if (y >= h - 3) b = h <= WATER + 1 ? SABLE : TERRE;
        world[idx(x, y, z)] = b;
      }
      for (let y = h + 1; y <= WATER; y++) world[idx(x, y, z)] = EAU;
      // arbres
      if (h > WATER + 1 && x > 3 && z > 3 && x < SX - 4 && z < SZ - 4 &&
          hash2(x, z, seed + 555) < 0.012) {
        const th = 4 + Math.floor(hash2(x, z, seed + 556) * 2);
        for (let y = h + 1; y <= h + th; y++) world[idx(x, y, z)] = BOIS;
        for (let dy = -2; dy <= 1; dy++)
          for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++) {
              const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
              if (r > 4 || (dx === 0 && dz === 0 && dy <= 0)) continue;
              const yy = h + th + dy, xx = x + dx, zz = z + dz;
              if (inWorld(xx, yy, zz) && world[idx(xx, yy, zz)] === AIR)
                world[idx(xx, yy, zz)] = FEUILLES;
            }
      }
    }
  }
  for (const k in edits) world[k] = edits[k];   // ré-applique les modifs
}

function saveWorld() {
  try { localStorage.setItem('remicraft', JSON.stringify({ seed, edits })); } catch (e) { /* plein */ }
}

function loadWorld() {
  try {
    const d = JSON.parse(localStorage.getItem('remicraft'));
    if (d && typeof d.seed === 'number') { seed = d.seed; edits = d.edits || {}; return true; }
  } catch (e) { /* corrompu */ }
  return false;
}

// ---------------------------------------------------------- joueur
const player = {
  x: SX / 2 + 0.5, y: 30, z: SZ / 2 + 0.5,
  vx: 0, vy: 0, vz: 0,
  yaw: 0.6, pitch: 0.2,
  onGround: false,
  w: 0.3, h: 1.8, eye: 1.62,
  slot: 0,
};

function spawn() {
  const x = Math.floor(SX / 2), z = Math.floor(SZ / 2);
  let h = SY - 2;
  while (h > 0 && !isSolid(getBlock(x, h, z))) h--;
  player.x = x + 0.5; player.z = z + 0.5; player.y = h + 1.01;
  player.vx = player.vy = player.vz = 0;
}

function collides(px, py, pz) {
  const w = player.w, h = player.h;
  for (let x = Math.floor(px - w); x <= Math.floor(px + w); x++)
    for (let y = Math.floor(py); y <= Math.floor(py + h); y++)
      for (let z = Math.floor(pz - w); z <= Math.floor(pz + w); z++)
        if (isSolid(getBlock(x, y, z))) return true;
  return false;
}

const inWater = () => getBlock(Math.floor(player.x), Math.floor(player.y + 0.4), Math.floor(player.z)) === EAU;

function physics(dt, mvF, mvS, jump) {
  const speed = 4.4, water = inWater();
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const ax = (mvF * sy + mvS * cy) * speed;
  const az = (-mvF * cy + mvS * sy) * speed;
  player.vx = ax; player.vz = az;
  if (water) {
    player.vy += -12 * dt * 0.3;
    if (jump) player.vy = 3;
    player.vy = Math.max(-3, player.vy);
    player.vx *= 0.7; player.vz *= 0.7;
  } else {
    player.vy -= 22 * dt;
    if (jump && player.onGround) { player.vy = 7.6; sfx.jump(); }
  }
  player.vy = Math.max(-40, player.vy);

  // déplacement axe par axe
  let nx = player.x + player.vx * dt;
  if (!collides(nx, player.y, player.z)) player.x = nx;
  let nz = player.z + player.vz * dt;
  if (!collides(player.x, player.y, nz)) player.z = nz;
  let ny = player.y + player.vy * dt;
  player.onGround = false;
  if (!collides(player.x, ny, player.z)) {
    player.y = ny;
  } else {
    if (player.vy < 0) player.onGround = true;
    player.vy = 0;
  }
  if (player.y < -10) spawn();          // tombé hors du monde
}

// ---------------------------------------------------------- visée (raycast)
function raycast(maxDist) {
  const ox = player.x, oy = player.y + player.eye, oz = player.z;
  const sp = Math.sin(player.pitch), cp = Math.cos(player.pitch);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const dx = sy * cp, dy = -sp, dz = -cy * cp;
  let px = -1, py = -1, pz = -1;
  for (let t = 0; t < maxDist; t += 0.04) {
    const x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
    if (x === px && y === py && z === pz) continue;
    const b = getBlock(x, y, z);
    if (isSolid(b)) return { x, y, z, px, py, pz, id: b };
    px = x; py = y; pz = z;
  }
  return null;
}

function setBlock(x, y, z, id) {
  if (!inWorld(x, y, z)) return;
  world[idx(x, y, z)] = id;
  edits[idx(x, y, z)] = id;
  saveWorld();
  remeshAt(x, y, z);
}

function mine() {
  const hit = raycast(6);
  if (!hit || hit.y === 0) return false;      // le socle est incassable
  setBlock(hit.x, hit.y, hit.z, AIR);
  sfx.break_(hit.id);
  return true;
}

function build() {
  const hit = raycast(6);
  if (!hit || hit.px < 0) return false;
  const { px, py, pz } = hit;
  if (!inWorld(px, py, pz) || getBlock(px, py, pz) !== AIR && getBlock(px, py, pz) !== EAU) return false;
  // pas dans les jambes du joueur
  const w = player.w;
  if (px === Math.floor(player.x) && pz === Math.floor(player.z) &&
      py >= Math.floor(player.y) && py <= Math.floor(player.y + player.h)) return false;
  if (Math.abs(px + 0.5 - player.x) < w + 0.5 && Math.abs(pz + 0.5 - player.z) < w + 0.5 &&
      py + 1 > player.y && py < player.y + player.h) return false;
  setBlock(px, py, pz, HOTBAR[player.slot]);
  sfx.place();
  return true;
}

// ---------------------------------------------------------- audio
let actx = null;
function ensureAudio() {
  if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* muet */ }
}
function tone(f0, f1, dur, type, vol) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  break_: id => tone(id === PIERRE || id === BRIQUE ? 320 : 220, 60, 0.13, 'square', 0.07),
  place: () => tone(160, 320, 0.09, 'square', 0.06),
  jump: () => tone(180, 320, 0.1, 'triangle', 0.04),
  click: () => tone(700, 500, 0.05, 'square', 0.04),
};

// ---------------------------------------------------------- atlas de textures (généré)
const TILE = 16, NTILES = 12;
// tuiles : 0 herbe-dessus 1 herbe-côté 2 terre 3 pierre 4 sable 5 bois-côté
//          6 bois-dessus 7 feuilles 8 planches 9 brique 10 eau 11 blanc
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = TILE * NTILES; cv.height = TILE;
  const c = cv.getContext('2d');
  const px = (t, x, y, col) => { c.fillStyle = col; c.fillRect(t * TILE + x, y, 1, 1); };
  const fill = (t, col) => { c.fillStyle = col; c.fillRect(t * TILE, 0, TILE, TILE); };
  const speckle = (t, cols, n, s) => {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(hash2(i, 1, s) * TILE), y = Math.floor(hash2(i, 2, s) * TILE);
      px(t, x, y, cols[i % cols.length]);
    }
  };
  fill(0, '#5fae46'); speckle(0, ['#55a23e', '#6cbb52', '#4c9636'], 90, 11);
  fill(1, '#8a6b48'); speckle(1, ['#7a5e3e', '#977753'], 70, 22);
  c.fillStyle = '#5fae46'; c.fillRect(1 * TILE, 0, TILE, 4);
  speckle(1, ['#55a23e', '#6cbb52'], 14, 23);
  fill(2, '#8a6b48'); speckle(2, ['#7a5e3e', '#977753', '#6d5236'], 80, 33);
  fill(3, '#8d8d8d'); speckle(3, ['#7d7d7d', '#9d9d9d', '#6f6f6f'], 70, 44);
  fill(4, '#e2d29b'); speckle(4, ['#d4c48d', '#efe0ab'], 70, 55);
  fill(5, '#6b4326'); for (let y = 0; y < TILE; y++) { px(5, 3, y, '#56351e'); px(5, 9, y, '#56351e'); px(5, 13, y, '#7d5230'); }
  fill(6, '#7d5230'); speckle(6, ['#6b4326', '#56351e'], 30, 66);
  c.strokeStyle = '#56351e'; c.strokeRect(6 * TILE + 2.5, 2.5, 11, 11);
  fill(7, '#2c6e2a'); speckle(7, ['#235c22', '#388a35', '#1d4f1c'], 90, 77);
  fill(8, '#b08d55'); for (let y = 0; y < TILE; y += 4) { c.fillStyle = '#96753f'; c.fillRect(8 * TILE, y, TILE, 1); }
  speckle(8, ['#a5824a'], 24, 88);
  fill(9, '#a8523c'); c.fillStyle = '#8d4231';
  for (let y = 0; y < TILE; y += 4) {
    c.fillRect(9 * TILE, y, TILE, 1);
    for (let x = (y / 4) % 2 ? 0 : 4; x < TILE; x += 8) c.fillRect(9 * TILE + x, y, 1, 4);
  }
  fill(10, '#3a7bd5'); speckle(10, ['#4d8be0', '#2f6cc4'], 40, 99);
  fill(11, '#ffffff');
  return cv;
}

// tuile par face de bloc : [dessus, côté, dessous]
const FACES = {
  [HERBE]: [0, 1, 2], [TERRE]: [2, 2, 2], [PIERRE]: [3, 3, 3], [SABLE]: [4, 4, 4],
  [BOIS]: [6, 5, 6], [FEUILLES]: [7, 7, 7], [PLANCHES]: [8, 8, 8], [BRIQUE]: [9, 9, 9],
  [EAU]: [10, 10, 10],
};

// ---------------------------------------------------------- WebGL
let gl = null, prog = null, tex = null;
let uMvp, uFog, uSky, uLight, uAlpha;

const VS = `
attribute vec3 aPos; attribute vec2 aUV; attribute float aL;
uniform mat4 uMvp;
varying vec2 vUV; varying float vL; varying float vDist;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  vUV = aUV; vL = aL; vDist = gl_Position.w;
}`;
const FS = `
precision mediump float;
varying vec2 vUV; varying float vL; varying float vDist;
uniform sampler2D uTex; uniform float uFog; uniform vec3 uSky;
uniform float uLight; uniform float uAlpha;
void main() {
  vec4 c = texture2D(uTex, vUV);
  c.rgb *= vL * uLight;
  float f = smoothstep(uFog * 0.55, uFog, vDist);
  gl_FragColor = vec4(mix(c.rgb, uSky, f), uAlpha);
}`;

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function initGL(canvas) {
  gl = canvas.getContext('webgl', { antialias: false }) || canvas.getContext('experimental-webgl');
  if (!gl) throw new Error('WebGL indisponible');
  prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.bindAttribLocation(prog, 1, 'aUV');
  gl.bindAttribLocation(prog, 2, 'aL');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  uMvp = gl.getUniformLocation(prog, 'uMvp');
  uFog = gl.getUniformLocation(prog, 'uFog');
  uSky = gl.getUniformLocation(prog, 'uSky');
  uLight = gl.getUniformLocation(prog, 'uLight');
  uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.enable(gl.DEPTH_TEST);
}

// ---------------------------------------------------------- matrices 4x4 (colonne-major)
function mPersp(fov, asp, n, f) {
  const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]);
}
function mMul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const mRotX = a => new Float32Array([1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1]);
const mRotY = a => new Float32Array([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]);
const mTrans = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

// ---------------------------------------------------------- maillage par tronçons
const CH = 16;
const CX = SX / CH, CZ = SZ / CH;
const chunks = [];   // { solid:{buf,n}, water:{buf,n} }

// faces : direction, sommets (4, CCW vus de l'extérieur), éclairage
const DIRS = [
  { d: [0, 1, 0], l: 1.0, f: 0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },   // dessus
  { d: [0, -1, 0], l: 0.5, f: 2, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },  // dessous
  { d: [1, 0, 0], l: 0.8, f: 1, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },   // +x
  { d: [-1, 0, 0], l: 0.8, f: 1, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },  // -x
  { d: [0, 0, 1], l: 0.7, f: 1, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },   // +z
  { d: [0, 0, -1], l: 0.7, f: 1, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },  // -z
];

function buildChunk(cx, cz) {
  const solid = [], water = [];
  const x0 = cx * CH, z0 = cz * CH;
  for (let x = x0; x < x0 + CH; x++) {
    for (let z = z0; z < z0 + CH; z++) {
      for (let y = 0; y < SY; y++) {
        const b = world[idx(x, y, z)];
        if (b === AIR) continue;
        const isWater = b === EAU;
        const arr = isWater ? water : solid;
        for (const dir of DIRS) {
          const nb = getBlock(x + dir.d[0], y + dir.d[1], z + dir.d[2]);
          if (isWater) { if (nb !== AIR) continue; }
          else if (isSolid(nb)) continue;
          const tile = FACES[b][dir.f];
          const u0 = (tile + 0.02) / NTILES, u1 = (tile + 0.98) / NTILES;
          const uv = [[u0, 0.98], [u1, 0.98], [u1, 0.02], [u0, 0.02]];
          const yTop = isWater && getBlock(x, y + 1, z) !== EAU ? 0.88 : 1;
          const quad = dir.v.map(p => [x + p[0], y + p[1] * yTop, z + p[2]]);
          for (const i of [0, 1, 2, 0, 2, 3]) {
            arr.push(quad[i][0], quad[i][1], quad[i][2], uv[i][0], uv[i][1], dir.l);
          }
        }
      }
    }
  }
  const make = arr => {
    if (!arr.length) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return { buf, n: arr.length / 6 };
  };
  const old = chunks[cz * CX + cx];
  if (old) {
    if (old.solid) gl.deleteBuffer(old.solid.buf);
    if (old.water) gl.deleteBuffer(old.water.buf);
  }
  chunks[cz * CX + cx] = { solid: make(solid), water: make(water) };
}

function buildAllChunks() {
  for (let cz = 0; cz < CZ; cz++)
    for (let cx = 0; cx < CX; cx++) buildChunk(cx, cz);
}

function remeshAt(x, y, z) {
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  buildChunk(cx, cz);
  if (x % CH === 0 && cx > 0) buildChunk(cx - 1, cz);
  if (x % CH === CH - 1 && cx < CX - 1) buildChunk(cx + 1, cz);
  if (z % CH === 0 && cz > 0) buildChunk(cx, cz - 1);
  if (z % CH === CH - 1 && cz < CZ - 1) buildChunk(cx, cz + 1);
}

// surlignage du bloc visé (arêtes)
let hlBuf = null;
function buildHighlight(x, y, z) {
  const e = 0.002, a = [x - e, y - e, z - e], b = [x + 1 + e, y + 1 + e, z + 1 + e];
  const P = [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]],
             [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const u = (11 + 0.5) / NTILES;
  const arr = [];
  for (const [i, j] of E) {
    arr.push(P[i][0], P[i][1], P[i][2], u, 0.5, 0.05);
    arr.push(P[j][0], P[j][1], P[j][2], u, 0.5, 0.05);
  }
  if (!hlBuf) hlBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, hlBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
  return 24;
}

function bindAttribs() {
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
}

// ---------------------------------------------------------- rendu
const FOG = 80;
let dayT = 0.3;          // 0..1, cycle jour/nuit

function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function render(canvas) {
  const day = Math.max(0, Math.sin(dayT * Math.PI * 2));        // 1 = midi
  const sky = lerp3([0.03, 0.05, 0.12], [0.55, 0.75, 0.95], smooth(Math.min(1, day * 1.4)));
  const light = 0.3 + 0.7 * smooth(Math.min(1, day * 1.3));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(sky[0], sky[1], sky[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const proj = mPersp(1.22, canvas.width / canvas.height, 0.1, 300);
  const view = mMul(mMul(mRotX(player.pitch), mRotY(player.yaw)),
    mTrans(-player.x, -(player.y + player.eye), -player.z));
  gl.uniformMatrix4fv(uMvp, false, mMul(proj, view));
  gl.uniform1f(uFog, FOG);
  gl.uniform3f(uSky, sky[0], sky[1], sky[2]);
  gl.uniform1f(uLight, light);
  gl.uniform1f(uAlpha, 1);

  for (const ch of chunks) {
    if (!ch || !ch.solid) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.solid.buf);
    bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, ch.solid.n);
  }
  // bloc visé
  const hit = raycast(6);
  if (hit) {
    const n = buildHighlight(hit.x, hit.y, hit.z);
    gl.bindBuffer(gl.ARRAY_BUFFER, hlBuf);
    bindAttribs();
    gl.uniform1f(uLight, 1);
    gl.drawArrays(gl.LINES, 0, n);
    gl.uniform1f(uLight, light);
  }
  // eau (transparente)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.uniform1f(uAlpha, 0.72);
  for (const ch of chunks) {
    if (!ch || !ch.water) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.water.buf);
    bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, ch.water.n);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.uniform1f(uAlpha, 1);
}

// ---------------------------------------------------------- entrées
const keys = {};
let paused = true;
let mineHeld = false, buildHeld = false, mineT = 0, buildT = 0;

const KEYFWD = ['z', 'Z', 'w', 'W'], KEYBCK = ['s', 'S'],
      KEYLFT = ['q', 'Q', 'a', 'A'], KEYRGT = ['d', 'D'];
const any = list => list.some(k => keys[k]);

// tactile
const touch = { joyId: null, joyX: 0, joyY: 0, vx: 0, vy: 0, lookId: null, lx: 0, ly: 0 };
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

function setupInput(canvas) {
  window.addEventListener('keydown', e => {
    ensureAudio();
    keys[e.key] = true;
    if (e.key >= '1' && e.key <= '8') selectSlot(+e.key - 1);
    if (e.key === ' ') e.preventDefault();
    if (e.key === 'Escape') showMenu();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // souris
  canvas.addEventListener('click', () => {
    if (!paused && !isTouch && document.pointerLockElement !== canvas)
      canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    document.getElementById('pauseHint').textContent =
      document.pointerLockElement ? 'Échap : menu' : (paused || isTouch ? '' : 'Cliquez pour capturer la souris');
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw += e.movementX * 0.0024;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + e.movementY * 0.0024));
  });
  canvas.addEventListener('mousedown', e => {
    if (paused || document.pointerLockElement !== canvas) return;
    if (e.button === 0) { mine(); mineHeld = true; mineT = 0.28; }
    if (e.button === 2) { build(); buildHeld = true; buildT = 0.28; }
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) mineHeld = false;
    if (e.button === 2) buildHeld = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('wheel', e => {
    if (paused) return;
    selectSlot((player.slot + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
  });

  // tactile : gauche = joystick, droite = regarder
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    ensureAudio();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45 && touch.joyId === null) {
        touch.joyId = t.identifier;
        touch.joyX = t.clientX; touch.joyY = t.clientY;
        touch.vx = 0; touch.vy = 0;
        const joy = document.getElementById('joy');
        joy.classList.add('show');
        joy.style.left = (t.clientX - 65) + 'px';
        joy.style.top = (t.clientY - 65) + 'px';
      } else if (touch.lookId === null) {
        touch.lookId = t.identifier;
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) {
        const dx = (t.clientX - touch.joyX) / 48, dy = (t.clientY - touch.joyY) / 48;
        const m = Math.hypot(dx, dy) || 1;
        touch.vx = m > 1 ? dx / m : dx;
        touch.vy = m > 1 ? dy / m : dy;
        const knob = document.getElementById('knob');
        knob.style.transform = `translate(calc(-50% + ${touch.vx * 36}px), calc(-50% + ${touch.vy * 36}px))`;
      } else if (t.identifier === touch.lookId) {
        player.yaw += (t.clientX - touch.lx) * 0.006;
        player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch + (t.clientY - touch.ly) * 0.006));
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
  }, { passive: false });
  const endT = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.joyId) {
        touch.joyId = null; touch.vx = 0; touch.vy = 0;
        document.getElementById('joy').classList.remove('show');
        document.getElementById('knob').style.transform = 'translate(-50%,-50%)';
      }
      if (t.identifier === touch.lookId) touch.lookId = null;
    }
  };
  canvas.addEventListener('touchend', endT);
  canvas.addEventListener('touchcancel', endT);

  // boutons tactiles
  const hold = (el, down, up) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); ensureAudio(); down(); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); up && up(); }, { passive: false });
  };
  hold(document.getElementById('bJump'), () => { keys[' '] = true; }, () => { keys[' '] = false; });
  hold(document.getElementById('bMine'), () => { mine(); mineHeld = true; mineT = 0.28; }, () => { mineHeld = false; });
  hold(document.getElementById('bBuild'), () => { build(); buildHeld = true; buildT = 0.34; }, () => { buildHeld = false; });
}

// ---------------------------------------------------------- interface
function selectSlot(i) {
  player.slot = i;
  document.querySelectorAll('.slot').forEach((el, j) => el.classList.toggle('sel', j === i));
  sfx.click();
}

function buildHotbar() {
  const atlas = makeAtlas();
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  HOTBAR.forEach((id, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === player.slot ? ' sel' : '');
    const cv = document.createElement('canvas');
    cv.width = TILE; cv.height = TILE;
    cv.getContext('2d').drawImage(atlas, FACES[id][1] * TILE, 0, TILE, TILE, 0, 0, TILE, TILE);
    const num = document.createElement('span');
    num.textContent = i + 1;
    slot.appendChild(cv); slot.appendChild(num);
    slot.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); selectSlot(i); }, { passive: false });
    slot.addEventListener('mousedown', e => { e.stopPropagation(); selectSlot(i); });
    bar.appendChild(slot);
  });
}

function showMenu() {
  paused = true;
  document.getElementById('menu').style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
}

function hideMenu(canvas) {
  paused = false;
  document.getElementById('menu').style.display = 'none';
  if (!isTouch) canvas.requestPointerLock();
}

// ---------------------------------------------------------- boucle
function main() {
  const canvas = document.getElementById('c');
  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  try { initGL(canvas); } catch (err) {
    document.getElementById('menu').innerHTML =
      '<h1>RémiCraft</h1><h2>WebGL est indisponible sur cet appareil : ' + err.message + '</h2>';
    return;
  }

  if (isTouch) document.body.classList.add('touch');
  document.getElementById('help').innerHTML = isTouch
    ? 'Joystick (gauche) : bouger — glisser (droite) : regarder<br>⛏ casser — 🧱 poser — ⬆ sauter — barre : choisir le bloc<br>Le monde est sauvegardé automatiquement.'
    : 'ZQSD/WASD : bouger — souris : regarder — ESPACE : sauter<br>clic gauche : casser — clic droit : poser — molette/1-8 : bloc — Échap : menu<br>Le monde est sauvegardé automatiquement.';

  loadWorld();
  generate();
  buildAllChunks();
  spawn();
  buildHotbar();

  document.getElementById('play').addEventListener('click', () => { ensureAudio(); hideMenu(canvas); });
  document.getElementById('newWorld').addEventListener('click', () => {
    ensureAudio();
    seed = Math.floor(Math.random() * 1e9);
    edits = {};
    saveWorld();
    generate();
    buildAllChunks();
    spawn();
    hideMenu(canvas);
  });

  setupInput(canvas);

  // accès debug / tests
  window.__craft = {
    player, getBlock, setBlock, mine, build, raycast, spawn,
    get paused() { return paused; },
    gl: () => !!gl,
  };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      dayT = (dayT + dt / 240) % 1;          // journée de 4 minutes
      let f = 0, s = 0;
      if (any(KEYFWD)) f += 1;
      if (any(KEYBCK)) f -= 1;
      if (any(KEYLFT)) s -= 1;
      if (any(KEYRGT)) s += 1;
      if (touch.joyId !== null) { f = -touch.vy; s = touch.vx; }
      const n = Math.hypot(f, s);
      if (n > 1) { f /= n; s /= n; }
      physics(dt, f, s, keys[' ']);
      // casser/poser maintenus
      if (mineHeld) { mineT -= dt; if (mineT <= 0) { mine(); mineT = 0.28; } }
      if (buildHeld) { buildT -= dt; if (buildT <= 0) { build(); buildT = 0.34; } }
    }
    render(canvas);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
