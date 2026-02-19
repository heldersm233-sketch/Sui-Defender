"use client";

import { useEffect, useRef } from "react";

const WIDTH = 800;
const HEIGHT = 600;
const PLAYER_SIZE = 50;
const PLAYER_SPEED = 5;
const FPS = 60;

interface PlayerState {
  x: number;
  y: number;
  speed: number;
}

interface KeysPressed {
  ArrowLeft: boolean;
  ArrowRight: boolean;
  ArrowUp: boolean;
  ArrowDown: boolean;
  a: boolean;
  d: boolean;
  w: boolean;
  s: boolean;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerState>({
    x: WIDTH / 2 - PLAYER_SIZE / 2,
    y: HEIGHT / 2 - PLAYER_SIZE / 2,
    speed: PLAYER_SPEED,
  });
  const keysRef = useRef<KeysPressed>({
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    a: false,
    d: false,
    w: false,
    s: false,
  });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key as keyof KeysPressed;
      if (key in keysRef.current) {
        keysRef.current[key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key as keyof KeysPressed;
      if (key in keysRef.current) {
        keysRef.current[key] = false;
      }
    };

    const updatePlayer = () => {
      const player = playerRef.current;
      const keys = keysRef.current;

      if (keys.ArrowLeft || keys.a) player.x -= player.speed;
      if (keys.ArrowRight || keys.d) player.x += player.speed;
      if (keys.ArrowUp || keys.w) player.y -= player.speed;
      if (keys.ArrowDown || keys.s) player.y += player.speed;

      // Limitar dentro do canvas
      player.x = Math.max(0, Math.min(WIDTH - PLAYER_SIZE, player.x));
      player.y = Math.max(0, Math.min(HEIGHT - PLAYER_SIZE, player.y));
    };

    const drawBackground = (ctx: CanvasRenderingContext2D) => {
      const bgGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bgGradient.addColorStop(0, "#0d0d1a");
      bgGradient.addColorStop(1, "#1a1a2e");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Grade de pontos decorativa
      ctx.fillStyle = "rgba(240, 192, 64, 0.08)";
      for (let gx = 0; gx < WIDTH; gx += 40) {
        for (let gy = 0; gy < HEIGHT; gy += 40) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D) => {
      const { x, y } = playerRef.current;

      const cx = x + PLAYER_SIZE / 2;
      const cy = y + PLAYER_SIZE / 2;
      const radius = PLAYER_SIZE / 2;

      // Sombra brilhante
      ctx.shadowColor = "#f0c040";
      ctx.shadowBlur = 15;

      // Corpo da moeda com gradiente
      const gradient = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, radius);
      gradient.addColorStop(0, "#ffe066");
      gradient.addColorStop(0.6, "#f0c040");
      gradient.addColorStop(1, "#b8860b");

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Borda
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Símbolo $ no centro
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7a5c00";
      ctx.font = `bold ${PLAYER_SIZE * 0.5}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", cx, cy);
    };

    const drawHUD = (ctx: CanvasRenderingContext2D) => {
      ctx.shadowColor = "#f0c040";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#f0c040";
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("🪙 MEMECOIN GAME", 16, 16);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "14px monospace";
      ctx.fillText("Use WASD ou ← ↑ ↓ → para mover", 16, HEIGHT - 30);
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

      updatePlayer();
      drawBackground(ctx);
      drawPlayer(ctx);
      drawHUD(ctx);

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d1a]">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="rounded-xl border-2 border-yellow-500/40 shadow-[0_0_40px_rgba(240,192,64,0.3)]"
        style={{ maxWidth: "100%", display: "block" }}
      />
    </div>
  );
}
