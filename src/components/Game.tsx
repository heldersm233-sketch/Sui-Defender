"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Player & Leaderboard Types ───────────────────────────────────────────────
interface PlayerScore {
  name: string;
  score: number;
  date: string;
}

interface LeaderboardData {
  players: PlayerScore[];
}

const LEADERBOARD_KEY = "dogSuiDefenderLeaderboard";
const PLAYER_NAME_KEY = "dogSuiDefenderPlayerName";

function loadLeaderboard(): LeaderboardData {
  if (typeof window === "undefined") return { players: [] };
  try {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // ignore
  }
  return { players: [] };
}

function saveLeaderboard(data: LeaderboardData): void {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function addScoreToLeaderboard(name: string, score: number): void {
  const data = loadLeaderboard();
  const newScore: PlayerScore = {
    name,
    score,
    date: new Date().toLocaleDateString("pt-BR"),
  };
  data.players.push(newScore);
  // Sort by score descending, keep top 10
  data.players.sort((a, b) => b.score - a.score);
  data.players = data.players.slice(0, 10);
  saveLeaderboard(data);
}

function getTopPlayers(): PlayerScore[] {
  return loadLeaderboard().players.slice(0, 5);
}

function loadPlayerName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || "";
  } catch {
    return "";
  }
}

function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // ignore
  }
}

const WIDTH = 900;
const HEIGHT = 650;
const SUI_RADIUS = 55;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const FPS = 60;
const HOLD_THRESHOLD_MS = 2000; // 2 seconds hold = strong wave

// Crypto coin colors
const COIN_COLORS: Record<string, { primary: string; secondary: string; text: string; glow: string; bg: string }> = {
  BTC: {
    primary: "#F7931A",
    secondary: "#E8820C",
    text: "#7a3a00",
    glow: "#F7931A",
    bg: "rgba(247,147,26,0.18)",
  },
  ETH: {
    primary: "#627EEA",
    secondary: "#3C5DD6",
    text: "#ffffff",
    glow: "#627EEA",
    bg: "rgba(98,126,234,0.18)",
  },
  SOL: {
    primary: "#9945FF",
    secondary: "#14F195",
    text: "#ffffff",
    glow: "#9945FF",
    bg: "rgba(153,69,255,0.18)",
  },
  PEPE: {
    primary: "#00A86B",
    secondary: "#008050",
    text: "#ffffff",
    glow: "#00A86B",
    bg: "rgba(0,168,107,0.18)",
  },
  // Phase 2 meme coins
  DOGE: {
    primary: "#C2A633",
    secondary: "#9E8A2A",
    text: "#ffffff",
    glow: "#C2A633",
    bg: "rgba(194,166,51,0.18)",
  },
  SHIB: {
    primary: "#FFA409",
    secondary: "#CC8200",
    text: "#ffffff",
    glow: "#FFA409",
    bg: "rgba(255,164,9,0.18)",
  },
  BONK: {
    primary: "#FF6B35",
    secondary: "#CC5529",
    text: "#ffffff",
    glow: "#FF6B35",
    bg: "rgba(255,107,53,0.18)",
  },
  WIF: {
    primary: "#A855F7",
    secondary: "#7C3AED",
    text: "#ffffff",
    glow: "#A855F7",
    bg: "rgba(168,85,247,0.18)",
  },
};

// Phase 1 coins
const COIN_TYPES_PHASE1 = ["BTC", "ETH", "SOL", "PEPE"] as const;
// Phase 2 coins (meme coins - faster and more aggressive)
const COIN_TYPES_PHASE2 = ["DOGE", "SHIB", "BONK", "WIF"] as const;
type CoinTypePhase1 = (typeof COIN_TYPES_PHASE1)[number];
type CoinTypePhase2 = (typeof COIN_TYPES_PHASE2)[number];
type CoinType = CoinTypePhase1 | CoinTypePhase2;

// Attack wave — originates from where the player clicks
interface Wave {
  id: number;
  x: number; // origin X
  y: number; // origin Y
  radius: number;
  maxRadius: number;
  alpha: number;
  strong: boolean; // true = strong (30 SUI), false = simple (10 SUI)
}

interface Meteor {
  id: number;
  type: CoinType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotSpeed: number;
  hp: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
  maxLife: number;
  color?: string;
}

// Power-up types
type PowerUpType = "shield" | "speed" | "multiplier" | "heal";
interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  radius: number;
  pulse: number;
}

interface ActivePowerUp {
  type: PowerUpType;
  duration: number; // remaining time in frames
}

// Boss types for each phase
type BossType = "PEPE_KING" | "BONK_BOSS";

// Boss projectile - attacks fired by bosses
interface BossProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  damage: number;
}

// Boss enemy - different boss for each phase
interface Boss {
  id: number;
  type: BossType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  rotation: number;
  rotSpeed: number;
  attackTimer: number;
  phase: number; // boss attack phase
}

interface GameState {
  score: number;
  highScore: number;
  hp: number; // 0–100
  meteors: Meteor[];
  particles: Particle[];
  scorePopups: ScorePopup[];
  waves: Wave[];
  powerUps: PowerUp[];
  activePowerUps: ActivePowerUp[];
  mouseX: number;
  mouseY: number;
  bgFlash: { color: string; alpha: number } | null;
  stars: { x: number; y: number; r: number; brightness: number; twinkle: number }[];
  nextMeteorId: number;
  nextWaveId: number;
  nextPowerUpId: number;
  spawnTimer: number;
  spawnInterval: number;
  powerUpTimer: number;
  gameOver: boolean;
  suiPulse: number;
  suiShake: { x: number; y: number; timer: number };
  screenShake: { x: number; y: number; timer: number };
  paused: boolean;
  combo: number;
  comboTimer: number;
  // Hold-to-charge state
  mouseDownTime: number | null; // timestamp when mouse was pressed
  chargeProgress: number; // 0–1 visual charge indicator
  // Phase system
  currentPhase: 1 | 2;
  boss: Boss | null;
  bossDefeated: boolean;
  bossProjectiles: BossProjectile[];
}

// ─── Web Audio ────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
let musicNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let musicRunning = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

// Upbeat chiptune-style music — energetic arpeggio + bass + drums
let musicIntervals: ReturnType<typeof setInterval>[] = [];

async function startMusic() {
  if (musicRunning) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Driving bass line — pumping 8th notes
    const bassNotes = [110, 110, 138.6, 110, 146.8, 110, 138.6, 123.5];
    let bassIdx = 0;
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.connect(bassGain);
    bassGain.connect(ctx.destination);
    bassOsc.type = "sawtooth";
    bassOsc.frequency.value = bassNotes[0];
    bassGain.gain.value = 0.06;
    bassOsc.start();
    musicNodes.push({ osc: bassOsc, gain: bassGain });

    const bassInterval = setInterval(() => {
      if (!musicRunning) { clearInterval(bassInterval); return; }
      bassIdx = (bassIdx + 1) % bassNotes.length;
      bassOsc.frequency.setValueAtTime(bassNotes[bassIdx], ctx.currentTime);
      // Pump effect: quick volume swell
      bassGain.gain.setValueAtTime(0.09, ctx.currentTime);
      bassGain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.1);
    }, 150);
    musicIntervals.push(bassInterval);

    // Lead melody arpeggio — fast and energetic
    const melodyNotes = [
      440, 523.3, 659.3, 880,
      659.3, 523.3, 440, 392,
      440, 523.3, 587.3, 698.5,
      587.3, 523.3, 440, 349.2,
    ];
    let melIdx = 0;
    const melOsc = ctx.createOscillator();
    const melGain = ctx.createGain();
    melOsc.connect(melGain);
    melGain.connect(ctx.destination);
    melOsc.type = "square";
    melOsc.frequency.value = melodyNotes[0];
    melGain.gain.value = 0.025;
    melOsc.start();
    musicNodes.push({ osc: melOsc, gain: melGain });

    const melInterval = setInterval(() => {
      if (!musicRunning) { clearInterval(melInterval); return; }
      melIdx = (melIdx + 1) % melodyNotes.length;
      melOsc.frequency.setValueAtTime(melodyNotes[melIdx], ctx.currentTime);
      melGain.gain.setValueAtTime(0.035, ctx.currentTime);
      melGain.gain.exponentialRampToValueAtTime(0.018, ctx.currentTime + 0.08);
    }, 120);
    musicIntervals.push(melInterval);

    // Counter-melody — harmony notes
    const harmNotes = [
      330, 392, 494, 659.3,
      494, 392, 330, 293.7,
      330, 392, 440, 523.3,
      440, 392, 330, 261.6,
    ];
    let harmIdx = 0;
    const harmOsc = ctx.createOscillator();
    const harmGain = ctx.createGain();
    harmOsc.connect(harmGain);
    harmGain.connect(ctx.destination);
    harmOsc.type = "triangle";
    harmOsc.frequency.value = harmNotes[0];
    harmGain.gain.value = 0.018;
    harmOsc.start();
    musicNodes.push({ osc: harmOsc, gain: harmGain });

    const harmInterval = setInterval(() => {
      if (!musicRunning) { clearInterval(harmInterval); return; }
      harmIdx = (harmIdx + 1) % harmNotes.length;
      harmOsc.frequency.setValueAtTime(harmNotes[harmIdx], ctx.currentTime);
    }, 240);
    musicIntervals.push(harmInterval);

    // Hi-hat percussion — rapid ticking
    const hihatInterval = setInterval(() => {
      if (!musicRunning) { clearInterval(hihatInterval); return; }
      try {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = buf;
        filt.type = "highpass";
        filt.frequency.value = 8000;
        src.connect(filt);
        filt.connect(g);
        g.connect(ctx.destination);
        g.gain.value = 0.04;
        src.start();
      } catch {}
    }, 150);
    musicIntervals.push(hihatInterval);

    // Kick drum — every beat
    const kickInterval = setInterval(() => {
      if (!musicRunning) { clearInterval(kickInterval); return; }
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
        g.gain.setValueAtTime(0.5, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } catch {}
    }, 300);
    musicIntervals.push(kickInterval);

    musicRunning = true;
  } catch {}
}

function stopMusic() {
  musicRunning = false;
  for (const id of musicIntervals) clearInterval(id);
  musicIntervals = [];
  for (const { osc, gain } of musicNodes) {
    try {
      gain.gain.setTargetAtTime(0, audioCtx!.currentTime, 0.1);
      osc.stop(audioCtx!.currentTime + 0.2);
    } catch {}
  }
  musicNodes = [];
}

function pauseMusic() {
  if (!audioCtx) return;
  for (const { gain } of musicNodes) {
    try {
      gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.08);
    } catch {}
  }
}

function resumeMusic() {
  if (!audioCtx) return;
  const volumes = [0.06, 0.025, 0.018]; // bass, melody, harmony
  musicNodes.forEach(({ gain }, i) => {
    try {
      gain.gain.setTargetAtTime(volumes[i] ?? 0.03, audioCtx!.currentTime, 0.08);
    } catch {}
  });
}

function playShootSound(strong: boolean) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const baseFreq = strong ? 660 : 880;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(strong ? 0.22 : 0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch {}
}

function playExplosionSound(coinType: CoinType) {
  try {
    const ctx = getAudioCtx();
    const freqs: Record<CoinType, number> = { 
      BTC: 200, ETH: 300, SOL: 400, PEPE: 250,
      DOGE: 180, SHIB: 220, BONK: 280, WIF: 160 
    };
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freqs[coinType], ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function playHitSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function playPowerUpSound(type: PowerUpType) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const freqs: Record<PowerUpType, number> = {
      shield: 880,
      speed: 660,
      multiplier: 1100,
      heal: 550,
    };
    osc.frequency.setValueAtTime(freqs[type], ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqs[type] * 1.5, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(freqs[type] * 2, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateStars(): GameState["stars"] {
  const stars = [];
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r: Math.random() * 1.8 + 0.3,
      brightness: Math.random(),
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

// Speed multipliers per coin type — higher reward = faster = harder
const COIN_SPEED: Record<CoinType, number> = {
  BTC: 2.8, // fastest — worth most
  ETH: 2.2, // fast
  SOL: 1.6, // medium
  PEPE: 2.5, // fast — meme power!
  // Phase 2 meme coins - faster and more aggressive
  DOGE: 3.2, // very fast
  SHIB: 3.5, // extremely fast
  BONK: 3.0, // fast
  WIF: 3.8, // fastest meme coin
};

// Score rewards per coin type
const COIN_SCORE: Record<CoinType, number> = {
  BTC: 50,
  ETH: 30,
  SOL: 20,
  PEPE: 40,
  // Phase 2 meme coins - higher rewards
  DOGE: 60,
  SHIB: 70,
  BONK: 55,
  WIF: 80,
};

function spawnMeteor(id: number, phase: 1 | 2): Meteor {
  const types = phase === 1 ? COIN_TYPES_PHASE1 : COIN_TYPES_PHASE2;
  const type = types[Math.floor(Math.random() * types.length)];
  const radius = 22 + Math.random() * 14;
  const side = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (side === 0) { x = Math.random() * WIDTH; y = -radius; }
  else if (side === 1) { x = WIDTH + radius; y = Math.random() * HEIGHT; }
  else if (side === 2) { x = Math.random() * WIDTH; y = HEIGHT + radius; }
  else { x = -radius; y = Math.random() * HEIGHT; }

  const dx = CENTER_X - x;
  const dy = CENTER_Y - y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const baseSpeed = 0.9 + Math.random() * 0.8;
  const speed = baseSpeed * COIN_SPEED[type];
  return {
    id,
    type,
    x,
    y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    radius,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.06,
    hp: 1,
  };
}

// Spawn boss for Phase 1 (PEPE KING) or Phase 2 (BONK BOSS)
function spawnBoss(id: number, bossType: BossType): Boss {
  const isPhase1 = bossType === "PEPE_KING";
  return {
    id,
    type: bossType,
    x: WIDTH / 2,
    y: -80,
    vx: 0,
    vy: 0.5,
    radius: isPhase1 ? 60 : 75,
    hp: isPhase1 ? 1000 : 2000, // Much higher HP - requires many attacks to defeat
    maxHp: isPhase1 ? 1000 : 2000,
    rotation: 0,
    rotSpeed: isPhase1 ? 0.008 : 0.012,
    attackTimer: 0,
    phase: 1,
  };
}

// Spawn boss projectile - fires toward SUI center
function spawnBossProjectile(id: number, bossX: number, bossY: number, bossType: BossType): BossProjectile {
  // Calculate direction toward SUI center
  const dx = CENTER_X - bossX;
  const dy = CENTER_Y - bossY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Speed based on boss type (BONK is faster)
  const speed = bossType === "PEPE_KING" ? 2.5 : 3.5;
  
  // Add some randomness to make it less predictable
  const angleOffset = (Math.random() - 0.5) * 0.4; // ±0.2 radians
  
  const vx = (dx / dist) * speed * Math.cos(angleOffset) - (dy / dist) * speed * Math.sin(angleOffset);
  const vy = (dy / dist) * speed * Math.cos(angleOffset) + (dx / dist) * speed * Math.sin(angleOffset);
  
  return {
    id,
    x: bossX,
    y: bossY,
    vx,
    vy,
    radius: bossType === "PEPE_KING" ? 8 : 10,
    color: bossType === "PEPE_KING" ? "#00FF88" : "#FF6B35",
    damage: bossType === "PEPE_KING" ? 3 : 5, // Low damage - not too strong
  };
}

function createExplosion(particles: Particle[], x: number, y: number, color: string, count = 18) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color,
      radius: 2 + Math.random() * 4,
    });
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

/** Draw the Ethereum diamond logo (two overlapping rhombuses) */
function drawETHLogo(ctx: CanvasRenderingContext2D, r: number) {
  const w = r * 0.52;
  const h = r * 0.9;
  ctx.save();

  // Top pyramid (upper half)
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, -h * 0.1);
  ctx.lineTo(0, -h * 0.28);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(-w, -h * 0.1);
  ctx.lineTo(0, -h * 0.28);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fill();

  // Middle band
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.1);
  ctx.lineTo(0, h * 0.08);
  ctx.lineTo(w, -h * 0.1);
  ctx.lineTo(0, -h * 0.28);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fill();

  // Bottom pyramid (lower half)
  ctx.beginPath();
  ctx.moveTo(-w * 0.65, h * 0.08);
  ctx.lineTo(0, h);
  ctx.lineTo(w * 0.65, h * 0.08);
  ctx.lineTo(0, h * 0.28);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-w * 0.65, h * 0.08);
  ctx.lineTo(0, h * 0.28);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  ctx.restore();
}

/** Draw the Solana logo (3 stacked horizontal bars with gradient, slightly angled) */
function drawSOLLogo(ctx: CanvasRenderingContext2D, r: number) {
  const barW = r * 1.1;
  const barH = r * 0.22;
  const gap = r * 0.28;
  const angle = -0.18; // slight tilt like the real logo

  ctx.save();
  ctx.rotate(angle);

  const bars = [-gap, 0, gap];
  bars.forEach((offsetY, i) => {
    const grad = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
    grad.addColorStop(0, "#9945FF");
    grad.addColorStop(1, "#14F195");

    ctx.save();
    ctx.translate(0, offsetY);

    // Parallelogram shape (left side angled)
    const skew = barH * 0.5;
    ctx.beginPath();
    ctx.moveTo(-barW / 2 + skew, -barH / 2);
    ctx.lineTo(barW / 2, -barH / 2);
    ctx.lineTo(barW / 2 - skew, barH / 2);
    ctx.lineTo(-barW / 2, barH / 2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.globalAlpha = i === 1 ? 1 : 0.85;
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}

/** Draw the PEPE logo — simple frog face */
function drawPEPELogo(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  
  // Eyes (two white circles with black pupils)
  const eyeY = -r * 0.2;
  const eyeSpacing = r * 0.35;
  const eyeR = r * 0.22;
  
  // Left eye white
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing, eyeY, eyeR, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#005533";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Left pupil
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeY, eyeR * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Right eye white
  ctx.beginPath();
  ctx.ellipse(eyeSpacing, eyeY, eyeR, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#005533";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Right pupil
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeY, eyeR * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Mouth (smug smile)
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.strokeStyle = "#005533";
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  ctx.stroke();
  
  ctx.restore();
}

/** Draw the SUI logo — SUI text with the official S-curve symbol */
function drawSUILogo(ctx: CanvasRenderingContext2D, r: number) {
  const s = r * 0.72;
  ctx.save();

  // SUI logo: two mirrored curved strokes forming the "S" wave shape
  // Based on the official SUI logo geometry
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = r * 0.13;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 10;

  // Top stroke (curves from top-left to center-right)
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.75);
  ctx.bezierCurveTo(
    -s * 0.55, -s * 1.1,   // control 1: pull up-left
     s * 0.55, -s * 1.1,   // control 2: pull up-right
     s * 0.55, -s * 0.25   // end: center-right
  );
  ctx.bezierCurveTo(
     s * 0.55,  s * 0.1,   // control 1: pull down-right
     s * 0.0,   s * 0.1,   // control 2: center
     s * 0.0,   s * 0.1    // end: center
  );
  ctx.stroke();

  // Bottom stroke (mirror of top, curves from bottom-right to center-left)
  ctx.beginPath();
  ctx.moveTo( s * 0.55,  s * 0.75);
  ctx.bezierCurveTo(
     s * 0.55,  s * 1.1,   // control 1: pull down-right
    -s * 0.55,  s * 1.1,   // control 2: pull down-left
    -s * 0.55,  s * 0.25   // end: center-left
  );
  ctx.bezierCurveTo(
    -s * 0.55, -s * 0.1,   // control 1: pull up-left
     s * 0.0,  -s * 0.1,   // control 2: center
     s * 0.0,  -s * 0.1    // end: center
  );
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Draw DOGE logo — Shiba Inu face simplified */
function drawDOGELogo(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  
  // Simple doge face - two eyes and a nose
  const eyeY = -r * 0.15;
  const eyeSpacing = r * 0.35;
  const eyeR = r * 0.18;
  
  // Left eye
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing, eyeY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeY, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Right eye
  ctx.beginPath();
  ctx.ellipse(eyeSpacing, eyeY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeY, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Nose
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#333333";
  ctx.fill();
  
  // Smile
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = "round";
  ctx.stroke();
  
  ctx.restore();
}

/** Draw SHIB logo — similar to DOGE but with different colors */
function drawSHIBLogo(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  
  // Shiba face - more aggressive look
  const eyeY = -r * 0.2;
  const eyeSpacing = r * 0.32;
  const eyeR = r * 0.16;
  
  // Left eye (angled)
  ctx.save();
  ctx.translate(-eyeSpacing, eyeY);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, eyeR, eyeR * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();
  
  // Right eye (angled)
  ctx.save();
  ctx.translate(eyeSpacing, eyeY);
  ctx.rotate(0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, eyeR, eyeR * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();
  
  // Nose
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#222222";
  ctx.fill();
  
  ctx.restore();
}

/** Draw BONK logo — stylized "B" with lightning */
function drawBONKLogo(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  
  // Lightning bolt shape
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.7);
  ctx.lineTo(-r * 0.3, 0);
  ctx.lineTo(r * 0.0, 0);
  ctx.lineTo(-r * 0.1, r * 0.7);
  ctx.lineTo(r * 0.3, 0);
  ctx.lineTo(r * 0.0, 0);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  
  ctx.restore();
}

/** Draw WIF logo — dog with hat */
function drawWIFLogo(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  
  // Simple dog face with hat
  const hatTop = -r * 0.6;
  
  // Hat
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.3);
  ctx.lineTo(0, hatTop - r * 0.2);
  ctx.lineTo(r * 0.5, -r * 0.3);
  ctx.closePath();
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  
  // Hat brim
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.3, r * 0.55, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  
  // Eyes
  const eyeY = r * 0.0;
  const eyeSpacing = r * 0.28;
  
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeY, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeY, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Nose
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#333333";
  ctx.fill();
  
  ctx.restore();
}

/** Draw Boss PEPE KING — giant frog with crown (Phase 1 boss) */
function drawBossPEPE(ctx: CanvasRenderingContext2D, boss: Boss) {
  const r = boss.radius;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(boss.rotation);
  
  // Glow effect
  ctx.shadowColor = "#00FF88";
  ctx.shadowBlur = 40;
  
  // Main body - green frog
  const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  grad.addColorStop(0, "#00FF88");
  grad.addColorStop(0.5, "#00A86B");
  grad.addColorStop(1, "#006644");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#00FF88";
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.shadowBlur = 0;
  
  // Crown - golden with gems
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.45);
  ctx.lineTo(-r * 0.45, -r * 0.95);
  ctx.lineTo(-r * 0.25, -r * 0.6);
  ctx.lineTo(0, -r * 1.1);
  ctx.lineTo(r * 0.25, -r * 0.6);
  ctx.lineTo(r * 0.45, -r * 0.95);
  ctx.lineTo(r * 0.6, -r * 0.45);
  ctx.closePath();
  ctx.fillStyle = "#FFD700";
  ctx.fill();
  ctx.strokeStyle = "#FFA500";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Crown gems
  ctx.beginPath();
  ctx.arc(0, -r * 0.75, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  
  // Eyes (menacing)
  const eyeY = -r * 0.1;
  const eyeSpacing = r * 0.35;
  
  // Left eye
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing, eyeY, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeY, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeY, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Right eye
  ctx.beginPath();
  ctx.ellipse(eyeSpacing, eyeY, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeY, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeY, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Angry eyebrows
  ctx.strokeStyle = "#004422";
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-eyeSpacing - r * 0.25, eyeY - r * 0.4);
  ctx.lineTo(-eyeSpacing + r * 0.1, eyeY - r * 0.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(eyeSpacing + r * 0.25, eyeY - r * 0.4);
  ctx.lineTo(eyeSpacing - r * 0.1, eyeY - r * 0.25);
  ctx.stroke();
  
  // Nose
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#004422";
  ctx.fill();
  
  // Evil grin
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.strokeStyle = "#004422";
  ctx.lineWidth = r * 0.06;
  ctx.stroke();
  
  ctx.restore();
}

/** Draw Boss BONK — giant fire dog (Phase 2 boss) */
function drawBossBONK(ctx: CanvasRenderingContext2D, boss: Boss) {
  const r = boss.radius;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(boss.rotation);
  
  // Glow effect - fiery
  ctx.shadowColor = "#FF6B35";
  ctx.shadowBlur = 50;
  
  // Main body - fire gradient
  const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  grad.addColorStop(0, "#FFFF00");
  grad.addColorStop(0.3, "#FFA500");
  grad.addColorStop(0.6, "#FF6B35");
  grad.addColorStop(1, "#CC4400");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#FF6B35";
  ctx.lineWidth = 4;
  ctx.stroke();
  
  ctx.shadowBlur = 0;
  
  // Fire crown/horns
  for (let i = -2; i <= 2; i++) {
    const angle = (i * 0.3) - Math.PI / 2;
    const hornLen = r * (0.4 + Math.abs(i) * 0.15);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle - 0.15) * r * 0.7, Math.sin(angle - 0.15) * r * 0.7);
    ctx.lineTo(Math.cos(angle) * (r + hornLen), Math.sin(angle) * (r + hornLen));
    ctx.lineTo(Math.cos(angle + 0.15) * r * 0.7, Math.sin(angle + 0.15) * r * 0.7);
    ctx.closePath();
    const hornGrad = ctx.createLinearGradient(0, -r, 0, -r - hornLen);
    hornGrad.addColorStop(0, "#FF6B35");
    hornGrad.addColorStop(0.5, "#FFA500");
    hornGrad.addColorStop(1, "#FFFF00");
    ctx.fillStyle = hornGrad;
    ctx.fill();
  }
  
  // Eyes (fierce)
  const eyeY = -r * 0.05;
  const eyeSpacing = r * 0.35;
  
  // Left eye
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing, eyeY, r * 0.18, r * 0.22, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-eyeSpacing + r * 0.02, eyeY, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-eyeSpacing + r * 0.02, eyeY, r * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Right eye
  ctx.beginPath();
  ctx.ellipse(eyeSpacing, eyeY, r * 0.18, r * 0.22, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpacing - r * 0.02, eyeY, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#FF0000";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpacing - r * 0.02, eyeY, r * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  
  // Angry eyebrows - fire style
  ctx.strokeStyle = "#8B0000";
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-eyeSpacing - r * 0.2, eyeY - r * 0.35);
  ctx.lineTo(-eyeSpacing + r * 0.15, eyeY - r * 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(eyeSpacing + r * 0.2, eyeY - r * 0.35);
  ctx.lineTo(eyeSpacing - r * 0.15, eyeY - r * 0.22);
  ctx.stroke();
  
  // Nose
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#8B0000";
  ctx.fill();
  
  // Menacing smile with teeth
  ctx.beginPath();
  ctx.arc(0, r * 0.35, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = "#8B0000";
  ctx.lineWidth = r * 0.05;
  ctx.stroke();
  
  // Teeth
  for (let i = -3; i <= 3; i++) {
    const tx = i * r * 0.08;
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.04, r * 0.32);
    ctx.lineTo(tx, r * 0.42);
    ctx.lineTo(tx + r * 0.04, r * 0.32);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  
  ctx.restore();
}

/** Draw boss based on type */
function drawBoss(ctx: CanvasRenderingContext2D, boss: Boss) {
  if (boss.type === "PEPE_KING") {
    drawBossPEPE(ctx, boss);
  } else {
    drawBossBONK(ctx, boss);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gamePhase, setGamePhase] = useState<"login" | "start" | "playing" | "paused" | "gameover" | "phasecomplete">("login");
  const gamePhaseRef = useRef<"login" | "start" | "playing" | "paused" | "gameover" | "phasecomplete">("login");
  const [finalScore, setFinalScore] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [topPlayers, setTopPlayers] = useState<PlayerScore[]>([]);
  const playerNameRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const stateRef = useRef<GameState>({
    score: 100,
    highScore: typeof window !== "undefined" ? parseInt(localStorage.getItem("dogSuiDefenderHighScore") || "0") : 0,
    hp: 100,
    meteors: [],
    particles: [],
    scorePopups: [],
    waves: [],
    powerUps: [],
    activePowerUps: [],
    mouseX: CENTER_X,
    mouseY: CENTER_Y,
    bgFlash: null,
    stars: generateStars(),
    nextMeteorId: 0,
    nextWaveId: 0,
    nextPowerUpId: 0,
    spawnTimer: 0,
    spawnInterval: 80,
    powerUpTimer: 0,
    gameOver: false,
    suiPulse: 0,
    suiShake: { x: 0, y: 0, timer: 0 },
    screenShake: { x: 0, y: 0, timer: 0 },
    paused: false,
    combo: 0,
    comboTimer: 0,
    mouseDownTime: null,
    chargeProgress: 0,
    currentPhase: 1,
    boss: null,
    bossDefeated: false,
    bossProjectiles: [],
  });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const resetState = useCallback(() => {
    const prev = stateRef.current;
    const savedHighScore = typeof window !== "undefined" ? parseInt(localStorage.getItem("dogSuiDefenderHighScore") || "0") : 0;
    stateRef.current = {
      score: 100,
      highScore: savedHighScore,
      hp: 100,
      meteors: [],
      particles: [],
      scorePopups: [],
      waves: [],
      powerUps: [],
      activePowerUps: [],
      mouseX: prev.mouseX,
      mouseY: prev.mouseY,
      bgFlash: null,
      stars: generateStars(),
      nextMeteorId: 0,
      nextWaveId: 0,
      nextPowerUpId: 0,
      spawnTimer: 0,
      spawnInterval: 80,
      powerUpTimer: 0,
      gameOver: false,
      suiPulse: 0,
      suiShake: { x: 0, y: 0, timer: 0 },
      screenShake: { x: 0, y: 0, timer: 0 },
      paused: false,
      combo: 0,
      comboTimer: 0,
      mouseDownTime: null,
      chargeProgress: 0,
      currentPhase: 1,
      boss: null,
      bossDefeated: false,
      bossProjectiles: [],
    };
  }, []);

  // ── Fire wave attack ──────────────────────────────────────────────────────
  // Simple wave: fires from click position, medium radius
  // Strong wave: fires from SUI center, covers entire screen
  const fireWave = useCallback((strong: boolean, originX: number, originY: number) => {
    const state = stateRef.current;
    const cost = strong ? 30 : 10;
    if (state.score < cost) return; // not enough SUI

    state.score -= cost;
    playShootSound(strong);

    if (strong) {
      // Strong wave: 3 rapid rings from SUI center, guaranteed full-screen coverage
      for (let ring = 0; ring < 3; ring++) {
        state.waves.push({
          id: state.nextWaveId++,
          x: CENTER_X,
          y: CENTER_Y,
          radius: 8 + ring * 30, // staggered start
          maxRadius: Math.sqrt(WIDTH * WIDTH + HEIGHT * HEIGHT) + 60, // covers all corners
          alpha: 1,
          strong: true,
        });
      }
    } else {
      // Simple wave: fires from click position
      state.waves.push({
        id: state.nextWaveId++,
        x: originX,
        y: originY,
        radius: 8,
        maxRadius: 200,
        alpha: 1,
        strong: false,
      });
    }
  }, []);

  // ── Mouse down: start charge timer, record click position ────────────────
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return; // only left button
    const phase = gamePhaseRef.current;
    if (phase !== "playing") return;
    stateRef.current.mouseDownTime = performance.now();
    stateRef.current.chargeProgress = 0;
  }, []);

  // ── Mouse up: fire wave from click position based on hold duration ────────
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return; // only left button
    const phase = gamePhaseRef.current;

    if (phase !== "playing") return;

    const state = stateRef.current;
    if (state.mouseDownTime === null) return;

    const held = performance.now() - state.mouseDownTime;
    const strong = held >= HOLD_THRESHOLD_MS;
    state.mouseDownTime = null;
    state.chargeProgress = 0;

    // Fire from current mouse position (where the player clicked/released)
    fireWave(strong, state.mouseX, state.mouseY);
  }, [fireWave]);

  // ── Context menu: prevent default ────────────────────────────────────────
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Pause toggle ──────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    const phase = gamePhaseRef.current;
    if (phase === "playing") {
      gamePhaseRef.current = "paused";
      setGamePhase("paused");
      stateRef.current.paused = true;
      stateRef.current.mouseDownTime = null; // cancel any charge
      stateRef.current.chargeProgress = 0;
      pauseMusic();
    } else if (phase === "paused") {
      gamePhaseRef.current = "playing";
      setGamePhase("playing");
      stateRef.current.paused = false;
      resumeMusic();
    }
  }, []);

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = useCallback(() => {
    const name = playerName.trim() || "Player";
    savePlayerName(name);
    playerNameRef.current = name;
    setTopPlayers(getTopPlayers());
    gamePhaseRef.current = "start";
    setGamePhase("start");
  }, [playerName]);

  // ── Start / Restart game ──────────────────────────────────────────────────
  const startGame = useCallback(() => {
    resetState();
    gamePhaseRef.current = "playing";
    setGamePhase("playing");
    startMusic();
  }, [resetState]);

  const restartGame = useCallback(() => {
    resetState();
    gamePhaseRef.current = "playing";
    setGamePhase("playing");
    startMusic();
  }, [resetState]);

  // ── Load saved player name on mount ────────────────────────────────────────
  useEffect(() => {
    const savedName = loadPlayerName();
    if (savedName) {
      playerNameRef.current = savedName;
    }
    // Use requestAnimationFrame to defer setState
    requestAnimationFrame(() => {
      if (savedName) {
        setPlayerName(savedName);
      }
      setTopPlayers(getTopPlayers());
    });
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      stateRef.current.mouseX = (e.clientX - rect.left) * scaleX;
      stateRef.current.mouseY = (e.clientY - rect.top) * scaleY;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);

    // ── Draw functions ──────────────────────────────────────────────────────

    const drawBackground = (ctx: CanvasRenderingContext2D, state: GameState, t: number) => {
      // Different background for each phase
      if (state.currentPhase === 1) {
        // Phase 1: Blue space theme
        const bg = ctx.createRadialGradient(CENTER_X, CENTER_Y, 80, CENTER_X, CENTER_Y, WIDTH * 0.8);
        bg.addColorStop(0, "#0a0e1a");
        bg.addColorStop(0.5, "#060a14");
        bg.addColorStop(1, "#020408");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        for (const star of state.stars) {
          star.twinkle += 0.03;
          const alpha = 0.4 + 0.6 * Math.abs(Math.sin(star.twinkle + t * 0.001));
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${alpha * star.brightness})`;
          ctx.fill();
        }

        const nebula = ctx.createRadialGradient(CENTER_X, CENTER_Y, 60, CENTER_X, CENTER_Y, 280);
        nebula.addColorStop(0, "rgba(0,200,255,0.06)");
        nebula.addColorStop(0.5, "rgba(100,50,200,0.04)");
        nebula.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      } else {
        // Phase 2: Purple/gold nebula theme (more intense)
        const bg = ctx.createRadialGradient(CENTER_X, CENTER_Y, 80, CENTER_X, CENTER_Y, WIDTH * 0.8);
        bg.addColorStop(0, "#1a0a1e");
        bg.addColorStop(0.5, "#0f0614");
        bg.addColorStop(1, "#050208");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        for (const star of state.stars) {
          star.twinkle += 0.05; // faster twinkle
          const alpha = 0.5 + 0.5 * Math.abs(Math.sin(star.twinkle + t * 0.002));
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r * 1.2, 0, Math.PI * 2);
          // Golden/purple stars for phase 2
          const hue = (star.x + star.y + t * 0.01) % 60 + 30; // gold to purple range
          ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${alpha * star.brightness})`;
          ctx.fill();
        }

        // Intense nebula effect
        const nebula = ctx.createRadialGradient(CENTER_X, CENTER_Y, 60, CENTER_X, CENTER_Y, 350);
        nebula.addColorStop(0, "rgba(168,85,247,0.12)");
        nebula.addColorStop(0.3, "rgba(255,165,0,0.08)");
        nebula.addColorStop(0.6, "rgba(194,166,51,0.06)");
        nebula.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Pulsing danger zone
        const dangerPulse = Math.sin(t * 0.003) * 0.02 + 0.03;
        const danger = ctx.createRadialGradient(CENTER_X, CENTER_Y, SUI_RADIUS + 50, CENTER_X, CENTER_Y, SUI_RADIUS + 150);
        danger.addColorStop(0, `rgba(255,0,100,${dangerPulse})`);
        danger.addColorStop(1, "rgba(255,0,100,0)");
        ctx.fillStyle = danger;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      if (state.bgFlash && state.bgFlash.alpha > 0) {
        const [r, g, b] = hexToRgb(state.bgFlash.color);
        ctx.fillStyle = `rgba(${r},${g},${b},${state.bgFlash.alpha})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        state.bgFlash.alpha -= 0.025;
        if (state.bgFlash.alpha <= 0) state.bgFlash = null;
      }
    };

    const drawSUI = (ctx: CanvasRenderingContext2D, state: GameState) => {
      state.suiPulse += 0.04;
      const pulse = Math.sin(state.suiPulse) * 4;
      const cx = CENTER_X + state.suiShake.x;
      const cy = CENTER_Y + state.suiShake.y;

      if (state.suiShake.timer > 0) {
        state.suiShake.timer--;
        state.suiShake.x = (Math.random() - 0.5) * 8;
        state.suiShake.y = (Math.random() - 0.5) * 8;
        if (state.suiShake.timer === 0) {
          state.suiShake.x = 0;
          state.suiShake.y = 0;
        }
      }

      // HP-based tint: green → yellow → red
      const hpFrac = state.hp / 100;
      const hpR = Math.round(255 * (1 - hpFrac));
      const hpG = Math.round(200 * hpFrac);
      const hpGlowColor = `rgb(${hpR},${hpG},255)`;

      // Charge ring — shows hold progress
      if (state.mouseDownTime !== null) {
        const held = performance.now() - state.mouseDownTime;
        const progress = Math.min(held / HOLD_THRESHOLD_MS, 1);
        state.chargeProgress = progress;

        const chargeRadius = SUI_RADIUS + 28 + pulse;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, chargeRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = progress >= 1 ? "#ff8800" : "#00ffcc";
        ctx.lineWidth = 4;
        ctx.shadowColor = progress >= 1 ? "#ff8800" : "#00ffcc";
        ctx.shadowBlur = 16;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.restore();
      }

      for (let ring = 3; ring >= 1; ring--) {
        const ringR = SUI_RADIUS + pulse + ring * 14;
        const alpha = 0.06 / ring;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS + 18 + pulse * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,200,255,0.15)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.shadowColor = hpGlowColor;
      ctx.shadowBlur = 30 + pulse * 2;

      const grad = ctx.createRadialGradient(cx - 14, cy - 14, 6, cx, cy, SUI_RADIUS);
      grad.addColorStop(0, "#80eeff");
      grad.addColorStop(0.35, "#00c8ff");
      grad.addColorStop(0.7, "#0088cc");
      grad.addColorStop(1, "#004466");
      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = "#00eeff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // SUI logo — official shape
      ctx.save();
      ctx.translate(cx, cy);
      drawSUILogo(ctx, SUI_RADIUS);
      ctx.restore();

      // Shine
      const shine = ctx.createRadialGradient(
        cx - SUI_RADIUS * 0.35, cy - SUI_RADIUS * 0.35, 2,
        cx - SUI_RADIUS * 0.2, cy - SUI_RADIUS * 0.2, SUI_RADIUS * 0.55
      );
      shine.addColorStop(0, "rgba(255,255,255,0.35)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();

      ctx.fillStyle = "rgba(0,200,255,0.7)";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("SUI", cx, cy + SUI_RADIUS + 6);
    };

    const drawMeteor = (ctx: CanvasRenderingContext2D, m: Meteor) => {
      const c = COIN_COLORS[m.type];
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rotation);

      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 18;

      const grad = ctx.createRadialGradient(-m.radius * 0.3, -m.radius * 0.3, 2, 0, 0, m.radius);
      grad.addColorStop(0, c.primary + "ff");
      grad.addColorStop(0.6, c.primary + "cc");
      grad.addColorStop(1, c.secondary + "aa");
      ctx.beginPath();
      ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = c.primary;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw coin-specific logo
      if (m.type === "BTC") {
        ctx.fillStyle = c.text;
        ctx.font = `bold ${m.radius * 0.9}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("₿", 0, 0);
      } else if (m.type === "ETH") {
        drawETHLogo(ctx, m.radius);
      } else if (m.type === "SOL") {
        drawSOLLogo(ctx, m.radius);
      } else if (m.type === "PEPE") {
        drawPEPELogo(ctx, m.radius);
      } else if (m.type === "DOGE") {
        drawDOGELogo(ctx, m.radius);
      } else if (m.type === "SHIB") {
        drawSHIBLogo(ctx, m.radius);
      } else if (m.type === "BONK") {
        drawBONKLogo(ctx, m.radius);
      } else if (m.type === "WIF") {
        drawWIFLogo(ctx, m.radius);
      }

      ctx.restore();
    };

    const drawWaves = (ctx: CanvasRenderingContext2D, state: GameState) => {
      for (let i = state.waves.length - 1; i >= 0; i--) {
        const w = state.waves[i];
        const expandSpeed = w.strong ? 9 : 6;
        w.radius += expandSpeed;
        w.alpha = 1 - w.radius / w.maxRadius;

        if (w.radius >= w.maxRadius) {
          state.waves.splice(i, 1);
          continue;
        }

        // Check meteor hits — wave ring expands from click origin
        for (let j = state.meteors.length - 1; j >= 0; j--) {
          const m = state.meteors[j];
          const dx = m.x - w.x;
          const dy = m.y - w.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Wave ring hits meteor if meteor center is within the ring band
          const ringThickness = w.strong ? 20 : 12;
          if (Math.abs(dist - w.radius) < ringThickness + m.radius) {
            const coinColor = COIN_COLORS[m.type].primary;
            createExplosion(state.particles, m.x, m.y, coinColor, 22);
            state.bgFlash = { color: coinColor, alpha: 0.45 };
            state.screenShake = { x: 0, y: 0, timer: 6 };
            
            // Combo system
            state.combo++;
            state.comboTimer = 120; // 2 seconds to maintain combo
            
            // Calculate points with combo and multiplier
            let points = COIN_SCORE[m.type];
            const hasMultiplier = state.activePowerUps.some(p => p.type === "multiplier");
            if (hasMultiplier) points *= 2;
            const comboMultiplier = Math.min(state.combo, 10);
            points = Math.floor(points * (1 + comboMultiplier * 0.1));
            
            state.score += points;
            state.scorePopups.push({
              x: m.x,
              y: m.y - m.radius,
              value: points,
              life: 1,
              maxLife: 1,
              color: COIN_COLORS[m.type].primary,
            });
            playExplosionSound(m.type);
            state.meteors.splice(j, 1);
            
            // Heal power-up gives HP on kill
            const hasHeal = state.activePowerUps.some(p => p.type === "heal");
            if (hasHeal) {
              state.hp = Math.min(100, state.hp + 2);
            }
          }
        }
        
        // Check for boss spawn in Phase 1 (at 1400 points, before phase transition)
        if (state.score >= 1400 && state.currentPhase === 1 && !state.boss && !state.bossDefeated) {
          state.boss = spawnBoss(state.nextMeteorId++, "PEPE_KING");
          state.bgFlash = { color: "#00FF88", alpha: 0.5 };
        }
        
        // Check for boss spawn in Phase 2 (at 2900 points, before victory)
        if (state.score >= 2900 && state.currentPhase === 2 && !state.boss && !state.bossDefeated) {
          state.boss = spawnBoss(state.nextMeteorId++, "BONK_BOSS");
          state.bgFlash = { color: "#FF6B35", alpha: 0.5 };
        }
        
        // Phase 1 to Phase 2 transition (after PEPE KING defeated + 1500 points)
        if (state.currentPhase === 1 && state.bossDefeated && state.score >= 1500) {
          state.currentPhase = 2;
          state.bossDefeated = false; // Reset for Phase 2 boss
          state.spawnInterval = 60; // faster spawns in phase 2
          state.bgFlash = { color: "#FFD700", alpha: 0.5 };
        }
        
        // Phase 2 completion (after BONK BOSS defeated + 3000 points)
        if (state.currentPhase === 2 && state.bossDefeated && state.score >= 3000) {
          state.gameOver = true;
          if (state.score > state.highScore) {
            state.highScore = state.score;
            localStorage.setItem("dogSuiDefenderHighScore", state.score.toString());
          }
          // Save score to leaderboard
          const name = playerNameRef.current || "Player";
          addScoreToLeaderboard(name, state.score);
          setTopPlayers(getTopPlayers());
          setFinalScore(state.score);
          gamePhaseRef.current = "phasecomplete";
          setGamePhase("phasecomplete");
          stopMusic();
        }

        // Draw wave ring from click origin
        ctx.save();
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        const waveColor = w.strong ? "#ff8800" : "#00ffcc";
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = w.strong ? 5 : 3;
        ctx.globalAlpha = w.alpha * 0.9;
        ctx.shadowColor = waveColor;
        ctx.shadowBlur = w.strong ? 24 : 14;
        ctx.stroke();

        // Inner glow ring
        ctx.beginPath();
        ctx.arc(w.x, w.y, Math.max(0, w.radius - (w.strong ? 12 : 8)), 0, Math.PI * 2);
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = w.alpha * 0.3;
        ctx.stroke();

        ctx.restore();
      }
    };

    const drawCrosshair = (ctx: CanvasRenderingContext2D, mx: number, my: number, charging: boolean, chargeProgress: number) => {
      const size = 18;
      const gap = 6;
      ctx.save();

      const color = charging
        ? (chargeProgress >= 1 ? "#ff8800" : `rgba(${Math.round(255 * chargeProgress)},${Math.round(255 * (1 - chargeProgress * 0.5))},${Math.round(204 * (1 - chargeProgress))},0.9)`)
        : "#00ff88";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = charging ? 14 : 8;

      ctx.beginPath();
      ctx.moveTo(mx - size - gap, my);
      ctx.lineTo(mx - gap, my);
      ctx.moveTo(mx + gap, my);
      ctx.lineTo(mx + size + gap, my);
      ctx.moveTo(mx, my - size - gap);
      ctx.lineTo(mx, my - gap);
      ctx.moveTo(mx, my + gap);
      ctx.lineTo(mx, my + size + gap);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(mx, my, size * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = color.replace("0.9", "0.4");
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    const drawParticles = (ctx: CanvasRenderingContext2D, particles: Particle[]) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 0.025;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      }
    };

    const drawScorePopups = (ctx: CanvasRenderingContext2D, popups: ScorePopup[]) => {
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y -= 1.2;
        p.life -= 0.02;
        if (p.life <= 0) { popups.splice(i, 1); continue; }
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color ?? "#ffd700";
        ctx.font = `bold ${16 + (1 - alpha) * 8}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = p.color ?? "#ffd700";
        ctx.shadowBlur = 10;
        ctx.fillText(`+$${p.value}`, p.x, p.y);
        ctx.restore();
      }
    };

    const drawHUD = (ctx: CanvasRenderingContext2D, state: GameState) => {
      ctx.save();

      // Player name
      const name = playerNameRef.current || "Player";
      ctx.fillStyle = "rgba(0,200,255,0.7)";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`👤 ${name}`, 18, 4);

      // Score
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`$${state.score.toLocaleString()} SUI`, 18, 20);
      ctx.shadowBlur = 0;

      // High score
      if (state.highScore > 0) {
        ctx.fillStyle = "rgba(255,215,0,0.5)";
        ctx.font = "12px monospace";
        ctx.fillText(`BEST: $${state.highScore.toLocaleString()}`, 18, 50);
      }

      // Phase indicator
      let phaseText: string;
      let phaseColor: string;
      if (state.boss && !state.bossDefeated) {
        phaseText = state.boss.type === "PEPE_KING" ? "⚠ BOSS: PEPE KING ⚠" : "⚠ BOSS: BONK BOSS ⚠";
        phaseColor = state.boss.type === "PEPE_KING" ? "#00FF88" : "#FF6B35";
      } else {
        phaseText = state.currentPhase === 1 ? "PHASE I" : "PHASE II: MEME WARS";
        phaseColor = state.currentPhase === 1 ? "#00c8ff" : "#FFD700";
      }
      ctx.fillStyle = phaseColor;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "right";
      ctx.fillText(phaseText, WIDTH - 18, 46);
      
      // Progress bar (shows progress to boss or next phase)
      if (state.boss && !state.bossDefeated) {
        // Show boss HP as progress
        const barW = 100;
        const barX = WIDTH - barW - 18;
        const bossColor = state.boss.type === "PEPE_KING" ? "#00FF88" : "#FF6B35";
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(barX, 62, barW, 6);
        ctx.fillStyle = bossColor;
        ctx.fillRect(barX, 62, barW * (state.boss.hp / state.boss.maxHp), 6);
      } else if (state.currentPhase === 1) {
        // Progress to boss in Phase 1
        const progress = Math.min(state.score / 1400, 1);
        const barW = 100;
        const barX = WIDTH - barW - 18;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(barX, 62, barW, 6);
        ctx.fillStyle = "#00ff88";
        ctx.fillRect(barX, 62, barW * progress, 6);
      } else if (state.currentPhase === 2 && !state.bossDefeated) {
        // Progress to boss in Phase 2
        const progress = Math.min((state.score - 1500) / 1400, 1);
        const barW = 100;
        const barX = WIDTH - barW - 18;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(barX, 62, barW, 6);
        ctx.fillStyle = "#FF6B35";
        ctx.fillRect(barX, 62, barW * progress, 6);
      }

      // Combo display
      if (state.combo > 1) {
        ctx.fillStyle = state.combo >= 10 ? "#ff4466" : "#00ffcc";
        ctx.font = "bold 18px monospace";
        ctx.shadowColor = state.combo >= 10 ? "#ff4466" : "#00ffcc";
        ctx.shadowBlur = 10;
        ctx.textAlign = "left";
        ctx.fillText(`${state.combo}x COMBO!`, 18, 68);
        ctx.shadowBlur = 0;
      }

      // Title
      ctx.fillStyle = state.currentPhase === 1 ? "rgba(0,200,255,0.85)" : "rgba(255,215,0,0.85)";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText(state.currentPhase === 1 ? "⚡ DogSui Defender ⚡" : "⚡ DogSui Defender: MEME WARS ⚡", CENTER_X, 14);

      // Active power-ups display
      const activeY = 70;
      state.activePowerUps.forEach((p, i) => {
        const colors: Record<PowerUpType, string> = {
          shield: "#00ffff",
          speed: "#ffff00",
          multiplier: "#ff00ff",
          heal: "#00ff00",
        };
        const icons: Record<PowerUpType, string> = {
          shield: "🛡️",
          speed: "⚡",
          multiplier: "×2",
          heal: "❤️",
        };
        const remaining = Math.ceil(p.duration / 60);
        ctx.fillStyle = colors[p.type];
        ctx.font = "12px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${icons[p.type]} ${remaining}s`, 18, activeY + i * 18);
      });

      // HP bar at top right
      const barW = 180;
      const barH = 18;
      const barX = WIDTH - barW - 16;
      const barY = 14;

      // HP bar background
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();

      // HP bar fill — green → yellow → red
      const hpFrac = state.hp / 100;
      const hpR = Math.round(255 * (1 - hpFrac));
      const hpG = Math.round(220 * hpFrac);
      const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW * hpFrac, 0);
      hpGrad.addColorStop(0, `rgb(${hpR},${hpG},80)`);
      hpGrad.addColorStop(1, `rgb(${Math.min(255, hpR + 40)},${hpG},80)`);
      ctx.fillStyle = hpGrad;
      ctx.shadowColor = `rgb(${hpR},${hpG},80)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpFrac, barH, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // HP bar border
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.stroke();

      // HP label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`HP ${state.hp}%`, barX + barW / 2, barY + barH / 2);

      // Attack legend
      ctx.textAlign = "left";
      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(0,255,204,0.6)";
      ctx.fillText("Click anywhere: Wave (-10 SUI)  |  Hold 2s: Strong Wave (-30 SUI)", 18, HEIGHT - 24);

      ctx.restore();
    };

    const drawPauseOverlay = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00c8ff";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#00c8ff";
      ctx.font = "bold 52px monospace";
      ctx.fillText("PAUSED", CENTER_X, CENTER_Y - 30);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "18px monospace";
      ctx.fillText("Press P or click Pause to resume", CENTER_X, CENTER_Y + 30);
      ctx.restore();
    };

    const drawGameOver = (ctx: CanvasRenderingContext2D, state: GameState) => {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.shadowColor = "#ff4466";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#ff4466";
      ctx.font = "bold 56px monospace";
      ctx.fillText("GAME OVER", CENTER_X, CENTER_Y - 70);

      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 32px monospace";
      ctx.fillText(`Final Score: $${state.score.toLocaleString()} SUI`, CENTER_X, CENTER_Y - 10);

      ctx.shadowBlur = 0;
      ctx.restore();
    };

    // ── Game loop ─────────────────────────────────────────────────────────────
    const gameLoop = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed < 1000 / FPS) {
        animFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }
      lastTimeRef.current = timestamp;

      const state = stateRef.current;
      const phase = gamePhaseRef.current;

      // Apply screen shake
      if (state.screenShake.timer > 0) {
        state.screenShake.timer--;
        state.screenShake.x = (Math.random() - 0.5) * 10;
        state.screenShake.y = (Math.random() - 0.5) * 10;
      } else {
        state.screenShake.x = 0;
        state.screenShake.y = 0;
      }

      ctx.save();
      ctx.translate(state.screenShake.x, state.screenShake.y);

      drawBackground(ctx, state, timestamp);

      if (phase === "playing") {
        // Spawn meteors — spawn 4-5 at a time (more in phase 2)
        state.spawnTimer++;
        if (state.spawnTimer >= state.spawnInterval) {
          state.spawnTimer = 0;
          // Spawn 4-5 meteors in phase 1, 5-7 in phase 2
          const baseCount = state.currentPhase === 1 ? 4 : 5;
          const extraCount = state.currentPhase === 1 ? 2 : 3;
          const count = baseCount + Math.floor(Math.random() * extraCount);
          for (let i = 0; i < count; i++) {
            state.meteors.push(spawnMeteor(state.nextMeteorId++, state.currentPhase));
          }
          state.spawnInterval = Math.max(state.currentPhase === 1 ? 40 : 30, state.spawnInterval - 0.3);
        }

        // Spawn power-ups occasionally
        state.powerUpTimer++;
        if (state.powerUpTimer >= 300) { // Every ~5 seconds
          state.powerUpTimer = 0;
          if (Math.random() < 0.5 && state.powerUps.length < 2) {
            const types: PowerUpType[] = ["shield", "speed", "multiplier", "heal"];
            const type = types[Math.floor(Math.random() * types.length)];
            // Spawn at random position away from center
            const angle = Math.random() * Math.PI * 2;
            const dist = 150 + Math.random() * 200;
            state.powerUps.push({
              id: state.nextPowerUpId++,
              type,
              x: CENTER_X + Math.cos(angle) * dist,
              y: CENTER_Y + Math.sin(angle) * dist,
              radius: 18,
              pulse: 0,
            });
          }
        }

        // Update power-ups (pulse animation and collection)
        for (let i = state.powerUps.length - 1; i >= 0; i--) {
          const p = state.powerUps[i];
          p.pulse += 0.1;
          // Check if player wave hits power-up
          for (const w of state.waves) {
            const dx = p.x - w.x;
            const dy = p.y - w.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dist - w.radius) < 20 + p.radius) {
              // Collected!
              state.activePowerUps.push({ type: p.type, duration: 600 }); // 10 seconds
              state.powerUps.splice(i, 1);
              playPowerUpSound(p.type);
              break;
            }
          }
        }

        // Update active power-ups
        for (let i = state.activePowerUps.length - 1; i >= 0; i--) {
          state.activePowerUps[i].duration--;
          if (state.activePowerUps[i].duration <= 0) {
            state.activePowerUps.splice(i, 1);
          }
        }

        // Update combo timer
        if (state.comboTimer > 0) {
          state.comboTimer--;
          if (state.comboTimer <= 0) {
            state.combo = 0;
          }
        }

        // Update meteors
        for (let i = state.meteors.length - 1; i >= 0; i--) {
          const m = state.meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          m.rotation += m.rotSpeed;

          const dx = m.x - CENTER_X;
          const dy = m.y - CENTER_Y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Check for shield power-up
          const hasShield = state.activePowerUps.some(p => p.type === "shield");
          const shieldRadius = SUI_RADIUS + 30;
          
          if (hasShield && dist < shieldRadius + m.radius) {
            // Shield blocks the meteor
            createExplosion(state.particles, m.x, m.y, "#00ffff", 20);
            state.meteors.splice(i, 1);
            state.screenShake = { x: 0, y: 0, timer: 8 };
          } else if (dist < SUI_RADIUS + m.radius - 10) {
            createExplosion(state.particles, m.x, m.y, COIN_COLORS[m.type].primary, 14);
            state.meteors.splice(i, 1);
            state.hp = Math.max(0, state.hp - 10);
            state.suiShake = { x: 0, y: 0, timer: 20 };
            state.screenShake = { x: 0, y: 0, timer: 15 };
            playHitSound();
            if (state.hp <= 0) {
              state.gameOver = true;
              // Save high score
              if (state.score > state.highScore) {
                state.highScore = state.score;
                localStorage.setItem("dogSuiDefenderHighScore", state.score.toString());
              }
              // Save score to leaderboard
              const name = playerNameRef.current || "Player";
              addScoreToLeaderboard(name, state.score);
              setTopPlayers(getTopPlayers());
              gamePhaseRef.current = "gameover";
              setGamePhase("gameover");
              stopMusic();
            }
          }
        }

        // Update boss (both phases)
        if (state.boss && !state.bossDefeated) {
          const boss = state.boss;
          boss.rotation += boss.rotSpeed;
          boss.attackTimer++;
          
          // Boss movement - orbits around center
          if (boss.y < 150) {
            boss.y += boss.vy;
          } else {
            // Orbit pattern
            const orbitSpeed = boss.type === "PEPE_KING" ? 0.006 : 0.01;
            const orbitRadius = boss.type === "PEPE_KING" ? 180 : 220;
            const angle = Date.now() * orbitSpeed;
            boss.x = CENTER_X + Math.cos(angle) * orbitRadius;
            boss.y = 150 + Math.sin(angle) * 50;
          }
          
          // Boss spawns minions periodically
          const spawnRate = boss.type === "PEPE_KING" ? 150 : 100;
          if (boss.attackTimer % spawnRate === 0) {
            // Spawn minions based on phase
            const count = boss.type === "PEPE_KING" ? 2 : 3;
            const phase = boss.type === "PEPE_KING" ? 1 : 2;
            for (let i = 0; i < count; i++) {
              const minion = spawnMeteor(state.nextMeteorId++, phase);
              minion.x = boss.x + (Math.random() - 0.5) * 100;
              minion.y = boss.y + (Math.random() - 0.5) * 100;
              state.meteors.push(minion);
            }
          }
          
          // Boss fires projectiles at SUI - not too often, not too strong
          const projectileRate = boss.type === "PEPE_KING" ? 80 : 60; // PEPE slower, BONK faster
          if (boss.attackTimer % projectileRate === 0 && boss.y > 100) {
            const projectile = spawnBossProjectile(state.nextMeteorId++, boss.x, boss.y, boss.type);
            state.bossProjectiles.push(projectile);
          }
          
          // Check if waves hit boss
          for (let i = state.waves.length - 1; i >= 0; i--) {
            const w = state.waves[i];
            const dx = boss.x - w.x;
            const dy = boss.y - w.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ringThickness = w.strong ? 20 : 12;
            
            if (Math.abs(dist - w.radius) < ringThickness + boss.radius) {
              const damage = w.strong ? 25 : 10;
              boss.hp -= damage;
              const bossColor = boss.type === "PEPE_KING" ? "#00FF88" : "#FF6B35";
              createExplosion(state.particles, boss.x, boss.y, bossColor, 30);
              state.bgFlash = { color: bossColor, alpha: 0.3 };
              state.screenShake = { x: 0, y: 0, timer: 10 };
              
              // Score for hitting boss
              state.score += damage;
              state.scorePopups.push({
                x: boss.x,
                y: boss.y - boss.radius,
                value: damage,
                life: 1,
                maxLife: 1,
                color: bossColor,
              });
              
              if (boss.hp <= 0) {
                // Boss defeated!
                state.bossDefeated = true;
                const bonus = boss.type === "PEPE_KING" ? 500 : 1000; // Higher bonus for tougher boss
                state.score += bonus;
                createExplosion(state.particles, boss.x, boss.y, bossColor, 100);
                state.bgFlash = { color: bossColor, alpha: 0.8 };
                state.screenShake = { x: 0, y: 0, timer: 30 };
                state.boss = null;
              }
              break;
            }
          }
          
          // Update boss projectiles
          for (let i = state.bossProjectiles.length - 1; i >= 0; i--) {
            const proj = state.bossProjectiles[i];
            proj.x += proj.vx;
            proj.y += proj.vy;
            
            // Check collision with SUI
            const dx = proj.x - CENTER_X;
            const dy = proj.y - CENTER_Y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < SUI_RADIUS + proj.radius) {
              // Hit SUI - deal damage
              state.hp -= proj.damage;
              createExplosion(state.particles, proj.x, proj.y, proj.color, 10);
              state.suiShake = { x: 0, y: 0, timer: 8 };
              state.bgFlash = { color: proj.color, alpha: 0.2 };
              state.bossProjectiles.splice(i, 1);
              
              if (state.hp <= 0) {
                state.hp = 0;
                state.gameOver = true;
              }
              continue;
            }
            
            // Remove if off screen
            if (proj.x < -50 || proj.x > WIDTH + 50 || proj.y < -50 || proj.y > HEIGHT + 50) {
              state.bossProjectiles.splice(i, 1);
            }
          }
        }
      }

      // Draw meteors
      for (const m of state.meteors) {
        drawMeteor(ctx, m);
      }

      // Draw boss (both phases)
      if (state.boss && !state.bossDefeated) {
        drawBoss(ctx, state.boss);
        
        // Draw boss projectiles
        for (const proj of state.bossProjectiles) {
          ctx.save();
          ctx.translate(proj.x, proj.y);
          
          // Glow effect
          ctx.shadowColor = proj.color;
          ctx.shadowBlur = 15;
          
          // Outer ring
          ctx.beginPath();
          ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
          ctx.fillStyle = proj.color;
          ctx.fill();
          
          // Inner core (darker)
          ctx.beginPath();
          ctx.arc(0, 0, proj.radius * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fill();
          
          ctx.restore();
        }
        
        // Boss HP bar - larger and more prominent
        const barW = 400;
        const barH = 28;
        const barX = CENTER_X - barW / 2;
        const barY = HEIGHT - 60;
        
        // Boss colors based on type
        const bossColor = state.boss.type === "PEPE_KING" ? "#00FF88" : "#FF6B35";
        const bossColor2 = state.boss.type === "PEPE_KING" ? "#00A86B" : "#FFA500";
        const bossName = state.boss.type === "PEPE_KING" ? "👑 PEPE KING" : "🔥 BONK BOSS";
        
        // Background with glow
        ctx.shadowColor = bossColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(barX - 8, barY - 25, barW + 16, barH + 35, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Boss name
        ctx.fillStyle = bossColor;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(bossName, CENTER_X, barY - 20);
        
        // HP bar background
        ctx.fillStyle = "rgba(50,50,50,0.8)";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();
        
        // HP bar fill with gradient
        const hpFrac = state.boss.hp / state.boss.maxHp;
        const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW * hpFrac, 0);
        hpGrad.addColorStop(0, bossColor);
        hpGrad.addColorStop(0.5, bossColor2);
        hpGrad.addColorStop(1, bossColor);
        ctx.fillStyle = hpGrad;
        ctx.shadowColor = bossColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * hpFrac, barH, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Border
        ctx.strokeStyle = bossColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.stroke();
        
        // HP text - show actual numbers
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${state.boss.hp} / ${state.boss.maxHp} HP`, CENTER_X, barY + barH / 2);
        
        // Damage indicator (how much damage each attack does)
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "10px monospace";
        ctx.fillText("Simple: -10 HP  |  Strong: -25 HP", CENTER_X, barY + barH + 8);
      }

      // Draw SUI coin
      drawSUI(ctx, state);

      // Draw waves (and handle hit detection)
      if (phase === "playing") {
        drawWaves(ctx, state);
      } else {
        // Still draw existing waves even when paused (cosmetic)
        for (const w of state.waves) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
          const waveColor = w.strong ? "#ff8800" : "#00ffcc";
          ctx.strokeStyle = waveColor;
          ctx.lineWidth = w.strong ? 4 : 2.5;
          ctx.globalAlpha = w.alpha * 0.9;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw power-ups
      for (const p of state.powerUps) {
        const colors: Record<PowerUpType, string> = {
          shield: "#00ffff",
          speed: "#ffff00",
          multiplier: "#ff00ff",
          heal: "#00ff00",
        };
        const icons: Record<PowerUpType, string> = {
          shield: "🛡",
          speed: "⚡",
          multiplier: "×2",
          heal: "❤",
        };
        ctx.save();
        ctx.translate(p.x, p.y);
        
        // Glow
        ctx.shadowColor = colors[p.type];
        ctx.shadowBlur = 15 + Math.sin(p.pulse) * 5;
        
        // Circle
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + Math.sin(p.pulse) * 3, 0, Math.PI * 2);
        ctx.fillStyle = colors[p.type] + "40";
        ctx.fill();
        ctx.strokeStyle = colors[p.type];
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Icon
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icons[p.type], 0, 0);
        
        ctx.restore();
      }

      // Draw shield effect if active
      const hasShield = state.activePowerUps.some(p => p.type === "shield");
      if (hasShield) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(CENTER_X, CENTER_Y, SUI_RADIUS + 30, 0, Math.PI * 2);
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#00ffff";
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.2;
        ctx.stroke();
        ctx.restore();
      }

      // Draw particles
      drawParticles(ctx, state.particles);

      // Draw score popups
      drawScorePopups(ctx, state.scorePopups);

      // Draw HUD
      if (phase !== "start") {
        drawHUD(ctx, state);
      }

      // Draw crosshair
      if (phase === "playing" || phase === "paused") {
        const charging = state.mouseDownTime !== null;
        drawCrosshair(ctx, state.mouseX, state.mouseY, charging, state.chargeProgress);
      }

      // Overlays
      if (phase === "paused") {
        drawPauseOverlay(ctx);
      } else if (phase === "gameover") {
        drawGameOver(ctx, state);
      }

      ctx.restore(); // Restore from screen shake transform

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    // Keyboard shortcut for pause
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        togglePause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [handleMouseDown, handleMouseUp, handleContextMenu, togglePause, restartGame]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-[#020408]"
      style={{ cursor: "none" }}
    >
      <div style={{ position: "relative", display: "inline-block" }}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{
            maxWidth: "100%",
            maxHeight: "100vh",
            display: "block",
            cursor: "none",
            borderRadius: "16px",
            border: "1px solid rgba(0,200,255,0.2)",
            boxShadow: "0 0 60px rgba(0,200,255,0.15), 0 0 120px rgba(0,100,200,0.1)",
          }}
        />

        {/* Login screen overlay */}
        {gamePhase === "login" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              background: "rgba(2,4,8,0.95)",
              gap: "24px",
            }}
          >
            {/* Title */}
            <div style={{ textAlign: "center" }}>
              {/* Logo do jogo */}
              <div style={{ marginBottom: "16px" }}>
                <img
                  src="https://ipfs.io/ipfs/QmaF3N8z338Z3x8z3x8z3x8z3x8z3x8z3x8z3x8z3x8z3"
                  alt="DOGSUI-DEFENDER Logo"
                  style={{ width: "200px", height: "200px", objectFit: "contain" }}
                />
              </div>
              <div
                style={{
                  fontSize: "42px",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "#00c8ff",
                  textShadow: "0 0 30px #00c8ff, 0 0 60px #0088cc",
                  letterSpacing: "4px",
                  marginBottom: "8px",
                }}
              >
                ⚡ DogSui Defender ⚡
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace", fontSize: "14px" }}>
                Digite seu nome para começar
              </div>
            </div>

            {/* Login form */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                placeholder="Seu nome de jogador"
                maxLength={20}
                autoFocus
                style={{
                  width: "280px",
                  padding: "14px 20px",
                  fontSize: "18px",
                  fontFamily: "monospace",
                  background: "rgba(0,200,255,0.1)",
                  border: "2px solid rgba(0,200,255,0.4)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  outline: "none",
                  textAlign: "center",
                  textShadow: "0 0 10px rgba(0,200,255,0.5)",
                }}
              />
              <button
                onClick={handleLogin}
                style={{
                  padding: "14px 48px",
                  fontSize: "18px",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  background: "linear-gradient(135deg, #00c8ff, #0066cc)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  boxShadow: "0 0 24px rgba(0,200,255,0.5)",
                  letterSpacing: "2px",
                  transition: "transform 0.1s, box-shadow 0.1s",
                }}
                onMouseEnter={e => {
                  (e.target as HTMLButtonElement).style.transform = "scale(1.06)";
                  (e.target as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(0,200,255,0.8)";
                }}
                onMouseLeave={e => {
                  (e.target as HTMLButtonElement).style.transform = "scale(1)";
                  (e.target as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(0,200,255,0.5)";
                }}
              >
                🎮 ENTRAR
              </button>
            </div>

            {/* Leaderboard preview */}
            {topPlayers.length > 0 && (
              <div
                style={{
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.3)",
                  borderRadius: "12px",
                  padding: "16px 24px",
                  textAlign: "center",
                  fontFamily: "monospace",
                }}
              >
                <div style={{ color: "#ffd700", fontWeight: "bold", fontSize: "16px", marginBottom: "12px" }}>
                  🏆 TOP PLAYERS
                </div>
                {topPlayers.map((player, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "24px",
                      padding: "4px 0",
                      color: idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "rgba(255,255,255,0.7)",
                      fontSize: "14px",
                    }}
                  >
                    <span>{idx + 1}. {player.name}</span>
                    <span>${player.score.toLocaleString()} SUI</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Start screen overlay */}
        {gamePhase === "start" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              background: "rgba(2,4,8,0.88)",
              gap: "18px",
            }}
          >
            {/* Title */}
            <div style={{ textAlign: "center" }}>
              {/* Logo do jogo */}
              <div style={{ marginBottom: "16px" }}>
                <img
                  src="https://ipfs.io/ipfs/QmaF3N8z338Z3x8z3x8z3x8z3x8z3x8z3x8z3x8z3x8z3"
                  alt="DogSui Defender Logo"
                  style={{ width: "200px", height: "200px", objectFit: "contain" }}
                />
              </div>
              <div
                style={{
                  fontSize: "46px",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "#00c8ff",
                  textShadow: "0 0 30px #00c8ff, 0 0 60px #0088cc",
                  letterSpacing: "4px",
                  marginBottom: "6px",
                }}
              >
                ⚡ DogSui Defender ⚡
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "monospace", fontSize: "13px" }}>
                Protect the SUI coin from crypto meteors!
              </div>
              <div style={{ color: "rgba(255,165,0,0.8)", fontFamily: "monospace", fontSize: "11px", marginTop: "8px", letterSpacing: "1px" }}>
                🚧 PROJECT UNDER DEVELOPMENT — PROTOTYPE 🚧
              </div>
            </div>

            {/* Instructions box */}
            <div
              style={{
                background: "rgba(0,200,255,0.06)",
                border: "1px solid rgba(0,200,255,0.2)",
                borderRadius: "12px",
                padding: "16px 28px",
                color: "rgba(255,255,255,0.75)",
                fontFamily: "monospace",
                fontSize: "13px",
                lineHeight: "2",
                textAlign: "center",
              }}
            >
              <div style={{ color: "#00ffcc", fontWeight: "bold", marginBottom: "4px", fontSize: "14px" }}>
                🎮 HOW TO PLAY
              </div>
              <div>🖱️ <b>Click anywhere</b> — Wave attack <span style={{ color: "#00ffcc" }}>(-10 SUI)</span></div>
              <div>🖱️ <b>Hold 2s</b> — Strong wave (covers entire screen!) <span style={{ color: "#ff8800" }}>(-30 SUI)</span></div>
              <div>⌨️ <b>P / Esc</b> — Pause</div>
              <div>💥 Each meteor hit = <span style={{ color: "#ff4466" }}>-10% HP</span></div>
              <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                💰 Phase I: BTC <span style={{ color: "#F7931A" }}>+50</span> · ETH <span style={{ color: "#627EEA" }}>+30</span> · SOL <span style={{ color: "#9945FF" }}>+20</span> · PEPE <span style={{ color: "#00A86B" }}>+40</span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                💰 Phase II: DOGE <span style={{ color: "#C2A633" }}>+60</span> · SHIB <span style={{ color: "#FFA409" }}>+70</span> · BONK <span style={{ color: "#FF6B35" }}>+55</span> · WIF <span style={{ color: "#A855F7" }}>+80</span>
              </div>
              <div style={{ color: "rgba(255,215,0,0.8)", fontSize: "12px", marginTop: "4px" }}>
                👑 Reach 1500 SUI to face the DOGE BOSS!
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
                Starting balance: <span style={{ color: "#ffd700" }}>100 SUI</span>
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={startGame}
              style={{
                padding: "14px 52px",
                fontSize: "20px",
                fontWeight: "bold",
                fontFamily: "monospace",
                background: "linear-gradient(135deg, #00c8ff, #0066cc)",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                boxShadow: "0 0 24px rgba(0,200,255,0.5)",
                letterSpacing: "2px",
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.06)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(0,200,255,0.8)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(0,200,255,0.5)";
              }}
            >
              🚀 JOGAR
            </button>

            {/* Leaderboard */}
            {topPlayers.length > 0 && (
              <div
                style={{
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.3)",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  textAlign: "center",
                  fontFamily: "monospace",
                }}
              >
                <div style={{ color: "#ffd700", fontWeight: "bold", fontSize: "14px", marginBottom: "8px" }}>
                  🏆 RANKING
                </div>
                {topPlayers.slice(0, 3).map((player, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "24px",
                      padding: "2px 0",
                      color: idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : "#cd7f32",
                      fontSize: "12px",
                    }}
                  >
                    <span>{idx + 1}. {player.name}</span>
                    <span>${player.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {/* SUI memecoin promo */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(0,200,255,0.12), rgba(153,69,255,0.12))",
                border: "1px solid rgba(0,200,255,0.3)",
                borderRadius: "10px",
                padding: "10px 24px",
                textAlign: "center",
                fontFamily: "monospace",
              }}
            >
              <div style={{ color: "#ffd700", fontWeight: "bold", fontSize: "14px", letterSpacing: "1px" }}>
                🚀 SUIMEMECOIN — EM BREVE!
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", marginTop: "4px" }}>
                Siga o perfil no X para não perder o lançamento →{" "}
                <a
                  href="https://x.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#00c8ff", textDecoration: "none", fontWeight: "bold" }}
                >
                  @suimemecoin
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Pause button (visible during play) - moved to bottom left to avoid HP bar overlap */}
        {(gamePhase === "playing" || gamePhase === "paused") && (
          <button
            onClick={togglePause}
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: "bold",
              fontFamily: "monospace",
              background: gamePhase === "paused"
                ? "rgba(0,200,255,0.25)"
                : "rgba(0,0,0,0.45)",
              color: "#00c8ff",
              border: "1px solid rgba(0,200,255,0.4)",
              borderRadius: "6px",
              cursor: "pointer",
              backdropFilter: "blur(4px)",
              zIndex: 10,
              letterSpacing: "1px",
            }}
          >
            {gamePhase === "paused" ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
        )}

        {/* Phase Complete overlay */}
        {gamePhase === "phasecomplete" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              background: "rgba(0,50,30,0.85)",
              gap: "24px",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "42px",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "#FFD700",
                  textShadow: "0 0 30px #FFD700, 0 0 60px #FFA500",
                  letterSpacing: "3px",
                  marginBottom: "12px",
                }}
              >
                🏆 VICTORY! 🏆
              </div>
              <div style={{ color: "#00ff88", fontFamily: "monospace", fontSize: "20px", fontWeight: "bold" }}>
                All Phases Complete!
              </div>
              <div style={{ color: "#ffd700", fontFamily: "monospace", fontSize: "28px", fontWeight: "bold", marginTop: "8px" }}>
                Final Score: ${finalScore.toLocaleString()} SUI
              </div>
            </div>
            <div
              style={{
                background: "rgba(255,215,0,0.1)",
                border: "1px solid rgba(255,215,0,0.3)",
                borderRadius: "12px",
                padding: "20px 32px",
                textAlign: "center",
                fontFamily: "monospace",
              }}
            >
              <div style={{ color: "#FFD700", fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
                🎉 You defeated the DOGE BOSS! 🎉
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                SUI is safe from the meme invasion!
              </div>
            </div>
            <button
              onClick={restartGame}
              style={{
                padding: "14px 48px",
                fontSize: "18px",
                fontWeight: "bold",
                fontFamily: "monospace",
                background: "linear-gradient(135deg, #FFD700, #FFA500)",
                color: "#000000",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                boxShadow: "0 0 24px rgba(255,215,0,0.6)",
                letterSpacing: "2px",
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.06)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(255,215,0,0.9)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(255,215,0,0.6)";
              }}
            >
              🔄 PLAY AGAIN
            </button>
          </div>
        )}

        {/* Game Over overlay with restart button */}
        {gamePhase === "gameover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              gap: "20px",
              pointerEvents: "none",
            }}
          >
            {/* Spacer to push button below the canvas-drawn text */}
            <div style={{ height: "120px" }} />
            <button
              onClick={restartGame}
              style={{
                pointerEvents: "all",
                padding: "14px 48px",
                fontSize: "20px",
                fontWeight: "bold",
                fontFamily: "monospace",
                background: "linear-gradient(135deg, #ff4466, #cc0033)",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                boxShadow: "0 0 24px rgba(255,68,102,0.6)",
                letterSpacing: "2px",
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.06)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(255,68,102,0.9)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
                (e.target as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(255,68,102,0.6)";
              }}
            >
              🔄 PLAY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
