"use client";

import { useEffect, useRef, useCallback } from "react";

const WIDTH = 900;
const HEIGHT = 650;
const SUI_RADIUS = 55;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const FPS = 60;

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
    text: "#1a2a7a",
    glow: "#627EEA",
    bg: "rgba(98,126,234,0.18)",
  },
  SOL: {
    primary: "#9945FF",
    secondary: "#14F195",
    text: "#2a0060",
    glow: "#9945FF",
    bg: "rgba(153,69,255,0.18)",
  },
};

const COIN_TYPES = ["BTC", "ETH", "SOL"] as const;
type CoinType = (typeof COIN_TYPES)[number];

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
}

interface GameState {
  score: number;
  meteors: Meteor[];
  particles: Particle[];
  scorePopups: ScorePopup[];
  mouseX: number;
  mouseY: number;
  bgFlash: { color: string; alpha: number } | null;
  stars: { x: number; y: number; r: number; brightness: number; twinkle: number }[];
  nextMeteorId: number;
  spawnTimer: number;
  spawnInterval: number;
  gameOver: boolean;
  suiPulse: number;
  suiShake: { x: number; y: number; timer: number };
  lives: number;
}

// Web Audio context for sounds
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

function playShootSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

function playExplosionSound(coinType: CoinType) {
  try {
    const ctx = getAudioCtx();
    const freqs: Record<CoinType, number> = { BTC: 200, ETH: 300, SOL: 400 };
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
  const speed = 1.2 + Math.random() * 1.4;
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

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    score: 0,
    meteors: [],
    particles: [],
    scorePopups: [],
    mouseX: CENTER_X,
    mouseY: CENTER_Y,
    bgFlash: null,
    stars: generateStars(),
    nextMeteorId: 0,
    spawnTimer: 0,
    spawnInterval: 120,
    gameOver: false,
    suiPulse: 0,
    suiShake: { x: 0, y: 0, timer: 0 },
    lives: 3,
  });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const handleClick = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = stateRef.current;
    if (state.gameOver) {
      // Restart
      stateRef.current = {
        score: 0,
        meteors: [],
        particles: [],
        scorePopups: [],
        mouseX: state.mouseX,
        mouseY: state.mouseY,
        bgFlash: null,
        stars: generateStars(),
        nextMeteorId: 0,
        spawnTimer: 0,
        spawnInterval: 120,
        gameOver: false,
        suiPulse: 0,
        suiShake: { x: 0, y: 0, timer: 0 },
        lives: 3,
      };
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    playShootSound();

    // Check hit on meteors
    let hit = false;
    for (let i = state.meteors.length - 1; i >= 0; i--) {
      const m = state.meteors[i];
      const dx = mx - m.x;
      const dy = my - m.y;
      if (Math.sqrt(dx * dx + dy * dy) < m.radius + 8) {
        const coinColor = COIN_COLORS[m.type].primary;
        createExplosion(state.particles, m.x, m.y, coinColor, 22);
        state.bgFlash = { color: coinColor, alpha: 0.45 };
        const points = m.type === "BTC" ? 300 : m.type === "ETH" ? 200 : 150;
        state.score += points;
        state.scorePopups.push({ x: m.x, y: m.y - m.radius, value: points, life: 1, maxLife: 1 });
        playExplosionSound(m.type);
        state.meteors.splice(i, 1);
        hit = true;
        break;
      }
    }

    if (!hit) {
      // Miss flash
      createExplosion(state.particles, mx, my, "#ffffff", 5);
    }
  }, []);

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
    canvas.addEventListener("click", handleClick);

    const drawBackground = (ctx: CanvasRenderingContext2D, state: GameState, t: number) => {
      // Deep space gradient
      const bg = ctx.createRadialGradient(CENTER_X, CENTER_Y, 80, CENTER_X, CENTER_Y, WIDTH * 0.8);
      bg.addColorStop(0, "#0a0e1a");
      bg.addColorStop(0.5, "#060a14");
      bg.addColorStop(1, "#020408");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Stars
      for (const star of state.stars) {
        star.twinkle += 0.03;
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(star.twinkle + t * 0.001));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * star.brightness})`;
        ctx.fill();
      }

      // Nebula glow around center
      const nebula = ctx.createRadialGradient(CENTER_X, CENTER_Y, 60, CENTER_X, CENTER_Y, 280);
      nebula.addColorStop(0, "rgba(0,200,255,0.06)");
      nebula.addColorStop(0.5, "rgba(100,50,200,0.04)");
      nebula.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // BG flash on kill
      if (state.bgFlash && state.bgFlash.alpha > 0) {
        ctx.fillStyle = state.bgFlash.color.replace(")", `,${state.bgFlash.alpha})`).replace("rgb(", "rgba(").replace("#", "");
        // Use hex to rgba conversion
        const hex = state.bgFlash.color;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},${state.bgFlash.alpha})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        state.bgFlash.alpha -= 0.025;
        if (state.bgFlash.alpha <= 0) state.bgFlash = null;
      }
    };

    const drawSUI = (ctx: CanvasRenderingContext2D, state: GameState, t: number) => {
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

      // Outer glow rings
      for (let ring = 3; ring >= 1; ring--) {
        const ringR = SUI_RADIUS + pulse + ring * 14;
        const alpha = 0.06 / ring;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      // Orbit ring
      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS + 18 + pulse * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,200,255,0.15)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 10]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Shadow glow
      ctx.shadowColor = "#00c8ff";
      ctx.shadowBlur = 30 + pulse * 2;

      // Main coin body
      const grad = ctx.createRadialGradient(cx - 14, cy - 14, 6, cx, cy, SUI_RADIUS);
      grad.addColorStop(0, "#80eeff");
      grad.addColorStop(0.35, "#00c8ff");
      grad.addColorStop(0.7, "#0088cc");
      grad.addColorStop(1, "#004466");
      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Coin border
      ctx.strokeStyle = "#00eeff";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // SUI logo — stylized "S" wave shape
      ctx.save();
      ctx.translate(cx, cy);

      // Draw SUI symbol (stylized water drop / diamond)
      const s = SUI_RADIUS * 0.52;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // SUI logo approximation: two curved arcs forming the "sui" wave
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.7);
      ctx.bezierCurveTo(-s * 0.9, -s * 0.3, -s * 0.9, s * 0.1, 0, s * 0.1);
      ctx.bezierCurveTo(s * 0.9, s * 0.1, s * 0.9, s * 0.5, s * 0.5, s * 0.9);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s * 0.5, -s * 0.9);
      ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.9, -s * 0.1, 0, -s * 0.1);
      ctx.bezierCurveTo(-s * 0.9, -s * 0.1, -s * 0.9, s * 0.3, -s * 0.5, s * 0.7);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();

      // Shine highlight
      const shine = ctx.createRadialGradient(cx - SUI_RADIUS * 0.35, cy - SUI_RADIUS * 0.35, 2, cx - SUI_RADIUS * 0.2, cy - SUI_RADIUS * 0.2, SUI_RADIUS * 0.55);
      shine.addColorStop(0, "rgba(255,255,255,0.35)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, SUI_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();

      // "SUI" text label below
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

      // Glow
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 18;

      // Coin body
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

      // Symbol
      ctx.fillStyle = c.text;
      const symbols: Record<CoinType, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎" };
      ctx.font = `bold ${m.radius * 0.9}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(symbols[m.type], 0, 0);

      ctx.restore();
    };

    const drawCrosshair = (ctx: CanvasRenderingContext2D, mx: number, my: number) => {
      const size = 18;
      const gap = 6;
      ctx.save();
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 8;

      // Cross lines
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

      // Center dot
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff88";
      ctx.fill();

      // Outer circle
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,255,136,0.4)";
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
        ctx.fillStyle = "#ffd700";
        ctx.font = `bold ${16 + (1 - alpha) * 8}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 10;
        ctx.fillText(`+$${p.value}`, p.x, p.y);
        ctx.restore();
      }
    };

    const drawHUD = (ctx: CanvasRenderingContext2D, state: GameState) => {
      // Score
      ctx.save();
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`$${state.score.toLocaleString()}`, 18, 16);
      ctx.shadowBlur = 0;

      // Title
      ctx.fillStyle = "rgba(0,200,255,0.85)";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚡ SUI DEFENDER ⚡", CENTER_X, 14);

      // Lives
      ctx.textAlign = "right";
      ctx.fillStyle = "#ff4466";
      ctx.font = "bold 18px monospace";
      ctx.shadowColor = "#ff4466";
      ctx.shadowBlur = 8;
      ctx.fillText("❤️".repeat(state.lives), WIDTH - 16, 16);
      ctx.shadowBlur = 0;

      // Legend
      ctx.textAlign = "left";
      ctx.font = "12px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("Click to shoot!", 18, HEIGHT - 24);

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
      ctx.fillText("GAME OVER", CENTER_X, CENTER_Y - 60);

      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 32px monospace";
      ctx.fillText(`Final Score: $${state.score.toLocaleString()}`, CENTER_X, CENTER_Y + 10);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,200,255,0.9)";
      ctx.font = "20px monospace";
      ctx.fillText("Click to play again", CENTER_X, CENTER_Y + 70);

      ctx.restore();
    };

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

      drawBackground(ctx, state, timestamp);

      if (!state.gameOver) {
        // Spawn meteors
        state.spawnTimer++;
        if (state.spawnTimer >= state.spawnInterval) {
          state.spawnTimer = 0;
          state.meteors.push(spawnMeteor(state.nextMeteorId++));
          // Gradually increase difficulty
          state.spawnInterval = Math.max(40, state.spawnInterval - 0.3);
        }

        // Update meteors
        for (let i = state.meteors.length - 1; i >= 0; i--) {
          const m = state.meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          m.rotation += m.rotSpeed;

          // Check collision with SUI
          const dx = m.x - CENTER_X;
          const dy = m.y - CENTER_Y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < SUI_RADIUS + m.radius - 10) {
            // Hit!
            createExplosion(state.particles, m.x, m.y, COIN_COLORS[m.type].primary, 14);
            state.meteors.splice(i, 1);
            state.lives--;
            state.suiShake = { x: 0, y: 0, timer: 20 };
            playHitSound();
            if (state.lives <= 0) {
              state.gameOver = true;
            }
          }
        }
      }

      // Draw meteors
      for (const m of state.meteors) {
        drawMeteor(ctx, m);
      }

      // Draw SUI coin
      drawSUI(ctx, state, timestamp);

      // Draw particles
      drawParticles(ctx, state.particles);

      // Draw score popups
      drawScorePopups(ctx, state.scorePopups);

      // Draw HUD
      drawHUD(ctx, state);

      // Draw crosshair
      drawCrosshair(ctx, state.mouseX, state.mouseY);

      // Game over screen
      if (state.gameOver) {
        drawGameOver(ctx, state);
      }

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [handleClick]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-[#020408]"
      style={{ cursor: "none" }}
    >
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
    </div>
  );
}
