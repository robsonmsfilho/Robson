(() => {
'use strict';

const W = 432, H = 768;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

const PHYS = {
  gravity: 1500,
  moveSpeed: 150,
  climbSpeed: 130,
  jumpVel: -520,
  maxDt: 1 / 30,
  hammerTime: 7,
  invulnTime: 1.2,
  lives: 3,
  loopSpeedStep: 1.14
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

let audioCtx = null;
function tone(freq, dur, type = 'square', gain = 0.05, slide = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur);
  } catch (e) {}
}
const sfx = {
  jump: () => tone(500, 0.09, 'square', 0.045, 220),
  item: () => tone(880, 0.08, 'triangle', 0.05, 260),
  smash: () => tone(140, 0.09, 'sawtooth', 0.06, -40),
  die: () => tone(180, 0.45, 'square', 0.07, -120),
  clear: () => tone(980, 0.12, 'square', 0.05, 260),
  hop: () => tone(300, 0.06, 'square', 0.03, -60)
};

class Input {
  constructor() {
    this.keys = {};
    this.pressed = {};
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'jump', KeyP: 'pause' };
    addEventListener('keydown', e => {
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
    });
    addEventListener('keyup', e => {
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      this.keys[k] = false;
    });
    document.querySelectorAll('#touch [data-key]').forEach(btn => {
      const k = btn.dataset.key;
      const down = ev => {
        ev.preventDefault();
        if (btn.setPointerCapture) { try { btn.setPointerCapture(ev.pointerId); } catch (e) {} }
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
      };
      const up = ev => { if (ev) ev.preventDefault(); this.keys[k] = false; };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('lostpointercapture', up);
    });
    addEventListener('pointerdown', () => {
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }, { once: true });
  }
  axisX() { return (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0); }
  axisY() { return (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0); }
  wasPressed(k) { return !!this.pressed[k]; }
  endFrame() { this.pressed = {}; }
}

class Girder {
  constructor(id, x1, y1, x2, y2, color) {
    this.id = id; this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
    this.thick = 12;
    this.color = color || '#c0453a';
  }
  get minX() { return Math.min(this.x1, this.x2); }
  get maxX() { return Math.max(this.x1, this.x2); }
  get slope() { return (this.y2 - this.y1) / ((this.x2 - this.x1) || 1); }
  contains(x, margin = 0) { return x >= this.minX - margin && x <= this.maxX + margin; }
  yAt(x) {
    const t = clamp((x - this.x1) / ((this.x2 - this.x1) || 1), 0, 1);
    return this.y1 + (this.y2 - this.y1) * t;
  }
  draw() {
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.thick;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1 - this.thick / 2 + 2);
    ctx.lineTo(this.x2, this.y2 - this.thick / 2 + 2);
    ctx.stroke();
    for (let x = this.minX + 14; x < this.maxX; x += 26) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, this.yAt(x) - this.thick / 2);
      ctx.lineTo(x, this.yAt(x) + this.thick / 2);
      ctx.stroke();
    }
  }
}

class Ladder {
  constructor(x, yTop, yBottom, width = 30) {
    this.x = x; this.yTop = yTop; this.yBottom = yBottom; this.w = width;
  }
  entityAligned(e) {
    const cx = e.x + e.w / 2;
    return Math.abs(cx - this.x) < this.w / 2 + 6 &&
      e.y + e.h > this.yTop - 6 && e.y < this.yBottom + 6;
  }
  draw() {
    ctx.strokeStyle = '#5fc9ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.x - this.w / 2, this.yTop);
    ctx.lineTo(this.x - this.w / 2, this.yBottom);
    ctx.moveTo(this.x + this.w / 2, this.yTop);
    ctx.lineTo(this.x + this.w / 2, this.yBottom);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let y = this.yTop + 10; y < this.yBottom; y += 20) {
      ctx.beginPath();
      ctx.moveTo(this.x - this.w / 2, y);
      ctx.lineTo(this.x + this.w / 2, y);
      ctx.stroke();
    }
  }
}

function nearestAlignedLadder(entity, ladders) {
  const cx = entity.x + entity.w / 2;
  let best = null, bestDist = Infinity;
  for (const l of ladders) {
    if (!l.entityAligned(entity)) continue;
    const d = Math.abs(cx - l.x);
    if (d < bestDist) { bestDist = d; best = l; }
  }
  return best;
}

function girderBelow(x, fromY, girders, maxDrop = 32) {
  let best = null, bestY = Infinity;
  for (const g of girders) {
    if (!g.contains(x, 4)) continue;
    const gy = g.yAt(x);
    if (gy >= fromY - 6 && gy - fromY <= maxDrop && gy < bestY) { best = g; bestY = gy; }
  }
  return best;
}

function snapToGirder(entity, prevBottom, girders) {
  const cx = entity.x + entity.w / 2;
  const bottom = entity.y + entity.h;
  let best = null, bestY = Infinity;
  for (const g of girders) {
    if (!g.contains(cx, entity.w * 0.4)) continue;
    const gy = g.yAt(cx);
    const crossing = prevBottom <= gy + 10 && bottom >= gy - 26 && bottom <= gy + 34;
    const resting = Math.abs(bottom - gy) < 10 && entity.vy >= -10;
    if ((crossing || resting) && gy < bestY) { best = g; bestY = gy; }
  }
  if (best) {
    entity.y = bestY - entity.h;
    entity.vy = 0;
    entity.grounded = true;
    entity.girder = best;
    return best;
  }
  entity.grounded = false;
  entity.girder = null;
  return null;
}

class Player {
  constructor(x, y) {
    this.w = 26; this.h = 38;
    this.startX = x; this.startY = y;
    this.reset();
  }
  reset() {
    this.x = this.startX; this.y = this.startY;
    this.vx = 0; this.vy = 0;
    this.grounded = false; this.girder = null;
    this.onLadder = false;
    this.facing = 1;
    this.hammer = 0;
    this.invuln = PHYS.invulnTime;
    this.walkPhase = 0;
    this.alive = true;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt, input, stage) {
    this.hammer = Math.max(0, this.hammer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const prevBottom = this.y + this.h;
    const ax = input.axisX(), ay = input.axisY();
    if (ax) this.facing = ax;

    const ladder = nearestAlignedLadder(this, stage.ladders);
    const wantsClimb = ladder && (this.onLadder || ay !== 0);

    if (wantsClimb) {
      this.onLadder = true;
      this.walkPhase += dt * 10;
      this.vy = ay * PHYS.climbSpeed;
      this.vx = ax * PHYS.moveSpeed * 0.5;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.x = clamp(this.x, ladder.x - this.w / 2 - 10, ladder.x - this.w / 2 + 10);
      this.grounded = false;
      if (ay > 0 && this.y + this.h >= ladder.yBottom) {
        this.y = ladder.yBottom - this.h;
        this.exitLadder(stage, ladder.x, ladder.yBottom);
      } else if (ay < 0 && this.y <= ladder.yTop) {
        this.y = ladder.yTop - this.h;
        this.exitLadder(stage, ladder.x, ladder.yTop);
      } else if (this.hammer <= 0 && input.wasPressed('jump')) {
        this.onLadder = false;
        this.vy = PHYS.jumpVel * 0.8;
        sfx.jump();
      }
    } else {
      this.onLadder = false;
      this.walkPhase += dt * (this.grounded ? 10 : 4);
      this.vx = ax * PHYS.moveSpeed + (this.grounded && this.girder ? this.girder.slope * 40 : 0);
      if (this.hammer <= 0 && this.grounded && input.wasPressed('jump')) {
        this.vy = PHYS.jumpVel;
        this.grounded = false;
        sfx.jump();
      }
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      snapToGirder(this, prevBottom, stage.girders);
    }

    this.x = clamp(this.x, 6, W - this.w - 6);
    if (this.y > H + 100) stage.game.onPlayerDeath();
  }
  exitLadder(stage, x, y) {
    this.onLadder = false;
    this.vy = 0;
    const g = stage.girders.find(gg => gg.contains(x, 4) && Math.abs(gg.yAt(x) - y) < 3);
    if (g) { this.grounded = true; this.girder = g; }
  }
  draw() {
    if (this.invuln > 0 && Math.floor(this.invuln * 16) % 2 === 0) return;
    const x = this.x, y = this.y;
    const bob = this.onLadder ? Math.sin(this.walkPhase) * 3 : 0;
    const skin = '#f2b98d';
    const suit = this.hammer > 0 ? '#ffd23f' : '#e8452c';
    ctx.fillStyle = '#3a2413';
    ctx.fillRect(x + 6, y, 14, 8);
    ctx.fillStyle = skin;
    ctx.fillRect(x + 7, y + 6, 12, 11);
    ctx.fillStyle = suit;
    ctx.fillRect(x + 3, y + 16, 20, 15);
    ctx.fillStyle = '#274b8f';
    ctx.fillRect(x + 2, y + 29, 9, 9);
    ctx.fillRect(x + 15, y + 29, 9, 9);
    ctx.fillStyle = skin;
    const swing = Math.sin(this.walkPhase) * (this.grounded || this.onLadder ? 6 : 0);
    ctx.fillRect(x + (this.facing >= 0 ? 21 : -3), y + 17 + bob, 6, 12 + swing * 0.2);
    ctx.fillRect(x + (this.facing >= 0 ? -3 : 21), y + 17 - bob, 6, 12 - swing * 0.2);
    if (this.hammer > 0) {
      const hx = x + (this.facing >= 0 ? 24 : -18);
      const hy = y + 4 + Math.sin(this.walkPhase * 2) * 5;
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(hx + 6, hy + 6, 5, 22);
      ctx.fillStyle = '#d7d7d7';
      ctx.fillRect(hx, hy, 18, 8);
    }
  }
}

class Ape {
  constructor(x, y) { this.x = x; this.y = y; this.w = 78; this.h = 58; this.t = 0; this.gone = false; this.fallY = 0; }
  update(dt) { this.t += dt; if (this.falling) { this.fallY += 900 * dt * dt; this.y += this.fallY * dt; if (this.y > H + 100) this.gone = true; } }
  drop() { this.falling = true; }
  draw() {
    if (this.gone) return;
    const x = this.x, y = this.y, arm = Math.sin(this.t * 5) * 6;
    ctx.fillStyle = '#5b3a22';
    ctx.fillRect(x + 16, y + 6, 46, 42);
    ctx.fillRect(x + 10, y - 2, 58, 26);
    ctx.fillStyle = '#3a2314';
    ctx.fillRect(x - 2, y + 22 + arm, 18, 26);
    ctx.fillRect(x + 62, y + 22 - arm, 18, 26);
    ctx.fillRect(x + 24, y + 46, 15, 12);
    ctx.fillRect(x + 42, y + 46, 15, 12);
    ctx.fillStyle = '#f2d9a0';
    ctx.fillRect(x + 24, y + 8, 32, 12);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + 27, y + 12, 4, 4);
    ctx.fillRect(x + 49, y + 12, 4, 4);
  }
}

class Princess {
  constructor(x, y) { this.x = x; this.y = y; this.w = 24; this.h = 40; this.t = Math.random() * 6; }
  update(dt) { this.t += dt; }
  draw() {
    const y = this.y + Math.sin(this.t * 4) * 2, x = this.x;
    ctx.fillStyle = '#f2c6a0';
    ctx.fillRect(x + 6, y, 12, 11);
    ctx.fillStyle = '#ff6fb0';
    ctx.fillRect(x + 3, y + 11, 18, 22);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(x + 4, y - 3, 16, 6);
    ctx.fillStyle = '#ffb9dc';
    ctx.fillRect(x, y + 32, 24, 6);
  }
}

class Barrel {
  constructor(x, y, dir, speed) {
    this.x = x; this.y = y; this.w = 22; this.h = 22;
    this.vx = dir * speed; this.vy = 0;
    this.speed = speed;
    this.dead = false; this.scored = false;
    this.girder = null; this.dropLadder = null;
    this.spin = 0; this.lastLadderKey = '';
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt, stage) {
    this.spin += dt * 10;
    if (this.dropLadder) {
      this.y += this.speed * 1.1 * dt;
      this.x = this.dropLadder.x - this.w / 2;
      if (this.y + this.h >= this.dropLadder.yBottom - 4) {
        this.dropLadder = null;
        this.vx = (Math.random() < 0.5 ? -1 : 1) * this.speed;
      }
    } else {
      const cx = this.x + this.w / 2;
      const g = girderBelow(cx, this.y + this.h, stage.girders, 30);
      if (g) {
        this.y = g.yAt(cx) - this.h;
        this.vx = (g.slope >= 0 ? 1 : -1) * this.speed;
        this.x += this.vx * dt;
        for (const l of stage.ladders) {
          const key = l.x + '-' + l.yTop;
          if (Math.abs(cx - l.x) < 14 && Math.abs(this.y + this.h - l.yTop) < 30 && this.lastLadderKey !== key) {
            this.lastLadderKey = key;
            if (Math.random() < stage.def.ladderDropChance) this.dropLadder = l;
          }
        }
      } else {
        this.vy += PHYS.gravity * 0.85 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }
    }
    if (this.x < -60 || this.x > W + 60 || this.y > H + 80) this.dead = true;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x + 11, this.y + 11);
    ctx.rotate(this.spin);
    ctx.fillStyle = '#a9662f';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = '#dba25a';
    ctx.fillRect(-11, -7, 22, 4);
    ctx.fillRect(-11, 4, 22, 4);
    ctx.fillStyle = '#6e3f1a';
    ctx.fillRect(-2, -11, 4, 22);
    ctx.restore();
  }
}

class Fireball {
  constructor(girderId, x, dir, speed) {
    this.girderId = girderId; this.x = x; this.y = 0; this.w = 24; this.h = 26;
    this.dir = dir; this.speed = speed; this.dead = false; this.scored = false; this.t = Math.random() * 8;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt, stage) {
    this.t += dt;
    const g = stage.girders.find(gg => gg.id === this.girderId);
    if (!g) return;
    this.x += this.dir * this.speed * dt;
    if (!g.contains(this.x + this.w / 2, -6)) {
      this.dir *= -1;
      this.x = clamp(this.x, g.minX + 4, g.maxX - this.w - 4);
    }
    this.y = g.yAt(this.x + this.w / 2) - this.h;
    if (Math.random() < 0.003) this.dir *= -1;
  }
  draw() {
    const flick = Math.sin(this.t * 16) > 0;
    const x = this.x, y = this.y;
    ctx.fillStyle = '#ff8a1e';
    ctx.fillRect(x + 4, y + 6, 16, 20);
    ctx.fillStyle = flick ? '#fff35a' : '#ffd25a';
    ctx.fillRect(x + 8, y + (flick ? 2 : 6), 8, 12);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x + 6, y + 12, 3, 3);
    ctx.fillRect(x + 15, y + 12, 3, 3);
  }
}

class Rivet {
  constructor(x, y) { this.x = x; this.y = y; this.w = 20; this.h = 14; this.dead = false; }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  draw() {
    if (this.dead) return;
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a5730a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Pickup {
  constructor(x, y, kind, value) {
    this.x = x; this.y = y; this.kind = kind; this.value = value || 0;
    this.w = kind === 'hammer' ? 30 : 22; this.h = kind === 'hammer' ? 32 : 22;
    this.dead = false; this.t = Math.random() * 6;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  draw() {
    if (this.dead) return;
    const y = this.y + Math.sin(this.t * 4) * 2;
    this.t += 0.02;
    if (this.kind === 'hammer') {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(this.x + 2, y + 4, 26, 10);
      ctx.fillStyle = '#7a4c22';
      ctx.fillRect(this.x + 11, y + 14, 8, 18);
    } else {
      ctx.fillStyle = '#ff5f6d';
      ctx.fillRect(this.x + 3, y + 2, 16, 16);
      ctx.fillStyle = '#3fae5c';
      ctx.fillRect(this.x + 8, y - 2, 6, 6);
    }
  }
}

function buildStageLayout(def) {
  const girders = def.girders.map(g => new Girder(g[0], g[1], g[2], g[3], g[4], def.girderColor));
  const byId = Object.fromEntries(girders.map(g => [g.id, g]));
  const ladders = def.ladders.map(l => {
    const [x, belowId, aboveId] = l;
    const below = byId[belowId], above = byId[aboveId];
    return new Ladder(x, above.yAt(x), below.yAt(x));
  });
  return { girders, ladders, byId };
}

const STAGES = [
  {
    name: '25m - BARRIS', kind: 'reach', color: '#101a3e',
    girderColor: '#c0453a',
    apeAt: [190, 168], princessAt: [300, 176],
    start: [40, 668],
    girders: [
      ['ground', 24, 706, 408, 706],
      ['p1', 24, 654, 408, 612],
      ['p2', 24, 494, 408, 536],
      ['p3', 24, 460, 408, 418],
      ['p4', 24, 300, 408, 342],
      ['top', 150, 224, 330, 224]
    ],
    ladders: [
      [100, 'ground', 'p1'], [320, 'ground', 'p1'],
      [80, 'p1', 'p2'], [360, 'p1', 'p2'],
      [140, 'p2', 'p3'], [300, 'p2', 'p3'],
      [90, 'p3', 'p4'], [340, 'p3', 'p4'],
      [210, 'p4', 'top'], [270, 'p4', 'top']
    ],
    barrelSpawn: { x: 200, y: 220, interval: 2.2, speed: 100 },
    ladderDropChance: 0.22,
    fires: [],
    pickups: [[70, 470, 'hammer'], [360, 260, 'hammer'], [230, 630, 'fruit', 500], [60, 380, 'fruit', 300]],
    rivets: []
  },
  {
    name: '50m - CHAMAS', kind: 'reach', color: '#151a43',
    girderColor: '#3f7fbf',
    apeAt: [220, 168], princessAt: [90, 176],
    start: [390, 668],
    girders: [
      ['ground', 24, 706, 408, 706],
      ['p1', 24, 612, 408, 654],
      ['p2', 24, 536, 408, 494],
      ['p3', 24, 418, 408, 460],
      ['p4', 24, 342, 408, 300],
      ['top', 100, 224, 300, 224]
    ],
    ladders: [
      [110, 'ground', 'p1'], [330, 'ground', 'p1'],
      [70, 'p1', 'p2'], [350, 'p1', 'p2'],
      [150, 'p2', 'p3'], [310, 'p2', 'p3'],
      [80, 'p3', 'p4'], [330, 'p3', 'p4'],
      [160, 'p4', 'top'], [240, 'p4', 'top']
    ],
    barrelSpawn: { x: 200, y: 220, interval: 2.1, speed: 108 },
    ladderDropChance: 0.2,
    fires: [['p2', 60, 1, 62], ['p3', 380, -1, 68]],
    pickups: [[300, 566, 'hammer'], [50, 260, 'hammer'], [340, 630, 'fruit', 500], [70, 400, 'fruit', 400]],
    rivets: []
  },
  {
    name: '100m - REBITES', kind: 'rivets', color: '#1b1335',
    girderColor: '#5aa06a',
    apeAt: [190, 168], princessAt: [300, 176],
    start: [40, 668],
    girders: [
      ['ground', 24, 706, 408, 706],
      ['p1', 24, 612, 408, 654],
      ['p2', 24, 536, 408, 494],
      ['p3', 24, 418, 408, 460],
      ['top', 100, 224, 300, 224]
    ],
    ladders: [
      [110, 'ground', 'p1'], [330, 'ground', 'p1'],
      [70, 'p1', 'p2'], [350, 'p1', 'p2'],
      [150, 'p2', 'p3'], [310, 'p2', 'p3'],
      [200, 'p3', 'top']
    ],
    barrelSpawn: null,
    ladderDropChance: 0,
    fires: [['p1', 60, 1, 58], ['p3', 300, -1, 56]],
    pickups: [[200, 260, 'hammer'], [340, 674, 'fruit', 500], [60, 400, 'fruit', 500]],
    rivets: [[90, 700], [330, 700], [100, 620], [340, 647], [110, 527], [330, 503], [90, 425], [320, 450]]
  }
];

class Stage {
  constructor(game) { this.game = game; }
  load(index, loop) {
    this.index = index;
    this.def = STAGES[index];
    this.diff = Math.pow(PHYS.loopSpeedStep, loop - 1);
    const built = buildStageLayout(this.def);
    this.girders = built.girders;
    this.ladders = built.ladders;
    this.ape = new Ape(...this.def.apeAt);
    this.princess = new Princess(...this.def.princessAt);
    this.barrels = [];
    this.fireballs = this.def.fires.map(f => new Fireball(f[0], f[1], f[2], f[3] * this.diff));
    this.rivets = this.def.rivets.map(r => new Rivet(r[0], r[1]));
    this.pickups = this.def.pickups.map(p => new Pickup(p[0], p[1], p[2], p[3]));
    this.barrelTimer = 0.6;
    this.clearBonus = 5000;
    this.bossFallTimer = 0;
  }
  girderAt(cx) { return this.girders.find(g => g.contains(cx)); }
  update(dt) {
    this.clearBonus = Math.max(0, this.clearBonus - dt * 90);
    this.ape.update(dt);
    this.princess.update(dt);
    this.fireballs.forEach(f => f.update(dt, this));
    if (this.def.barrelSpawn) {
      this.barrelTimer -= dt;
      if (this.barrelTimer <= 0) {
        const s = this.def.barrelSpawn;
        this.barrels.push(new Barrel(s.x, s.y, 1, s.speed * this.diff));
        this.barrelTimer = Math.max(0.75, s.interval / this.diff);
        sfx.hop();
      }
    }
    this.barrels.forEach(b => b.update(dt, this));
    this.barrels = this.barrels.filter(b => !b.dead);
    this.checkCollisions();
    this.checkObjective(dt);
  }
  checkCollisions() {
    const p = this.game.player;
    if (!p || !p.alive) return;
    const pr = p.rect();
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      if (overlap(pr, pk.rect())) {
        pk.dead = true;
        sfx.item();
        if (pk.kind === 'hammer') { p.hammer = PHYS.hammerTime; this.game.score += 300; }
        else this.game.score += pk.value;
      }
    }
    for (const r of this.rivets) {
      if (r.dead) continue;
      if (overlap(pr, r.rect())) { r.dead = true; this.game.score += 100; sfx.item(); }
    }
    const hazards = [...this.barrels, ...this.fireballs];
    for (const h of hazards) {
      const hr = h.rect();
      if (!h.scored && p.vy > 60 && p.y + p.h < hr.y + 6 &&
        overlap({ x: p.x - 10, y: p.y - 10, w: p.w + 20, h: p.h + 20 }, { x: hr.x - 6, y: hr.y - 6, w: hr.w + 12, h: hr.h + 12 })) {
        h.scored = true;
        this.game.score += 100;
      }
      if (overlap(pr, hr)) {
        if (p.hammer > 0) {
          h.dead = true;
          this.game.score += 500;
          sfx.smash();
        } else if (p.invuln <= 0) {
          this.game.onPlayerDeath();
          return;
        }
      }
    }
  }
  checkObjective(dt) {
    const g = this.game, p = g.player;
    if (g.state !== 'play' || !p) return;
    if (this.def.kind === 'reach') {
      const target = { x: this.princess.x - 10, y: this.princess.y - 10, w: this.princess.w + 20, h: this.princess.h + 20 };
      if (overlap(p.rect(), target)) g.onStageClear();
    } else if (this.def.kind === 'rivets') {
      if (this.rivets.length && this.rivets.every(r => r.dead)) {
        if (!this.ape.falling) { this.ape.drop(); this.bossFallTimer = 1.1; sfx.smash(); }
        else {
          this.bossFallTimer -= dt;
          if (this.bossFallTimer <= 0) g.onStageClear();
        }
      }
    }
  }
  draw() {
    ctx.fillStyle = this.def.color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 20; x < W; x += 44) ctx.fillRect(x, 60, 2, H - 70);
    this.ladders.forEach(l => l.draw());
    this.girders.forEach(g => g.draw());
    this.rivets.forEach(r => r.draw());
    this.pickups.forEach(pk => pk.draw());
    this.ape.draw();
    this.princess.draw();
    this.barrels.forEach(b => b.draw());
    this.fireballs.forEach(f => f.draw());
  }
}

class Game {
  constructor() {
    this.input = new Input();
    this.stage = new Stage(this);
    this.state = 'menu';
    this.score = 0;
    this.lives = PHYS.lives;
    this.loop = 1;
    this.player = null;
    this.lastTime = 0;
    this.deathTimer = 0;
    this.transitionTimer = 0;
    this.transitionMsg = '';
    this.nextStageIndex = 0;
    this.bindUI();
    requestAnimationFrame(t => this.frame(t));
  }
  bindUI() {
    const show = id => {
      document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show'));
      if (id) document.getElementById(id).classList.add('show');
    };
    document.getElementById('btnPlay').onclick = () => this.startGame();
    document.getElementById('btnAgain').onclick = () => this.startGame();
    document.getElementById('btnMenu').onclick = () => { this.state = 'menu'; show('menu'); };
    document.getElementById('btnHow').onclick = () => show('howto');
    document.getElementById('btnCredits').onclick = () => show('credits');
    document.querySelectorAll('.back').forEach(b => b.onclick = () => show('menu'));
    document.getElementById('btnPause').onclick = () => this.togglePause();
    this.showOverlay = show;
  }
  togglePause() {
    if (this.state === 'play') this.state = 'pause';
    else if (this.state === 'pause') this.state = 'play';
  }
  startGame() {
    this.score = 0;
    this.lives = PHYS.lives;
    this.loop = 1;
    this.state = 'play';
    this.stage.load(0, this.loop);
    this.player = new Player(...this.stage.def.start);
    this.showOverlay(null);
  }
  onPlayerDeath() {
    if (this.state !== 'play') return;
    this.lives--;
    this.state = 'die';
    this.deathTimer = 1.3;
    this.player.alive = false;
    this.player.vy = -260;
    sfx.die();
  }
  onStageClear() {
    if (this.state !== 'play') return;
    this.score += Math.ceil(this.stage.clearBonus / 10) * 10;
    sfx.clear();
    let next = this.stage.index + 1;
    if (next >= STAGES.length) {
      next = 0;
      this.loop++;
      this.transitionMsg = 'CICLO COMPLETO - CICLO ' + this.loop;
    } else {
      this.transitionMsg = 'FASE ' + (next + 1) + ': ' + STAGES[next].name;
    }
    this.nextStageIndex = next;
    this.state = 'trans';
    this.transitionTimer = 2.0;
  }
  update(dt) {
    if (this.input.wasPressed('pause')) this.togglePause();
    if (this.state === 'play') {
      this.stage.update(dt);
      this.player.update(dt, this.input, this.stage);
    } else if (this.state === 'die') {
      this.deathTimer -= dt;
      this.player.vy += PHYS.gravity * dt;
      this.player.y += this.player.vy * dt;
      if (this.deathTimer <= 0) {
        if (this.lives <= 0) {
          this.state = 'over';
          document.getElementById('finalScore').textContent = 'Pontuacao: ' + this.score;
          this.showOverlay('gameover');
        } else {
          this.stage.load(this.stage.index, this.loop);
          this.player = new Player(...this.stage.def.start);
          this.state = 'play';
        }
      }
    } else if (this.state === 'trans') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this.stage.load(this.nextStageIndex, this.loop);
        this.player = new Player(...this.stage.def.start);
        this.state = 'play';
      }
    }
    this.input.endFrame();
    this.updateHud();
  }
  updateHud() {
    if (this.state === 'menu' || this.stage.index === undefined) {
      document.getElementById('hudScore').textContent = '';
      document.getElementById('hudLives').textContent = '';
      document.getElementById('hudStage').textContent = '';
      document.getElementById('hudLoop').textContent = '';
      return;
    }
    document.getElementById('hudScore').textContent = 'PONTOS ' + String(this.score).padStart(6, '0');
    document.getElementById('hudLives').textContent = 'VIDAS ' + Math.max(0, this.lives);
    document.getElementById('hudStage').textContent = 'FASE ' + (this.stage.index + 1);
    document.getElementById('hudLoop').textContent = 'CICLO ' + this.loop;
  }
  draw() {
    ctx.clearRect(0, 0, W, H);
    if (this.state === 'menu') { ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H); return; }
    this.stage.draw();
    if (this.player) this.player.draw();
    if (this.state === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffb703';
      ctx.font = '32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSADO', W / 2, H / 2);
    }
    if (this.state === 'trans') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffb703';
      ctx.font = '22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.transitionMsg, W / 2, H / 2);
    }
  }
  frame(t) {
    const dt = Math.min(PHYS.maxDt, (t - this.lastTime) / 1000 || 0);
    this.lastTime = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame(q => this.frame(q));
  }
}

window.__apeClimbGame = new Game();
})();
