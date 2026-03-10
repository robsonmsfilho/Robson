// ============================================================
//  GALAGA CLONE - HTML5 Canvas
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

// ── Audio ────────────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, vol = 0.15) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) {}
}

function sfxShoot()   { playTone(880, 'square', 0.08, 0.12); }
function sfxExplode() {
  playTone(120, 'sawtooth', 0.25, 0.3);
  setTimeout(() => playTone(80, 'sawtooth', 0.2, 0.25), 60);
}
function sfxEnemyShoot() { playTone(440, 'square', 0.07, 0.08); }
function sfxExtraLife()  { [600,700,800].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.15,0.2),i*120)); }

// ── Stars ────────────────────────────────────────────────────
const STAR_COUNT = 80;
const stars = Array.from({length: STAR_COUNT}, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  speed: 0.3 + Math.random() * 1.2,
  size: Math.random() < 0.2 ? 2 : 1,
  brightness: 0.4 + Math.random() * 0.6
}));

function updateStars() {
  stars.forEach(s => {
    s.y += s.speed;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  });
}

function drawStars() {
  stars.forEach(s => {
    ctx.fillStyle = `rgba(255,255,255,${s.brightness})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  });
}

// ── Constants ────────────────────────────────────────────────
const PLAYER_SPEED   = 4;
const BULLET_SPEED   = 10;
const ENEMY_BULLET_SPEED = 4;
const MAX_PLAYER_BULLETS = 2;
const ENEMY_COLS = 10;
const ENEMY_ROWS = 4;
const CELL_W = 40;
const CELL_H = 36;
const FORMATION_TOP = 60;
const FORMATION_LEFT = (W - ENEMY_COLS * CELL_W) / 2;

// Enemy types: 0=bee, 1=butterfly, 2=boss
const ENEMY_ROWS_TYPE = [2, 1, 1, 0]; // row index → type (rows 0..3 top-to-bottom)
const ENEMY_POINTS = [50, 80, 150];    // points per type
const ENEMY_COLORS = ['#00e5ff', '#ffeb3b', '#f44336'];
const BOSS_COLORS  = ['#f44336', '#ff9800']; // normal / tractor beam

// ── State ────────────────────────────────────────────────────
let state = 'menu'; // menu | playing | gameover | stageClear
let score = 0;
let hiScore = 0;
let lives = 3;
let stage = 1;
let stageTimer = 0;

// Player
const player = { x: W/2, y: H - 60, w: 32, h: 28, invincible: 0 };

// Collections
let playerBullets  = [];
let enemyBullets   = [];
let enemies        = [];
let explosions     = [];
let diveBombers    = [];  // enemies currently dive-bombing
let capturedShip   = null; // { enemy, phase }

// Formation movement
let formDir   = 1;   // 1=right, -1=left
let formX     = 0;   // offset applied to all formation enemies
let formSpeed = 0.5;

// Input
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'menu' && e.code === 'Space') startGame();
  if (state === 'gameover' && e.code === 'Space') { state = 'menu'; }
  if (state === 'stageClear' && e.code === 'Space') nextStage();
  // Prevent page scroll
  if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Enemy shape drawers ──────────────────────────────────────
function drawBee(ctx, x, y, size, color) {
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, size*0.35, size*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  // Wings
  ctx.fillStyle = 'rgba(0,229,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - size*0.5, y - size*0.1, size*0.3, size*0.2, -0.4, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + size*0.5, y - size*0.1, size*0.3, size*0.2, 0.4, 0, Math.PI*2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(x-size*0.15, y-size*0.1, size*0.1, size*0.1);
  ctx.fillRect(x+size*0.05, y-size*0.1, size*0.1, size*0.1);
}

function drawButterfly(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  // Body
  ctx.fillRect(x - size*0.1, y - size*0.45, size*0.2, size*0.9);
  // Upper wings
  ctx.beginPath();
  ctx.moveTo(x, y - size*0.3);
  ctx.bezierCurveTo(x - size*0.8, y - size*0.6, x - size*0.8, y, x, y);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - size*0.3);
  ctx.bezierCurveTo(x + size*0.8, y - size*0.6, x + size*0.8, y, x, y);
  ctx.fill();
  // Lower wings
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - size*0.6, y + size*0.1, x - size*0.5, y + size*0.5, x, y + size*0.45);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + size*0.6, y + size*0.1, x + size*0.5, y + size*0.5, x, y + size*0.45);
  ctx.fill();
}

function drawBoss(ctx, x, y, size, color) {
  // Main body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size*0.45, 0, Math.PI*2);
  ctx.fill();
  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, size*0.6, 0, Math.PI*2);
  ctx.stroke();
  // Claws
  const clawAngles = [-Math.PI*0.3, Math.PI*0.3, Math.PI*0.7, -Math.PI*0.7];
  clawAngles.forEach(a => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.fillRect(-size*0.08, size*0.45, size*0.16, size*0.3);
    ctx.restore();
  });
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - size*0.2, y - size*0.1, size*0.12, size*0.12);
  ctx.fillRect(x + size*0.08, y - size*0.1, size*0.12, size*0.12);
  ctx.fillStyle = '#f00';
  ctx.fillRect(x - size*0.17, y - size*0.07, size*0.06, size*0.06);
  ctx.fillRect(x + size*0.11, y - size*0.07, size*0.06, size*0.06);
}

function drawEnemy(enemy) {
  if (enemy.dead) return;
  const sz = 14;
  ctx.save();
  // Flash when hit
  if (enemy.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(enemy.hitFlash * 2);
  }
  const col = ENEMY_COLORS[enemy.type];
  if (enemy.type === 0) drawBee(ctx, enemy.x, enemy.y, sz, col);
  else if (enemy.type === 1) drawButterfly(ctx, enemy.x, enemy.y, sz, col);
  else drawBoss(ctx, enemy.x, enemy.y, sz, enemy.tractorBeamActive ? BOSS_COLORS[1] : BOSS_COLORS[0]);
  // Boss HP indicator
  if (enemy.type === 2 && enemy.hp === 2) {
    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★', enemy.x, enemy.y - 18);
  }
  ctx.restore();
}

function drawPlayer() {
  if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) return;
  const x = player.x, y = player.y;
  // Engine glow
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(x - 4, y + 14, 8, 4);
  // Body
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x - 14, y + 14);
  ctx.lineTo(x + 14, y + 14);
  ctx.closePath();
  ctx.fill();
  // Cockpit
  ctx.fillStyle = '#b3e5fc';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 5, 8, 0, 0, Math.PI*2);
  ctx.fill();
  // Wing highlights
  ctx.fillStyle = '#0288d1';
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x - 10, y + 10);
  ctx.lineTo(x, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + 10, y + 10);
  ctx.lineTo(x, y + 6);
  ctx.closePath();
  ctx.fill();
  // Cannon
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 2, y - 18, 4, 8);
}

// ── Explosion particles ──────────────────────────────────────
function spawnExplosion(x, y, colorHint) {
  const colors = colorHint
    ? [colorHint, '#fff', '#ffeb3b']
    : ['#ff6d00','#ffea00','#fff','#ef5350'];
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 3;
    explosions.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      size: 1 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function updateExplosions() {
  explosions = explosions.filter(p => p.life > 0);
  explosions.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life--;
  });
}

function drawExplosions() {
  explosions.forEach(p => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ── Build stage ──────────────────────────────────────────────
function buildFormation() {
  enemies = [];
  diveBombers = [];
  for (let row = 0; row < ENEMY_ROWS; row++) {
    for (let col = 0; col < ENEMY_COLS; col++) {
      const type = ENEMY_ROWS_TYPE[row];
      enemies.push({
        row, col,
        type,
        hp: type === 2 ? 2 : 1,
        x: FORMATION_LEFT + col * CELL_W + CELL_W/2,
        y: FORMATION_TOP + row * CELL_H + CELL_H/2,
        baseX: FORMATION_LEFT + col * CELL_W + CELL_W/2,
        baseY: FORMATION_TOP + row * CELL_H + CELL_H/2,
        dead: false,
        diving: false,
        divePhase: 0,
        diveX: 0, diveY: 0,
        diveAngle: 0, diveSpeed: 0,
        diveReturn: false,
        tractorBeamActive: false,
        tractorTimer: 0,
        hitFlash: 0,
        shootCooldown: 0
      });
    }
  }
  formX = 0;
  formDir = 1;
  formSpeed = 0.3 + stage * 0.08;
}

function startGame() {
  score = 0;
  lives = 3;
  stage = 1;
  player.x = W/2;
  player.y = H - 60;
  player.invincible = 0;
  playerBullets = [];
  enemyBullets = [];
  explosions = [];
  capturedShip = null;
  buildFormation();
  state = 'playing';
  stageTimer = 0;
}

function nextStage() {
  stage++;
  player.x = W/2;
  player.invincible = 0;
  playerBullets = [];
  enemyBullets = [];
  explosions = [];
  capturedShip = null;
  buildFormation();
  state = 'playing';
  stageTimer = 0;
}

// ── Shooting ─────────────────────────────────────────────────
let shootCooldown = 0;

function playerShoot() {
  if (shootCooldown > 0) return;
  if (playerBullets.length >= MAX_PLAYER_BULLETS) return;
  playerBullets.push({ x: player.x, y: player.y - 16 });
  sfxShoot();
  shootCooldown = 12;
}

function enemyShoot(enemy) {
  enemyBullets.push({ x: enemy.x, y: enemy.y + 10 });
  sfxEnemyShoot();
}

// ── Dive bombing ─────────────────────────────────────────────
let diveTimer = 0;

function trySpawnDiver() {
  const alive = enemies.filter(e => !e.dead && !e.diving);
  if (alive.length === 0) return;
  // max divers based on stage
  const maxDivers = Math.min(2 + Math.floor(stage / 2), 5);
  if (diveBombers.length >= maxDivers) return;
  if (Math.random() > 0.015 + stage * 0.003) return;

  // pick candidate: prefer non-boss first, or boss randomly
  const candidates = alive.filter(e => e.type !== 2);
  const pool = candidates.length > 0
    ? (Math.random() < 0.8 ? candidates : alive)
    : alive;
  const e = pool[Math.floor(Math.random() * pool.length)];

  e.diving = true;
  e.divePhase = 0;
  e.diveSpeed = 2.5 + stage * 0.2;
  e.diveAngle = Math.atan2(player.y - e.y, player.x - e.x);
  diveBombers.push(e);
}

function updateDivers() {
  diveBombers = diveBombers.filter(e => !e.dead);
  diveBombers.forEach(e => {
    if (e.divePhase === 0) {
      // swoop toward player
      e.x += Math.cos(e.diveAngle) * e.diveSpeed;
      e.y += Math.sin(e.diveAngle) * e.diveSpeed;
      // curve toward player dynamically
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const targetAngle = Math.atan2(dy, dx);
      let diff = targetAngle - e.diveAngle;
      while (diff > Math.PI) diff -= 2*Math.PI;
      while (diff < -Math.PI) diff += 2*Math.PI;
      e.diveAngle += diff * 0.04;
      // Enemy shoots while diving
      if (Math.random() < 0.008 + stage * 0.001) enemyShoot(e);
      // Off screen bottom → return
      if (e.y > H + 20) {
        e.y = -30;
        e.x = e.baseX + formX;
        e.divePhase = 1;
      }
    } else {
      // Return to formation
      const tx = e.baseX + formX;
      const ty = e.baseY;
      const dx = tx - e.x, dy = ty - e.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 4) {
        e.x = tx; e.y = ty;
        e.diving = false;
        e.divePhase = 0;
        diveBombers = diveBombers.filter(d => d !== e);
      } else {
        e.x += (dx/dist) * 3;
        e.y += (dy/dist) * 3;
      }
    }
  });
}

// ── Tractor beam (Boss) ──────────────────────────────────────
// simplified: boss occasionally activates beam; if player under it → life lost
let tractorBeamTimer = 0;
let activeTractorBeam = null;

function updateTractorBeam() {
  if (activeTractorBeam) {
    activeTractorBeam.tractorTimer--;
    if (activeTractorBeam.tractorTimer <= 0) {
      activeTractorBeam.tractorBeamActive = false;
      activeTractorBeam = null;
    }
    return;
  }
  tractorBeamTimer--;
  if (tractorBeamTimer > 0) return;
  tractorBeamTimer = 300 + Math.floor(Math.random() * 300);

  const bosses = enemies.filter(e => !e.dead && !e.diving && e.type === 2);
  if (bosses.length === 0) return;
  const boss = bosses[Math.floor(Math.random() * bosses.length)];
  boss.tractorBeamActive = true;
  boss.tractorTimer = 120;
  activeTractorBeam = boss;
}

function drawTractorBeam() {
  if (!activeTractorBeam || activeTractorBeam.dead) return;
  const b = activeTractorBeam;
  const bx = b.x, by = b.y;
  const beamW = 24;
  const beamH = H - by;
  const alpha = 0.15 + 0.1 * Math.sin(Date.now() / 80);
  const grad = ctx.createLinearGradient(bx, by, bx, H);
  grad.addColorStop(0, `rgba(255,152,0,${alpha*2})`);
  grad.addColorStop(1, `rgba(255,152,0,0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(bx - beamW/2, by, beamW, beamH);

  // check if player caught
  if (Math.abs(player.x - bx) < beamW/2 + 10 && !player.invincible) {
    killPlayer();
  }
}

// ── Formation movement ───────────────────────────────────────
function updateFormation() {
  const alive = enemies.filter(e => !e.dead && !e.diving);
  if (alive.length === 0) return;

  // Speed up as fewer enemies remain
  const speedMult = 1 + (1 - alive.length / (ENEMY_ROWS * ENEMY_COLS)) * 1.5;
  formX += formDir * formSpeed * speedMult;

  // Find bounds
  let minX = Infinity, maxX = -Infinity;
  alive.forEach(e => {
    const ex = e.baseX + formX;
    if (ex - 12 < minX) minX = ex - 12;
    if (ex + 12 > maxX) maxX = ex + 12;
  });

  if (maxX > W - 8) { formDir = -1; }
  if (minX < 8)     { formDir = 1;  }

  alive.forEach(e => {
    e.x = e.baseX + formX;
    e.y = e.baseY;
  });

  // Formation shooting
  alive.forEach(e => {
    e.shootCooldown--;
    if (e.shootCooldown <= 0) {
      e.shootCooldown = 90 + Math.floor(Math.random() * 300) - stage * 8;
      if (Math.random() < 0.3 + stage * 0.04) enemyShoot(e);
    }
  });
}

// ── Collision detection ──────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx+rw));
  const nearY = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx - nearX, dy = cy - nearY;
  return dx*dx + dy*dy < cr*cr;
}

function checkCollisions() {
  // Player bullets vs enemies
  playerBullets = playerBullets.filter(b => {
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 14) {
        e.hp--;
        e.hitFlash = 8;
        if (e.hp <= 0) {
          e.dead = true;
          score += ENEMY_POINTS[e.type] * (e.type === 2 && e.diving ? 2 : 1);
          if (score > hiScore) hiScore = score;
          spawnExplosion(e.x, e.y, ENEMY_COLORS[e.type]);
          sfxExplode();
          diveBombers = diveBombers.filter(d => d !== e);
          if (activeTractorBeam === e) { activeTractorBeam = null; e.tractorBeamActive = false; }
        }
        hit = true;
        break;
      }
    }
    return !hit && b.y > 0;
  });

  // Enemy bullets vs player
  enemyBullets = enemyBullets.filter(b => {
    if (!player.invincible && Math.abs(b.x - player.x) < 14 && Math.abs(b.y - player.y) < 14) {
      killPlayer();
      return false;
    }
    return b.y < H;
  });

  // Diving enemy vs player
  if (!player.invincible) {
    for (const e of diveBombers) {
      if (e.dead) continue;
      if (Math.abs(e.x - player.x) < 20 && Math.abs(e.y - player.y) < 20) {
        killPlayer();
        e.dead = true;
        spawnExplosion(e.x, e.y, ENEMY_COLORS[e.type]);
        sfxExplode();
        break;
      }
    }
  }
}

// ── Kill player ──────────────────────────────────────────────
function killPlayer() {
  lives--;
  spawnExplosion(player.x, player.y, '#4fc3f7');
  sfxExplode();
  if (lives <= 0) {
    state = 'gameover';
    if (score > hiScore) hiScore = score;
  } else {
    player.invincible = 180;
    player.x = W/2;
  }
}

// ── HUD ──────────────────────────────────────────────────────
function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${String(score).padStart(6,'0')}`, 10, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`HI  ${String(hiScore).padStart(6,'0')}`, W - 10, 20);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`STAGE ${stage}`, W/2, 20);

  // Lives (small ships)
  for (let i = 0; i < lives; i++) {
    const lx = 14 + i * 22, ly = H - 12;
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.moveTo(lx, ly - 7);
    ctx.lineTo(lx - 7, ly + 5);
    ctx.lineTo(lx + 7, ly + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Divider line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.lineTo(W, 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, H - 26);
  ctx.lineTo(W, H - 26);
  ctx.stroke();
}

// ── Screens ──────────────────────────────────────────────────
function drawMenu() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f44336';
  ctx.font = 'bold 48px monospace';
  ctx.fillText('GALAGA', W/2, H/2 - 100);

  ctx.fillStyle = '#ffeb3b';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('CLONE', W/2, H/2 - 65);

  ctx.fillStyle = '#aaa';
  ctx.font = '13px monospace';
  ctx.fillText('ARROW KEYS / WASD  →  MOVER', W/2, H/2 + 10);
  ctx.fillText('ESPAÇO  →  ATIRAR', W/2, H/2 + 35);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  const blink = Math.floor(Date.now() / 500) % 2;
  if (blink) ctx.fillText('PRESSIONE ESPAÇO', W/2, H/2 + 90);

  // Hi score
  ctx.fillStyle = '#ff9800';
  ctx.font = '13px monospace';
  ctx.fillText(`HI-SCORE  ${String(hiScore).padStart(6,'0')}`, W/2, H/2 + 130);

  // Draw sample enemies as legend
  const legend = [{type:0,label:'100',col:'#00e5ff'},{type:1,label:'160',col:'#ffeb3b'},{type:2,label:'300',col:'#f44336'}];
  legend.forEach((l, i) => {
    const lx = W/2 - 80 + i * 80;
    const ly = H/2 - 30;
    ctx.save();
    if (l.type === 0) drawBee(ctx, lx, ly, 12, l.col);
    else if (l.type === 1) drawButterfly(ctx, lx, ly, 12, l.col);
    else drawBoss(ctx, lx, ly, 12, l.col);
    ctx.fillStyle = l.col;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(l.label + ' pts', lx, ly + 20);
    ctx.restore();
  });
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f44336';
  ctx.font = 'bold 36px monospace';
  ctx.fillText('GAME OVER', W/2, H/2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.fillText(`PONTUAÇÃO: ${score}`, W/2, H/2 + 10);
  ctx.fillStyle = '#ffeb3b';
  ctx.fillText(`RECORDE: ${hiScore}`, W/2, H/2 + 40);
  const blink = Math.floor(Date.now() / 600) % 2;
  ctx.fillStyle = '#aaa';
  ctx.font = '13px monospace';
  if (blink) ctx.fillText('ESPAÇO → MENU', W/2, H/2 + 90);
}

function drawStageClear() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4caf50';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`FASE ${stage} CONCLUÍDA!`, W/2, H/2 - 30);
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.fillText(`PONTUAÇÃO: ${score}`, W/2, H/2 + 20);
  const blink = Math.floor(Date.now() / 600) % 2;
  ctx.fillStyle = '#aaa';
  if (blink) ctx.fillText('ESPAÇO → PRÓXIMA FASE', W/2, H/2 + 70);
}

// ── Main update ──────────────────────────────────────────────
function update() {
  if (state !== 'playing') return;

  stageTimer++;
  updateStars();

  // Player movement
  const moveLeft  = keys['ArrowLeft']  || keys['KeyA'];
  const moveRight = keys['ArrowRight'] || keys['KeyD'];
  if (moveLeft)  player.x = Math.max(20, player.x - PLAYER_SPEED);
  if (moveRight) player.x = Math.min(W - 20, player.x + PLAYER_SPEED);

  if (player.invincible > 0) player.invincible--;
  if (shootCooldown > 0) shootCooldown--;

  if (keys['Space'] || keys['ArrowUp'] || keys['KeyW']) playerShoot();

  // Move player bullets
  playerBullets.forEach(b => b.y -= BULLET_SPEED);
  playerBullets = playerBullets.filter(b => b.y > -10);

  // Move enemy bullets
  enemyBullets.forEach(b => b.y += ENEMY_BULLET_SPEED);
  enemyBullets = enemyBullets.filter(b => b.y < H + 10);

  // Update enemy hit flash
  enemies.forEach(e => { if (e.hitFlash > 0) e.hitFlash--; });

  updateFormation();
  trySpawnDiver();
  updateDivers();
  updateTractorBeam();
  checkCollisions();
  updateExplosions();

  // Check stage clear
  if (enemies.every(e => e.dead) && diveBombers.length === 0) {
    state = 'stageClear';
  }
}

// ── Draw ─────────────────────────────────────────────────────
function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  drawStars();

  if (state === 'menu') {
    drawMenu();
    return;
  }
  if (state === 'gameover') {
    drawGameOver();
    return;
  }

  // Tractor beam (below everything)
  drawTractorBeam();

  // Enemies
  enemies.forEach(drawEnemy);

  // Player bullets
  playerBullets.forEach(b => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x - 2, b.y, 4, 10);
    ctx.fillStyle = 'rgba(0,229,255,0.6)';
    ctx.fillRect(b.x - 1, b.y + 2, 2, 12);
  });

  // Enemy bullets
  enemyBullets.forEach(b => {
    ctx.fillStyle = '#f44336';
    ctx.fillRect(b.x - 2, b.y, 4, 12);
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(b.x - 1, b.y + 1, 2, 8);
  });

  drawPlayer();
  drawExplosions();
  drawHUD();

  if (state === 'stageClear') drawStageClear();
}

// ── Game loop ─────────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Init
tractorBeamTimer = 400;
loop();
