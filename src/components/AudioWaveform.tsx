/**
 * AudioWaveform — Premium compact waveform strip.
 *
 * Renders a symmetric set of frequency bars + oscilloscope line.
 * Reacts to real audio metrics. Compact height for clean layout.
 */
import React, { useEffect, useRef } from "react";
import { AudioMetrics, JarvisSystemState } from "../types/jarvis";

interface AudioWaveformProps {
  systemState: JarvisSystemState;
  sampleAudioMetrics: () => AudioMetrics;
}

const WAVE_COLORS: Record<
  JarvisSystemState,
  { bar: string; line: string; glow: string }
> = {
  CONNECTING:       { bar: "rgba(100,116,139,0.4)",  line: "rgba(100,116,139,0.5)",  glow: "rgba(56,189,248,0.1)" },
  READY:            { bar: "rgba(6,182,212,0.5)",    line: "rgba(6,182,212,0.65)",   glow: "rgba(6,182,212,0.2)" },
  LISTENING:        { bar: "rgba(34,211,238,0.55)",  line: "rgba(34,211,238,0.7)",   glow: "rgba(6,182,212,0.25)" },
  "USER SPEAKING":  { bar: "rgba(45,212,191,0.75)",  line: "rgba(45,212,191,0.9)",   glow: "rgba(20,184,166,0.35)" },
  THINKING:         { bar: "rgba(251,191,36,0.65)",  line: "rgba(251,191,36,0.8)",   glow: "rgba(245,158,11,0.3)" },
  "JARVIS SPEAKING":{ bar: "rgba(56,189,248,0.7)",   line: "rgba(103,232,249,0.85)", glow: "rgba(14,165,233,0.4)" },
  ERROR:            { bar: "rgba(248,113,113,0.5)",  line: "rgba(248,113,113,0.65)", glow: "rgba(239,68,68,0.2)" },
};

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  systemState,
  sampleAudioMetrics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<JarvisSystemState>(systemState);
  const phaseRef = useRef(0);

  useEffect(() => {
    stateRef.current = systemState;
  }, [systemState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;

    const render = () => {
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
      const c = WAVE_COLORS[state] ?? WAVE_COLORS.LISTENING;
      const metrics = sampleAudioMetrics();
      const cy = H / 2;

      // Phase advance
      const speedMul =
        state === "THINKING" ? 0.13
        : state === "JARVIS SPEAKING" ? 0.07
        : state === "USER SPEAKING" ? 0.08
        : 0.035;
      phaseRef.current += speedMul + metrics.activeLevel * 0.08;
      const phase = phaseRef.current;

      // ── Symmetric frequency bars ────────────────────────────────────────────
      const numBars = 28;
      const totalW = Math.min(W * 0.78, 260);
      const startX = (W - totalW) / 2;
      const stepX = totalW / numBars;
      const barW = Math.max(1.5, stepX * 0.42);

      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 6;

      for (let i = 0; i < numBars; i++) {
        const dist = Math.abs(i - (numBars - 1) / 2) / (numBars / 2);
        const binIdx = Math.min(63, Math.floor(dist * 40));
        const binVal = metrics.frequencyBins[binIdx] / 255.0;
        const env = Math.cos(dist * Math.PI * 0.5);

        let bh: number;
        if (state === "THINKING") {
          bh = 2 + (Math.sin(phase * 1.9 + dist * 5) * 0.5 + 0.5) * 14 * env;
        } else if (state === "CONNECTING") {
          bh = 2 + Math.sin(phase * 0.8 + i * 0.5) * 2 * env;
        } else {
          const idle = (Math.sin(phase + i * 0.38) * 0.5 + 0.5) * 2 * env;
          bh = Math.max(1.5, idle + binVal * H * 0.72 * env);
        }

        const x = startX + i * stepX + (stepX - barW) / 2;
        const y = cy - bh / 2;

        ctx.fillStyle = c.bar;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 1.5);
        ctx.fill();
      }

      // ── Oscilloscope line ───────────────────────────────────────────────────
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1.2;

      const td = metrics.timeDomainData;
      for (let i = 0; i < td.length; i++) {
        const x = (i / (td.length - 1)) * W;
        const nx = (i / (td.length - 1)) * 2 - 1;
        const win = Math.max(0, 1 - nx * nx * 0.8);
        const sample = (td[i] - 128) / 128.0;
        const synth = Math.sin(phase * 1.2 + i * 0.1) * (state === "THINKING" ? 0.18 : 0.03);
        const y = cy + (sample * 0.8 + synth) * H * 0.38 * win;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [sampleAudioMetrics]);

  return (
    <div className="w-full h-9 sm:h-10 flex items-center justify-center pointer-events-none opacity-80">
      <canvas ref={canvasRef} className="w-full h-full block" aria-hidden="true" />
    </div>
  );
};
