"use client";

import { useEffect, useRef, useCallback, useState } from "react";

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
};

const COIN_TYPES = ["BTC", "ETH", "SOL", "PEPE"] as const;
type CoinType = (typeof COIN_TYPES)[number];

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

interface GameState {
  score: number;
  hp: number; // 0–100
  meteors: Meteor[];
  particles: Particle[];
  scorePopups: ScorePopup[];
  waves: Wave[];
  mouseX: number;
  mouseY: number;
  bgFlash: { color: string; alpha: number } | null;
  stars: { x: number; y: number; r: number; brightness: number; twinkle: number }[];
  nextMeteorId: number;
  nextWaveId: number;
  spawnTimer: number;
  spawnInterval: number;
  gameOver: boolean;
  suiPulse: number;
  suiShake: { x: number; y: number; timer: number };
  paused: boolean;
  // Hold-to-charge state
  mouseDownTime: number | null; // timestamp when mouse was pressed
  chargeProgress: number; // 0–1 visual charge indicator
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

function startMusic() {
  if (musicRunning) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();

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
    const freqs: Record<CoinType, number> = { BTC: 200, ETH: 300, SOL: 400, PEPE: 250 };
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
};

// Score rewards per coin type
const COIN_SCORE: Record<CoinType, number> = {
  BTC: 50,
  ETH: 30,
  SOL: 20,
  PEPE: 40,
};

function spawnMeteor(id: number): Meteor {
  const type = COIN_TYPES[Math.floor(Math.random() * COIN_TYPES.length)];
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

/** Draw the SUI logo — the official water-drop / teardrop shape */
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gamePhase, setGamePhase] = useState<"start" | "playing" | "paused" | "gameover">("start");
  const gamePhaseRef = useRef<"start" | "playing" | "paused" | "gameover">("start");

  const stateRef = useRef<GameState>({
    score: 100,
    hp: 100,
    meteors: [],
    particles: [],
    scorePopups: [],
    waves: [],
    mouseX: CENTER_X,
    mouseY: CENTER_Y,
    bgFlash: null,
    stars: generateStars(),
    nextMeteorId: 0,
    nextWaveId: 0,
    spawnTimer: 0,
    spawnInterval: 80,
    gameOver: false,
    suiPulse: 0,
    suiShake: { x: 0, y: 0, timer: 0 },
    paused: false,
    mouseDownTime: null,
    chargeProgress: 0,
  });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const resetState = useCallback(() => {
    const prev = stateRef.current;
    stateRef.current = {
      score: 100,
      hp: 100,
      meteors: [],
      particles: [],
      scorePopups: [],
      waves: [],
      mouseX: prev.mouseX,
      mouseY: prev.mouseY,
      bgFlash: null,
      stars: generateStars(),
      nextMeteorId: 0,
      nextWaveId: 0,
      spawnTimer: 0,
      spawnInterval: 80,
      gameOver: false,
      suiPulse: 0,
      suiShake: { x: 0, y: 0, timer: 0 },
      paused: false,
      mouseDownTime: null,
      chargeProgress: 0,
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
            const points = COIN_SCORE[m.type];
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
          }
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

      // Score
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`$${state.score.toLocaleString()} SUI`, 18, 16);
      ctx.shadowBlur = 0;

      // Title
      ctx.fillStyle = "rgba(0,200,255,0.85)";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚡ SUI DEFENDER ⚡", CENTER_X, 14);

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

      drawBackground(ctx, state, timestamp);

      if (phase === "playing") {
        // Spawn meteors — spawn 4-5 at a time
        state.spawnTimer++;
        if (state.spawnTimer >= state.spawnInterval) {
          state.spawnTimer = 0;
          // Spawn 4-5 meteors at once
          const count = 4 + Math.floor(Math.random() * 2); // 4 or 5
          for (let i = 0; i < count; i++) {
            state.meteors.push(spawnMeteor(state.nextMeteorId++));
          }
          state.spawnInterval = Math.max(40, state.spawnInterval - 0.3);
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
          if (dist < SUI_RADIUS + m.radius - 10) {
            createExplosion(state.particles, m.x, m.y, COIN_COLORS[m.type].primary, 14);
            state.meteors.splice(i, 1);
            state.hp = Math.max(0, state.hp - 10);
            state.suiShake = { x: 0, y: 0, timer: 20 };
            playHitSound();
            if (state.hp <= 0) {
              state.gameOver = true;
              gamePhaseRef.current = "gameover";
              setGamePhase("gameover");
              stopMusic();
            }
          }
        }
      }

      // Draw meteors
      for (const m of state.meteors) {
        drawMeteor(ctx, m);
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
                ⚡ SUI DEFENDER ⚡
              </div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontFamily: "monospace", fontSize: "13px" }}>
                Proteja a moeda SUI dos meteoros cripto!
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
                🎮 COMO JOGAR
              </div>
              <div>🖱️ <b>Clique</b> em qualquer lugar — Onda de ataque <span style={{ color: "#00ffcc" }}>(-10 SUI)</span></div>
              <div>🖱️ <b>Segure 2s</b> — Onda forte (cobre toda a tela!) <span style={{ color: "#ff8800" }}>(-30 SUI)</span></div>
              <div>⌨️ <b>P / Esc</b> — Pausar</div>
              <div>💥 Cada meteoro que acerta = <span style={{ color: "#ff4466" }}>-10% HP</span></div>
              <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>
                💰 BTC <span style={{ color: "#F7931A" }}>+50</span> · ETH <span style={{ color: "#627EEA" }}>+30</span> · SOL <span style={{ color: "#9945FF" }}>+20</span> · PEPE <span style={{ color: "#00A86B" }}>+40</span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
                Saldo inicial: <span style={{ color: "#ffd700" }}>100 SUI</span>
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

        {/* Pause button (visible during play) */}
        {(gamePhase === "playing" || gamePhase === "paused") && (
          <button
            onClick={togglePause}
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
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
