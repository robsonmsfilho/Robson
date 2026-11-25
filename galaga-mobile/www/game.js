'use strict';
(() => {
// ============================================================
//  STAR SWARM - arcade space shooter for mobile (HTML5 Canvas)
// ============================================================
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

const W = 360;
let H = 640;
let viewScale = 1, dpr = 1;
const STEP = 4;
const TAU = Math.PI * 2;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  H = Math.round(clamp(W * vh / vw, 580, 780));
  viewScale = Math.min(vw / W, vh / H);
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = Math.floor(W * viewScale), ch = Math.floor(H * viewScale);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const pb = $('btnPause');
  pb.style.left = ((vw - cw) / 2 + cw - 48) + 'px';
  pb.style.top = ((vh - ch) / 2 + 8) + 'px';
  player.y = H - 64;
}

// ── Audio ────────────────────────────────────────────────────
let actx = null, noiseBuf = null;
let soundOn = localStorage.getItem('starswarm.sound') !== 'off';

function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') actx.resume();
}

function tone(f0, f1, dur, type = 'square', vol = 0.12, delay = 0) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, freq = 1200) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime;
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(actx.destination);
  s.start(t); s.stop(t + dur);
}

const sfx = {
  shoot: () => tone(1400, 320, 0.09, 'square', 0.06),
  hit: () => tone(500, 900, 0.06, 'square', 0.08),
  boom: () => noise(0.28, 0.28, 2200),
  bigBoom: () => { noise(0.9, 0.45, 1600); tone(160, 40, 0.8, 'sawtooth', 0.15); },
  dive: () => tone(1100, 260, 0.45, 'sine', 0.05),
  beam: () => { for (let i = 0; i < 10; i++) tone(260 + (i % 2) * 140, 300 + (i % 2) * 140, 0.22, 'triangle', 0.06, i * 0.22); },
  captured: () => [784, 659, 523, 392, 330].forEach((f, i) => tone(f, f, 0.2, 'square', 0.08, i * 0.16)),
  rescued: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'square', 0.08, i * 0.1)),
  start: () => [440, 554, 659, 880, 659, 880, 1109].forEach((f, i) => tone(f, f, 0.16, 'square', 0.07, i * 0.13)),
  life: () => [880, 1175, 1568, 1175, 1568].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.1, i * 0.09)),
  perfect: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.15, 'square', 0.07, i * 0.1)),
};

// ── Sprites (original pixel art) ─────────────────────────────
const PAL = {
  w: '#ffffff', r: '#ff3b3b', b: '#3b7bff', y: '#ffd23b', c: '#3bf0ff',
  g: '#3bff7a', p: '#c05bff', o: '#ff9a2e', d: '#1a2a80',
};
const PX = 2;

function makeSprite(rows, remap = {}) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = remap[ch] || PAL[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

const SHIP_ROWS = [
  '.......w.......',
  '.......w.......',
  '......wcw......',
  '......www......',
  '...r..www..r...',
  '...w.wwwww.w...',
  '...w.wwbww.w...',
  'r..wwwbbbwww..r',
  'w..wwwwbwwww..w',
  'w.wwwwwwwwwww.w',
  'wwwwwr.w.rwwwww',
  'www.rr.w.rr.www',
  'ww.....w.....ww',
  'w.............w',
];

const SPR = {
  ship: makeSprite(SHIP_ROWS),
  captive: makeSprite(SHIP_ROWS, { w: '#ff5b5b', c: '#ffffff', b: '#ffd23b', r: '#ffffff' }),
  drone: [
    makeSprite([
      '..c.......c..',
      '...c.....c...',
      '....yyyyy....',
      '.bbyyryryybb.',
      'bbbyyyyyyybbb',
      'bb..yyyyy..bb',
      'b...y.y.y...b',
      '....y...y....',
    ]),
    makeSprite([
      '...c.....c...',
      '...c.....c...',
      '....yyyyy....',
      '..byyryryyb..',
      '.bbyyyyyyybb.',
      '.bbbyyyyybbb.',
      '..bby.y.ybb..',
      '....y...y....',
    ]),
  ],
  wasp: [
    makeSprite([
      '....w...w....',
      '.....w.w.....',
      '...rrrrrrr...',
      '..rrwrrrwrr..',
      'wrrrrrrrrrrrw',
      'w.rrbrrrbrr.w',
      'w..rr.r.rr..w',
      '...r.....r...',
    ]),
    makeSprite([
      '...w.....w...',
      '....w...w....',
      '...rrrrrrr...',
      '..rrwrrrwrr..',
      '.wrrrrrrrrrw.',
      'ww.rbrrrbr.ww',
      'w..rr.r.rr..w',
      '....r...r....',
    ]),
  ],
};
const BOSS_ROWS = [
  [
    '.....o...o.....',
    '......o.o......',
    '....ggggggg....',
    '...ggcgggcgg...',
    '..ggggggggggg..',
    'gg.gyyyyyyyg.gg',
    'ggggggggggggggg',
    'g..ggg.g.ggg..g',
    'g...g.....g...g',
    '....gg...gg....',
  ],
  [
    '.....o...o.....',
    '......o.o......',
    '....ggggggg....',
    '...ggcgggcgg...',
    'g.ggggggggggg.g',
    'gg.gyyyyyyyg.gg',
    '.ggggggggggggg.',
    '...ggg.g.ggg...',
    '..gg.......gg..',
    '....gg...gg....',
  ],
];
SPR.boss = BOSS_ROWS.map(r => makeSprite(r));
SPR.bossHurt = BOSS_ROWS.map(r => makeSprite(r, { g: PAL.p }));

const TYPE = {
  drone: { r: 11, pts: [50, 100], colors: ['#ffd23b', '#3b7bff', '#3bf0ff'] },
  wasp: { r: 11, pts: [80, 160], colors: ['#ff3b3b', '#ffffff', '#3b7bff'] },
  boss: { r: 13, pts: [150, 400], colors: ['#3bff7a', '#c05bff', '#ffd23b'] },
};

function drawSprite(img, x, y, angle = 0, alpha = 1) {
  const w = img.width * PX, h = img.height * PX;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ── Stars ────────────────────────────────────────────────────
const STAR_COLORS = ['#ffffff', '#3bf0ff', '#ffd23b', '#ff5b5b', '#3bff7a', '#c05bff'];
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random() * W, y: Math.random() * 800, z: rand(0.3, 1.6),
  c: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0], ph: Math.random() * TAU,
}));

// ── State ────────────────────────────────────────────────────
const game = {
  state: 'title', stage: 0, score: 0, lives: 2, frame: 0, timer: 0,
  hi: +localStorage.getItem('starswarm.hi') || 0,
  challenge: false, hits: 0, shots: 0, kills: 0, chHits: 0, nextLife: 20000,
  paused: false, spawnTimer: 0, waveIdx: 0, waves: [], diveTimer: 0,
  banner: '', bannerTimer: 0, overTimer: 0, starSpeed: 1,
};
const form = { t: 0, sway: 24, breathe: 0 };
const player = {
  x: W / 2, y: H - 64, alive: false, dual: false, respawn: 0, targetX: null,
  cooldown: 0, invuln: 0, capture: null, pendingDual: false,
};
let enemies = [], pBullets = [], eBullets = [], particles = [], popups = [];
let rescue = null;

// ── Paths ────────────────────────────────────────────────────
function spline(pts) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push({ ...P[P.length - 2] });
  return out;
}

function arc(cx, cy, r, a0, a1, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

const mirror = (pts, m) => m ? pts.map(p => ({ x: W - p.x, y: p.y })) : pts;

const ENTRY = {
  top: () => [{ x: 160, y: -20 }, { x: 160, y: 60 }, { x: 110, y: 170 }, { x: 70, y: 260 },
    ...arc(120, 330, 50, Math.PI, -Math.PI / 2, 9)],
  side: () => [{ x: -20, y: 540 }, { x: 70, y: 500 }, { x: 140, y: 462 },
    ...arc(195, 400, 58, Math.PI / 2, -Math.PI * 0.7, 10)],
};

const CHALLENGE_PATHS = [
  () => [{ x: 170, y: -20 }, { x: 120, y: 120 }, { x: 60, y: 260 }, { x: 140, y: 360 }, { x: 260, y: 300 },
    { x: 300, y: 180 }, { x: 230, y: 110 }, { x: 150, y: 170 }, { x: 120, y: 330 }, { x: 70, y: H + 40 }],
  () => [{ x: -20, y: 180 }, { x: 100, y: 210 }, { x: 190, y: 270 }, ...arc(200, 350, 70, -Math.PI / 2, Math.PI * 1.5, 14),
    { x: 270, y: 300 }, { x: W + 40, y: 230 }],
  () => [{ x: -20, y: H - 140 }, { x: 110, y: H - 250 }, { x: 230, y: H - 370 }, { x: 300, y: 200 },
    { x: 200, y: 90 }, { x: 80, y: 150 }, { x: 60, y: 320 }, { x: -30, y: 420 }],
  () => [{ x: 120, y: -20 }, { x: 120, y: 200 }, ...arc(180, 260, 60, Math.PI, 0, 8), { x: 240, y: 200 },
    { x: 240, y: 120 }, ...arc(180, 120, 60, 0, -Math.PI, 8), { x: 120, y: 260 }, { x: 160, y: H + 40 }],
];

// ── Waves ────────────────────────────────────────────────────
const COLS = 10, SPX = 30, SPY = 28, FORM_TOP = 78;

function slotPos(row, col) {
  const b = 1 + form.breathe * (0.5 - 0.5 * Math.cos(form.t * 0.045));
  const sx = Math.sin(form.t * 0.022) * form.sway;
  return {
    x: W / 2 + sx + (col - (COLS - 1) / 2) * SPX * b,
    y: FORM_TOP + row * SPY * (1 + (b - 1) * 0.7),
  };
}

const range = (row, cols, type) => cols.map(c => [type, row, c]);

function normalWaves(stage) {
  const m = stage % 2 === 0;
  const L = !m, R = m;
  return [
    { groups: [
      { path: ENTRY.top, mirror: L, list: range(1, [3, 4, 5, 6], 'wasp') },
      { path: ENTRY.top, mirror: !L, list: range(3, [3, 4, 5, 6], 'drone') },
    ] },
    { groups: [{ path: ENTRY.side, mirror: L, list: [
      ['boss', 0, 3], ['wasp', 1, 1], ['boss', 0, 4], ['wasp', 1, 2],
      ['boss', 0, 5], ['wasp', 1, 7], ['boss', 0, 6], ['wasp', 1, 8]] }] },
    { groups: [{ path: ENTRY.side, mirror: R, list: range(2, [1, 2, 3, 4, 5, 6, 7, 8], 'wasp') }] },
    { groups: [{ path: ENTRY.top, mirror: R, list: [...range(3, [0, 1, 2, 7, 8, 9], 'drone'), ...range(4, [4, 5], 'drone')] }] },
    { groups: [{ path: ENTRY.top, mirror: L, list: range(4, [0, 1, 2, 3, 6, 7, 8, 9], 'drone') }] },
  ];
}

function challengeWaves(stage) {
  const types = ['drone', 'wasp', 'boss', 'wasp', 'drone'];
  const waves = [];
  for (let w = 0; w < 5; w++) {
    const p = CHALLENGE_PATHS[(w + stage) % CHALLENGE_PATHS.length];
    const t = types[w];
    waves.push({ groups: [
      { path: p, mirror: false, list: Array.from({ length: 4 }, () => [t, 0, 0]) },
      { path: p, mirror: true, list: Array.from({ length: 4 }, () => [t, 0, 0]) },
    ] });
  }
  return waves;
}

function spawnWave(wave) {
  const speed = 3.3 + Math.min(game.stage, 12) * 0.06;
  for (const grp of wave.groups) {
    const path = spline(mirror(grp.path(), grp.mirror));
    grp.list.forEach(([type, row, col], i) => {
      const hp = type === 'boss' && !game.challenge ? 2 : 1;
      enemies.push({
        type, row, col, hp, maxHp: hp,
        x: path[0].x, y: path[0].y, angle: Math.PI, state: 'wait', delay: i * 9,
        path, pi: 0, speed, after: game.challenge ? 'escape' : 'home',
        vx: 0, vy: speed, captive: false, shots: 0, shootAt: [], beam: null, escortOf: null,
        anim: Math.random() * 60, entryShot: !game.challenge && game.stage > 1 && Math.random() < 0.08 + game.stage * 0.01,
      });
    });
  }
}

// ── Game flow ────────────────────────────────────────────────
function startGame() {
  ensureAudio();
  Object.assign(game, {
    stage: 0, score: 0, lives: 2, hits: 0, shots: 0, kills: 0, nextLife: 20000,
    paused: false, overTimer: 0,
  });
  Object.assign(player, { x: W / 2, alive: true, dual: false, respawn: 0, capture: null, pendingDual: false, invuln: 0, targetX: null });
  enemies = []; pBullets = []; eBullets = []; particles = []; popups = []; rescue = null;
  showOverlay(null);
  $('btnPause').classList.add('show');
  nextStage();
}

function nextStage() {
  game.stage++;
  game.challenge = game.stage % 4 === 3;
  game.chHits = 0;
  game.waves = game.challenge ? challengeWaves(game.stage) : normalWaves(game.stage);
  game.waveIdx = 0;
  game.spawnTimer = 150;
  game.diveTimer = 200;
  game.state = 'play';
  form.t = 0; form.sway = 24; form.breathe = 0;
  banner(game.challenge ? 'FASE BÔNUS' : 'FASE ' + game.stage, 140);
  sfx.start();
}

function banner(text, frames = 120) { game.banner = text; game.bannerTimer = frames; }

function addScore(n) {
  game.score += n;
  if (game.score >= game.nextLife) {
    game.lives++;
    game.nextLife += game.nextLife === 20000 ? 50000 : 70000;
    sfx.life();
    popup(W / 2, H / 2 + 40, 'VIDA EXTRA!', '#3bff7a', 90);
  }
  if (game.score > game.hi) game.hi = game.score;
}

function popup(x, y, text, color = '#fff', life = 50) { popups.push({ x, y, text, color, life, max: life }); }

function gameOver() {
  game.state = 'over';
  localStorage.setItem('starswarm.hi', game.hi);
  $('overScore').textContent = 'PONTOS ' + game.score;
  const acc = game.shots ? Math.round(game.hits / game.shots * 100) : 0;
  $('overStats').textContent = `FASE ${game.stage} · ABATES ${game.kills} · PRECISÃO ${acc}%`;
  $('overHi').textContent = game.hi;
  $('btnPause').classList.remove('show');
  showOverlay('over');
}

function showOverlay(id) {
  for (const o of document.querySelectorAll('.overlay')) o.classList.toggle('show', o.id === id);
}

function setPaused(p) {
  if (game.state !== 'play' && game.state !== 'stageEnd') return;
  game.paused = p;
  showOverlay(p ? 'pause' : null);
  input.active = false;
}

// ── Input ────────────────────────────────────────────────────
const input = { left: false, right: false, fire: false, active: false, id: null, sx: 0, shipX: 0 };
const toLX = cx => { const r = canvas.getBoundingClientRect(); return (cx - r.left) / r.width * W; };

document.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  ensureAudio();
  if (game.state === 'title' || game.paused) return;
  input.active = true; input.id = e.pointerId;
  input.sx = toLX(e.clientX); input.shipX = player.x;
  e.preventDefault();
}, { passive: false });
document.addEventListener('pointermove', e => {
  if (!input.active || e.pointerId !== input.id) return;
  player.targetX = input.shipX + (toLX(e.clientX) - input.sx) * 1.25;
  e.preventDefault();
}, { passive: false });
const endPointer = e => { if (e.pointerId === input.id) { input.active = false; input.id = null; } };
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
document.addEventListener('touchmove', e => { if (!e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'fire', ArrowUp: 'fire', KeyW: 'fire' };
document.addEventListener('keydown', e => {
  ensureAudio();
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; player.targetX = null; e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!game.paused);
  if ((e.code === 'Enter' || e.code === 'Space') && (game.state === 'title' || game.state === 'over') && document.querySelector('.overlay.show')?.id !== 'howto') startGame();
});
document.addEventListener('keyup', e => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });

document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) setPaused(true); });

// ── Player ───────────────────────────────────────────────────
function shipXs() { return player.dual ? [player.x - 13, player.x + 13] : [player.x]; }

function playerShoot() {
  const limit = player.dual ? 4 : 2;
  if (pBullets.length + (player.dual ? 2 : 1) > limit) return;
  for (const x of shipXs()) pBullets.push({ x, y: player.y - 14 });
  game.shots += player.dual ? 2 : 1;
  player.cooldown = 9;
  sfx.shoot();
}

function updatePlayer() {
  if (player.capture) { updateCapture(); return; }
  if (!player.alive) {
    if (game.state === 'over' || game.lives < 0) return;
    if (player.respawn > 0) player.respawn--;
    const busy = enemies.some(e => e.state === 'dive' || e.state === 'beam');
    if (player.respawn <= 0 && (!busy || player.respawn < -300) && !rescue) {
      Object.assign(player, { alive: true, x: W / 2, targetX: null, invuln: 90, dual: player.pendingDual, pendingDual: false });
    } else if (player.respawn <= 0) player.respawn--;
    return;
  }
  const half = player.dual ? 28 : 15;
  if (input.left || input.right) {
    player.x += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 4.2;
  } else if (player.targetX !== null) {
    player.x += clamp(player.targetX - player.x, -9, 9);
  }
  player.x = clamp(player.x, half, W - half);
  if (player.targetX !== null) player.targetX = clamp(player.targetX, half, W - half);
  if (input.active) input.shipX = clamp(input.shipX, half - 200, W - half + 200);
  if (player.invuln > 0) player.invuln--;
  if (player.cooldown > 0) player.cooldown--;
  else if ((input.active || input.fire) && game.state === 'play') playerShoot();
}

function killPlayer(shipIdx) {
  if (player.invuln > 0 || !player.alive) return;
  const xs = shipXs();
  if (player.dual) {
    explode(xs[shipIdx], player.y, ['#ffffff', '#3bf0ff', '#ff3b3b'], 34, 3.5);
    sfx.bigBoom();
    player.dual = false;
    player.x = xs[1 - shipIdx];
    player.invuln = 60;
    if (navigator.vibrate) navigator.vibrate(120);
    return;
  }
  explode(player.x, player.y, ['#ffffff', '#3bf0ff', '#ff3b3b', '#ffd23b'], 50, 4);
  sfx.bigBoom();
  if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
  player.alive = false;
  loseLife();
}

function loseLife() {
  game.lives--;
  player.respawn = 150;
  if (game.lives < 0) game.overTimer = 160;
  else banner('PRONTO', 150);
}

function updateCapture() {
  const c = player.capture, b = c.boss;
  c.t++;
  if (!enemies.includes(b)) { player.capture = null; player.invuln = 60; return; }
  const tx = b.x, ty = b.y + 34;
  player.x = lerp(player.x, tx, 0.05);
  player.y = lerp(player.y, ty, 0.025);
  c.angle = (c.angle || 0) + 0.25;
  if (c.t > 110) {
    player.capture = null;
    player.y = H - 64;
    player.alive = false;
    b.captive = true;
    loseLife();
    banner('NAVE CAPTURADA', 150);
  }
}

// ── Enemies ──────────────────────────────────────────────────
function followPath(e) {
  e.pi += e.speed / STEP;
  const i = Math.floor(e.pi);
  if (i >= e.path.length - 1) {
    const last = e.path[e.path.length - 1];
    e.x = last.x; e.y = last.y;
    return true;
  }
  const a = e.path[i], b = e.path[i + 1], f = e.pi - i;
  e.x = lerp(a.x, b.x, f); e.y = lerp(a.y, b.y, f);
  return false;
}

function updateEnemy(e) {
  const ox = e.x, oy = e.y;
  e.anim++;
  switch (e.state) {
    case 'wait':
      if (--e.delay <= 0) { e.state = 'path'; e.pi = 0; }
      return;
    case 'path': {
      const done = followPath(e);
      if (done) {
        if (e.after === 'escape') { e.dead = true; return; }
        if (e.after === 'beam') { e.state = 'beam'; e.beam = { t: 0, sound: false }; break; }
        if (e.after === 'wrap') {
          const s = slotPos(e.row, e.col);
          e.x = s.x; e.y = -30; e.vx = 0; e.vy = 2;
        } else { e.vx = e.x - ox; e.vy = e.y - oy; }
        e.state = 'home';
      }
      break;
    }
    case 'home': {
      const s = slotPos(e.row, e.col);
      const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy);
      const sp = Math.max(2.4, e.speed * 0.9);
      if (d < sp + 1) { e.state = 'form'; e.x = s.x; e.y = s.y; break; }
      e.vx += (dx / d * sp - e.vx) * 0.12;
      e.vy += (dy / d * sp - e.vy) * 0.12;
      e.x += e.vx; e.y += e.vy;
      break;
    }
    case 'form': {
      const s = slotPos(e.row, e.col);
      e.x = s.x; e.y = s.y;
      break;
    }
    case 'dive': {
      const done = followPath(e);
      if (e.shootAt.length && e.y > e.shootAt[0] && e.y < player.y - 90) { e.shootAt.shift(); enemyShoot(e); }
      if (done) {
        if (e.after === 'beam') { e.state = 'beam'; e.beam = { t: 0, sound: false }; }
        else { const s = slotPos(e.row, e.col); e.x = s.x; e.y = -30; e.vx = 0; e.vy = 2; e.state = 'home'; }
      }
      break;
    }
    case 'beam':
      updateBeam(e);
      break;
  }
  if (e.state === 'path' && e.entryShot && e.y > 120 && e.y < 360 && Math.random() < 0.02) { e.entryShot = false; enemyShoot(e); }
  const mx = e.x - ox, my = e.y - oy;
  const target = (e.state === 'form' || e.state === 'beam' || Math.hypot(mx, my) < 0.3) ? Math.PI : Math.atan2(my, mx) + Math.PI / 2;
  e.angle += angDiff(e.angle, target) * (e.state === 'form' ? 0.15 : 0.35);
}

const BEAM_EXT = 36, BEAM_HOLD = 170, BEAM_END = BEAM_HOLD + 36;

function beamLength(e) {
  const full = (H - 40) - (e.y + 14);
  const t = e.beam.t;
  if (t < BEAM_EXT) return full * t / BEAM_EXT;
  if (t < BEAM_HOLD) return full;
  return full * Math.max(0, 1 - (t - BEAM_HOLD) / (BEAM_END - BEAM_HOLD));
}

function updateBeam(e) {
  const bm = e.beam;
  bm.t++;
  if (bm.t === BEAM_EXT - 20) sfx.beam();
  if (bm.t > BEAM_EXT && bm.t < BEAM_HOLD && player.alive && !player.capture && !player.dual &&
      !enemies.some(o => o.captive) && Math.abs(player.x - e.x) < 26 && player.invuln <= 0) {
    player.capture = { boss: e, t: 0 };
    sfx.captured();
  }
  if (bm.t >= BEAM_END && !player.capture) {
    e.beam = null;
    e.state = 'home'; e.vx = 0; e.vy = -2.5;
  }
}

function enemyShoot(e) {
  if (!player.alive || game.challenge) return;
  const sp = 3 + Math.min(game.stage, 12) * 0.12;
  const dx = player.x + rand(-20, 20) - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  let vx = dx / d * sp; const vy = Math.max(dy / d * sp, sp * 0.6);
  vx = clamp(vx, -1.6, 1.6);
  eBullets.push({ x: e.x, y: e.y + 10, vx, vy });
}

function startDive() {
  const inForm = enemies.filter(e => e.state === 'form');
  if (!inForm.length) return;
  const diving = enemies.filter(e => e.state === 'dive' || e.state === 'beam').length;
  const maxDivers = Math.min(2 + Math.floor(game.stage / 2), 7);
  if (diving >= maxDivers) return;
  const e = inForm[(Math.random() * inForm.length) | 0];
  if (e.type === 'boss') {
    const canBeam = !player.dual && !rescue && !player.capture && !e.captive &&
      !enemies.some(o => o.captive || o.state === 'beam' || o.after === 'beam' && o.state === 'dive');
    if (canBeam && Math.random() < 0.55) { beamDive(e); return; }
    launchDive(e, 'boss');
    const escorts = inForm.filter(o => o.type === 'wasp' && o.row === 1 && Math.abs(o.col - e.col) <= 2 && o !== e).slice(0, 2);
    escorts.forEach((o, i) => launchDive(o, 'boss', e, i ? 22 : -22));
  } else {
    launchDive(e, e.type);
  }
}

function launchDive(e, kind, lead = null, off = 0) {
  const x0 = e.x, y0 = e.y, dir = x0 < W / 2 ? -1 : 1;
  const px = player.alive ? player.x : W / 2;
  let path;
  if (lead) {
    path = lead.path.map(p => ({ x: p.x + off, y: p.y + 6 }));
    path.unshift({ x: x0, y: y0 });
    path = spline(path.filter((p, i) => i === 0 || i % 4 === 0));
  } else {
    const pts = [{ x: x0, y: y0 }, { x: x0 + dir * 18, y: y0 - 26 }, { x: x0 + dir * 42, y: y0 - 14 }, { x: x0 + dir * 46, y: y0 + 26 }];
    if (kind === 'wasp') {
      pts.push({ x: lerp(x0, px, 0.5), y: H * 0.42 }, { x: px - dir * 70, y: H * 0.6 },
        { x: px + dir * 50, y: H * 0.76 }, { x: px - dir * 20, y: H + 40 });
    } else if (kind === 'boss') {
      pts.push({ x: lerp(x0, px, 0.5), y: H * 0.4 }, { x: px + dir * 40, y: H * 0.62 },
        { x: px - dir * 60, y: H * 0.85 }, { x: px - dir * 90, y: H + 40 });
    } else {
      pts.push({ x: lerp(x0, px, 0.4), y: H * 0.45 }, { x: px + rand(-30, 30), y: H * 0.72 }, { x: px - dir * 90, y: H + 40 });
    }
    path = spline(pts.map(p => ({ x: clamp(p.x, -30, W + 30), y: p.y })));
  }
  e.path = path; e.pi = 0; e.state = 'dive'; e.after = 'wrap';
  e.speed = 3.2 + Math.min(game.stage, 12) * 0.1;
  const n = game.stage < 2 ? 1 : game.stage < 5 ? 2 : 3;
  e.shootAt = Array.from({ length: n }, (_, i) => H * 0.3 + i * 45 + rand(0, 30));
  if (!lead) sfx.dive();
}

function beamDive(e) {
  const x0 = e.x, y0 = e.y, dir = x0 < W / 2 ? -1 : 1;
  const tx = clamp(player.x + rand(-30, 30), 40, W - 40), ty = H - 270;
  e.path = spline([{ x: x0, y: y0 }, { x: x0 + dir * 18, y: y0 - 26 }, { x: x0 + dir * 42, y: y0 - 10 },
    { x: lerp(x0, tx, 0.6), y: lerp(y0, ty, 0.6) }, { x: tx, y: ty }]);
  e.pi = 0; e.state = 'dive'; e.after = 'beam'; e.speed = 2.8; e.shootAt = [];
  sfx.dive();
}

function hitEnemy(e) {
  game.hits++;
  if (e.hp > 1) { e.hp--; sfx.hit(); return; }
  e.dead = true;
  game.kills++;
  const t = TYPE[e.type];
  const diving = e.state === 'dive' || e.state === 'beam' || (e.state === 'home' && !game.challenge && e.after !== 'home');
  let pts = game.challenge ? 100 : t.pts[diving ? 1 : 0];
  if (e.type === 'boss' && diving && e.captive) pts = 1000;
  addScore(pts);
  if (pts >= 150) popup(e.x, e.y, String(pts), '#3bf0ff');
  if (game.challenge) game.chHits++;
  explode(e.x, e.y, t.colors, 18, 2.6);
  sfx.boom();
  if (e.beam && player.capture && player.capture.boss === e) {
    player.capture = null; player.y = H - 64; player.invuln = 60;
  }
  if (e.captive) {
    const cp = captivePos(e);
    if (diving) {
      rescue = { x: cp.x, y: cp.y, angle: e.angle, t: 0 };
      banner('NAVE RESGATADA', 120);
      sfx.rescued();
    } else {
      popup(cp.x, cp.y, 'PERDIDA', '#ff5b5b', 70);
      explode(cp.x, cp.y, ['#ff5b5b', '#ffffff'], 16, 2);
    }
  }
}

function captivePos(e) {
  return { x: e.x - Math.sin(e.angle) * 24, y: e.y + Math.cos(e.angle) * 24 };
}

function updateRescue() {
  if (!rescue) return;
  rescue.t++;
  const tx = (player.alive ? player.x : W / 2) + 26, ty = H - 64;
  const dx = tx - rescue.x, dy = ty - rescue.y, d = Math.hypot(dx, dy);
  if (rescue.t < 60) { rescue.angle += 0.3; return; }
  rescue.angle += angDiff(rescue.angle, 0) * 0.2;
  if (d < 4) {
    if (player.alive) {
      player.dual = true;
      player.x = clamp(player.x + 13, 28, W - 28);
    } else player.pendingDual = true;
    rescue = null;
    return;
  }
  const sp = Math.min(4, d);
  rescue.x += dx / d * sp; rescue.y += dy / d * sp;
}

// ── Effects ──────────────────────────────────────────────────
function explode(x, y, colors, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = rand(0.4, 1) * sp;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(20, 40) | 0, c: colors[i % colors.length], s: Math.random() < 0.3 ? 3 : 2 });
  }
  particles.push({ ring: true, x, y, r: 2, life: 16, c: colors[0] });
}

// ── Collisions ───────────────────────────────────────────────
function collide() {
  for (const b of pBullets) {
    for (const e of enemies) {
      if (e.dead || e.state === 'wait') continue;
      if (e.captive) {
        const cp = captivePos(e);
        if (Math.abs(b.x - cp.x) < 11 && Math.abs(b.y - cp.y) < 12) {
          e.captive = false; b.dead = true;
          explode(cp.x, cp.y, ['#ff5b5b', '#ffffff'], 20, 2.5); sfx.boom();
          break;
        }
      }
      const r = TYPE[e.type].r;
      if (Math.abs(b.x - e.x) < r && b.y - 6 < e.y + r && b.y + 6 > e.y - r) {
        b.dead = true; hitEnemy(e); break;
      }
    }
  }
  if (!player.alive || player.capture) return;
  const xs = shipXs();
  for (const b of eBullets) {
    xs.forEach((sx, i) => {
      if (!b.dead && Math.abs(b.x - sx) < 9 && Math.abs(b.y - player.y) < 11) { b.dead = true; killPlayer(i); }
    });
  }
  for (const e of enemies) {
    if (e.dead || e.state === 'wait' || e.state === 'form') continue;
    xs.forEach((sx, i) => {
      if (!e.dead && player.alive && Math.abs(e.x - sx) < 20 && Math.abs(e.y - player.y) < 18 && player.invuln <= 0) {
        hitEnemy(e); e.hp = 0; e.dead = true; killPlayer(i);
      }
    });
  }
}

// ── Update ───────────────────────────────────────────────────
function update() {
  game.frame++;
  for (const s of stars) { s.y += s.z * game.starSpeed; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } }
  if (game.state === 'title') return;

  form.t++;
  if (game.waveIdx >= game.waves.length && !enemies.some(e => e.state === 'wait' || e.state === 'path')) {
    form.sway = Math.max(0, form.sway - 0.2);
    form.breathe = Math.min(0.13, form.breathe + 0.002);
  }

  if (game.state === 'play') {
    if (game.spawnTimer > 0) game.spawnTimer--;
    else if (game.waveIdx < game.waves.length) {
      spawnWave(game.waves[game.waveIdx++]);
      game.spawnTimer = game.challenge ? 150 : 165;
    }
    const allIn = game.waveIdx >= game.waves.length && !enemies.some(e => e.state === 'wait' || e.state === 'path');
    if (!game.challenge && allIn && player.alive && !player.capture) {
      if (--game.diveTimer <= 0) {
        startDive();
        const base = Math.max(30, 120 - game.stage * 8);
        game.diveTimer = (enemies.length <= 8 ? base * 0.45 : base) + rand(0, 40);
      }
    }
    if (game.waveIdx >= game.waves.length && enemies.length === 0 && !rescue && !player.capture) {
      game.state = 'stageEnd';
      game.timer = game.challenge ? 240 : 90;
      if (game.challenge) {
        const bonus = game.chHits === 40 ? 10000 : game.chHits * 100;
        addScore(bonus);
        game.chResult = { hits: game.chHits, bonus };
        if (game.chHits === 40) sfx.perfect();
      }
    }
  } else if (game.state === 'stageEnd') {
    if (--game.timer <= 0) { game.chResult = null; nextStage(); }
  }

  updatePlayer();
  enemies.forEach(updateEnemy);
  updateRescue();

  for (const b of pBullets) { b.y -= 9; if (b.y < -10) b.dead = true; }
  for (const b of eBullets) { b.x += b.vx; b.y += b.vy; if (b.y > H + 10 || b.x < -10 || b.x > W + 10) b.dead = true; }
  collide();

  enemies = enemies.filter(e => !e.dead);
  pBullets = pBullets.filter(b => !b.dead);
  eBullets = eBullets.filter(b => !b.dead);
  for (const p of particles) {
    p.life--;
    if (p.ring) p.r += 2.2; else { p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; }
  }
  particles = particles.filter(p => p.life > 0);
  for (const p of popups) { p.life--; p.y -= 0.4; }
  popups = popups.filter(p => p.life > 0);
  if (game.bannerTimer > 0) game.bannerTimer--;

  if (game.overTimer > 0 && --game.overTimer === 0) gameOver();
}

// ── Render ───────────────────────────────────────────────────
function text(str, x, y, size, color, align = 'center') {
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(str, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawBeam(e) {
  const len = beamLength(e);
  if (len <= 0) return;
  const top = e.y + 14, wTop = 8, wBot = 34;
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const y0 = top + len * i / bands, y1 = top + len * (i + 1) / bands;
    const w0 = lerp(wTop, wBot, i / bands), w1 = lerp(wTop, wBot, (i + 1) / bands);
    const phase = (Math.floor(game.frame / 4) + i) % 3;
    ctx.fillStyle = ['rgba(59,240,255,.55)', 'rgba(59,123,255,.45)', 'rgba(192,91,255,.45)'][phase];
    ctx.beginPath();
    ctx.moveTo(e.x - w0, y0); ctx.lineTo(e.x + w0, y0); ctx.lineTo(e.x + w1, y1); ctx.lineTo(e.x - w1, y1);
    ctx.closePath(); ctx.fill();
  }
}

function drawEnemy(e) {
  if (e.state === 'wait') return;
  const f = Math.floor(e.anim / 16) % 2;
  let img;
  if (e.type === 'boss') img = (e.hp < e.maxHp ? SPR.bossHurt : SPR.boss)[f];
  else img = SPR[e.type][f];
  if (e.beam) drawBeam(e);
  if (e.captive) { const cp = captivePos(e); drawSprite(SPR.captive, cp.x, cp.y, e.angle); }
  drawSprite(img, e.x, e.y, e.angle);
}

function drawHUD() {
  text('1UP', 14, 14, 13, '#ff3b3b', 'left');
  text(String(game.score).padStart(6, '0'), 14, 30, 15, '#ffffff', 'left');
  text('RECORDE', W / 2, 14, 13, '#ff3b3b');
  text(String(game.hi).padStart(6, '0'), W / 2, 30, 15, '#ffffff');
  for (let i = 0; i < Math.min(game.lives, 6); i++) {
    ctx.drawImage(SPR.ship, 8 + i * 20, H - 24, SPR.ship.width * 1.2, SPR.ship.height * 1.2);
  }
  const st = game.stage;
  let x = W - 10;
  const big = Math.floor(st / 5), small = st % 5;
  for (let i = 0; i < small; i++) { x -= 8; flag(x, H - 22, 1); }
  for (let i = 0; i < big; i++) { x -= 12; flag(x, H - 22, 2); }
}

function flag(x, y, s) {
  ctx.fillStyle = '#ffd23b'; ctx.fillRect(x, y, 2, 12 * s * 0.7);
  ctx.fillStyle = s > 1 ? '#3b7bff' : '#ff3b3b';
  ctx.fillRect(x + 2, y, 5 * s * 0.8, 5 * s * 0.6);
}

function render() {
  const k = viewScale * dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(game.frame * 0.08 + s.ph);
    if (tw < 0.25) continue;
    ctx.globalAlpha = tw * (s.z / 1.6) + 0.2;
    ctx.fillStyle = s.c;
    ctx.fillRect(s.x, s.y, s.z > 1.2 ? 2 : 1, s.z > 1.2 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  if (game.state === 'title') { drawTitleDemo(); return; }

  enemies.forEach(drawEnemy);

  for (const b of pBullets) {
    ctx.fillStyle = '#3bf0ff'; ctx.fillRect(b.x - 1, b.y - 6, 2, 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x - 1, b.y - 6, 2, 3);
  }
  for (const b of eBullets) {
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(b.x - 1.5, b.y - 4, 3, 8);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x - 0.5, b.y - 2, 1, 4);
  }

  if (player.capture) {
    drawSprite(SPR.ship, player.x, player.y, player.capture.angle || 0);
  } else if (player.alive && (player.invuln <= 0 || Math.floor(game.frame / 4) % 2 === 0)) {
    for (const x of shipXs()) drawSprite(SPR.ship, x, player.y);
  }
  if (rescue) drawSprite(SPR.ship, rescue.x, rescue.y, rescue.angle);

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 15);
    if (p.ring) {
      ctx.strokeStyle = p.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    } else { ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }
  }
  ctx.globalAlpha = 1;
  for (const p of popups) { ctx.globalAlpha = Math.min(1, p.life / 20); text(p.text, p.x, p.y, 12, p.color); }
  ctx.globalAlpha = 1;

  if (game.bannerTimer > 0 && game.state !== 'over') {
    const blink = game.banner === 'PRONTO' ? Math.floor(game.frame / 15) % 2 === 0 : true;
    if (blink) text(game.banner, W / 2, H * 0.55, 22, game.banner.startsWith('FASE') ? '#3bf0ff' : '#ff5b5b');
  }
  if (game.state === 'stageEnd' && game.chResult) {
    const r = game.chResult;
    text('ACERTOS ' + r.hits, W / 2, H * 0.45, 20, '#3bf0ff');
    text(r.hits === 40 ? 'PERFEITO!' : 'BÔNUS', W / 2, H * 0.52, 20, '#ffd23b');
    text(String(r.bonus), W / 2, H * 0.59, 20, '#ffffff');
  }
  if (game.overTimer > 0 && game.lives < 0) text('FIM DE JOGO', W / 2, H * 0.5, 26, '#ff3b3b');
  drawHUD();
}

function drawTitleDemo() {
  const t = game.frame;
  const kinds = [SPR.boss, SPR.wasp, SPR.drone];
  kinds.forEach((spr, i) => {
    const x = W / 2 + Math.sin(t * 0.02 + i * 2.1) * 110;
    const y = 90 + i * 34 + Math.sin(t * 0.05 + i) * 6;
    drawSprite(spr[Math.floor(t / 16) % 2], x, y, Math.PI);
  });
  drawSprite(SPR.ship, W / 2 + Math.sin(t * 0.03) * 60, H - 70);
}

// ── UI wiring ────────────────────────────────────────────────
function refreshSoundBtn() { $('btnSound').textContent = 'Som: ' + (soundOn ? 'Ligado' : 'Desligado'); }
$('btnPlay').onclick = startGame;
$('btnAgain').onclick = startGame;
$('btnHow').onclick = () => showOverlay('howto');
for (const b of document.querySelectorAll('.back')) b.onclick = () => showOverlay('title');
$('btnSound').onclick = () => {
  soundOn = !soundOn;
  localStorage.setItem('starswarm.sound', soundOn ? 'on' : 'off');
  refreshSoundBtn(); ensureAudio(); sfx.shoot();
};
$('btnPause').onclick = () => setPaused(true);
$('btnResume').onclick = () => setPaused(false);
const toTitle = () => {
  game.state = 'title'; game.paused = false;
  enemies = []; pBullets = []; eBullets = []; particles = []; popups = []; rescue = null;
  localStorage.setItem('starswarm.hi', game.hi);
  $('titleHi').textContent = game.hi;
  $('btnPause').classList.remove('show');
  showOverlay('title');
};
$('btnQuit').onclick = toTitle;
$('btnMenu').onclick = toTitle;

// ── Main loop (fixed 60 Hz step) ─────────────────────────────
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= 1000 / 60) {
    if (!game.paused) update();
    acc -= 1000 / 60;
  }
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
refreshSoundBtn();
$('titleHi').textContent = game.hi;
if (location.search.includes('debug')) {
  window.__starSwarm = { game, player, get enemies() { return enemies; }, get rescue() { return rescue; }, beamDive, launchDive, hitEnemy, nextStage };
}
requestAnimationFrame(loop);
})();
