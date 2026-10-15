/**
 * JarvisOrb — Premium AI visualization component.
 *
 * Replaces the heavy Three.js canvas with a lightweight pure-CSS + Canvas orb
 * that reacts to real audio state. All audio data comes from the existing
 * sampleAudioMetrics() hook — zero architectural changes to the backend.
 *
 * Design language: deep navy glass sphere, silver rim, soft ambient glow.
 * State-driven: color, pulse, and intensity respond to JARVIS system state.
 */
import React, { useEffect, useRef, useCallback } from "react";
import { AudioMetrics, JarvisSystemState } from "../types/jarvis";

interface JarvisOrbProps {
  systemState: JarvisSystemState;
  sampleAudioMetrics: () => AudioMetrics;
  onOrbClick?: () => void;
}

// State-driven palette
const STATE_PALETTE: Record<
  JarvisSystemState,
  {
    core: [string, string, string]; // inner gradient stops
    glow: string;
    glowSize: number;
    pulseSpeed: number;
    pulseAmp: number;
    rimColor: string;
  }
> = {
  CONNECTING: {
    core: ["#0f2744", "#1a3a5c", "#1e4976"],
    glow: "rgba(30, 100, 160, 0.4)",
    glowSize: 120,
    pulseSpeed: 1.2,
    pulseAmp: 0.015,
    rimColor: "rgba(180,210,240,0.35)",
  },
  READY: {
    core: ["#0c2340", "#12355a", "#1a5080"],
    glow: "rgba(6, 140, 200, 0.5)",
    glowSize: 140,
    pulseSpeed: 0.8,
    pulseAmp: 0.01,
    rimColor: "rgba(160,220,255,0.5)",
  },
  LISTENING: {
    core: ["#0a1f3d", "#10355f", "#1a5a90"],
    glow: "rgba(14, 165, 233, 0.55)",
    glowSize: 150,
    pulseSpeed: 1.0,
    pulseAmp: 0.02,
    rimColor: "rgba(140,220,255,0.6)",
  },
  "USER SPEAKING": {
    core: ["#082e3a", "#0e4a56", "#156a76"],
    glow: "rgba(20, 184, 166, 0.65)",
    glowSize: 175,
    pulseSpeed: 2.2,
    pulseAmp: 0.055,
    rimColor: "rgba(100,240,220,0.7)",
  },
  THINKING: {
    core: ["#251a04", "#3d2c06", "#5a3f09"],
    glow: "rgba(245, 158, 11, 0.55)",
    glowSize: 160,
    pulseSpeed: 3.0,
    pulseAmp: 0.04,
    rimColor: "rgba(255,210,100,0.55)",
  },
  "JARVIS SPEAKING": {
    core: ["#091e3a", "#0e2f60", "#1050a0"],
    glow: "rgba(56, 189, 248, 0.7)",
    glowSize: 180,
    pulseSpeed: 2.0,
    pulseAmp: 0.06,
    rimColor: "rgba(100,200,255,0.75)",
  },
  ERROR: {
    core: ["#2a0808", "#4a0c0c", "#6a1010"],
    glow: "rgba(239, 68, 68, 0.5)",
    glowSize: 110,
    pulseSpeed: 0.5,
    pulseAmp: 0.008,
    rimColor: "rgba(255,120,120,0.45)",
  },
};

export const JarvisOrb: React.FC<JarvisOrbProps> = ({
  systemState,
  sampleAudioMetrics,
  onOrbClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<JarvisSystemState>(systemState);
  const timeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = systemState;
  }, [systemState]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    const delta = Math.min((now - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = now;
    timeRef.current += delta;
    const t = timeRef.current;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    if (
      canvas.width !== Math.floor(W * dpr) ||
      canvas.height !== Math.floor(H * dpr)
    ) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, W, H);

    const state = stateRef.current;
    const palette = STATE_PALETTE[state] || STATE_PALETTE.LISTENING;
    const metrics = sampleAudioMetrics();

    const cx = W / 2;
    const cy = H / 2;
    const baseR = Math.min(W, H) * 0.38;
    const audioBoost = metrics.activeLevel * 0.18 + metrics.bass * 0.1;
    const pulse = Math.sin(t * palette.pulseSpeed * Math.PI * 2) * palette.pulseAmp;
    const r = baseR * (1 + pulse + audioBoost);

    // ── Outer ambient glow halo ──────────────────────────────────────────────
    const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + palette.glowSize);
    haloGrad.addColorStop(0, palette.glow);
    haloGrad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, r + palette.glowSize, 0, Math.PI * 2);
    ctx.fillStyle = haloGrad;
    ctx.fill();

    // ── Deep glass interior gradient ─────────────────────────────────────────
    const interior = ctx.createRadialGradient(
      cx - r * 0.28,
      cy - r * 0.28,
      r * 0.04,
      cx,
      cy,
      r
    );
    interior.addColorStop(0, palette.core[2]); // lighter highlight
    interior.addColorStop(0.42, palette.core[1]);
    interior.addColorStop(1, palette.core[0]); // dark outer

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = interior;
    ctx.fill();

    // ── Subtle inner core brightness (audio reactive) ────────────────────────
    if (metrics.activeLevel > 0.02) {
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.65);
      const alpha = Math.min(0.35, metrics.activeLevel * 1.2 + metrics.bass * 0.3);
      coreGlow.addColorStop(0, `rgba(80,180,255,${alpha})`);
      coreGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = coreGlow;
      ctx.fill();
    }

    // ── Glass specular highlight (top-left) ──────────────────────────────────
    const specX = cx - r * 0.3;
    const specY = cy - r * 0.32;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, r * 0.52);
    specGrad.addColorStop(0, "rgba(255,255,255,0.22)");
    specGrad.addColorStop(0.4, "rgba(255,255,255,0.07)");
    specGrad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = specGrad;
    ctx.fill();

    // ── Small secondary specular spot (bottom-right depth) ───────────────────
    const spec2Grad = ctx.createRadialGradient(
      cx + r * 0.35,
      cy + r * 0.35,
      0,
      cx + r * 0.35,
      cy + r * 0.35,
      r * 0.28
    );
    spec2Grad.addColorStop(0, "rgba(100,180,255,0.1)");
    spec2Grad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = spec2Grad;
    ctx.fill();

    // ── Silver metallic rim ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = palette.rimColor;
    ctx.lineWidth = Math.max(1.5, r * 0.028);
    ctx.stroke();

    // ── Thin inner rim glow ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Audio frequency arc segments (visible only during activity) ──────────
    if (metrics.activeLevel > 0.015 || state === "THINKING") {
      const numArcs = 8;
      const arcR = r + 18 + metrics.activeLevel * 14;
      for (let i = 0; i < numArcs; i++) {
        const startAngle = (i / numArcs) * Math.PI * 2 + t * 0.6;
        const arcLen =
          (0.04 +
            (metrics.frequencyBins[Math.floor((i / numArcs) * 63)] / 255.0) *
              0.18) *
          Math.PI *
          2;

        ctx.beginPath();
        ctx.arc(cx, cy, arcR, startAngle, startAngle + arcLen);
        const arcAlpha = 0.15 + metrics.activeLevel * 0.5;
        ctx.strokeStyle =
          state === "THINKING"
            ? `rgba(251,191,36,${arcAlpha})`
            : state === "ERROR"
            ? `rgba(248,113,113,${arcAlpha})`
            : `rgba(56,189,248,${arcAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [sampleAudioMetrics]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onOrbClick}
      aria-label="JARVIS AI core visualization"
      role="img"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: onOrbClick ? "pointer" : "default",
      }}
    />
  );
};
