import { HABIT_COLORS } from "./habitColors";

const DURATION_MS = 2400;
const PARTICLES = 150;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
}

/**
 * A short burst of confetti over the page. Decorative only (hidden from screen readers; callers
 * announce the reason separately) and skipped entirely when the user prefers reduced motion.
 */
export function launchConfetti(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  // Two bursts from the lower corners, angled up and inwards.
  const particles: Particle[] = Array.from({ length: PARTICLES }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.8;
    const speed = 9 + Math.random() * 9;
    return {
      x: fromLeft ? 0 : width,
      y: height * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      width: 6 + Math.random() * 4,
      height: 8 + Math.random() * 6,
      color: HABIT_COLORS[i % HABIT_COLORS.length]!.value,
    };
  });

  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const elapsed = now - start;
    const step = Math.min((now - last) / 16.7, 3); // frames at 60fps since last draw
    last = now;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
    for (const p of particles) {
      p.vy += 0.35 * step; // gravity
      p.vx *= 0.99;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
  // Animation frames pause in hidden tabs; make sure the canvas never lingers.
  setTimeout(() => canvas.remove(), DURATION_MS + 1000);
}
