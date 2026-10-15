/**
 * IronManBlueprintHUD — Authentic Stark Industries J.A.R.V.I.S. Holographic Interface
 *
 * Faithfully matches the user's uploaded Iron Man Mark armor blueprint:
 * - Center: Iron Man wireframe blueprint bust with glowing audio-reactive eyes & chest Arc Reactor
 * - Left: Stark Industries logo, rotary blueprint gear schematic & J.A.R.V.I.S. circular HUD badge
 * - Right: Wireframe Mark suit schematics & live armor telemetry
 * - Interactive: Real-time audio reactive reactor pulsing, voice visualizer, mic toggle, voice selector
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  Settings2,
  MessageSquareText,
  Volume2,
  RotateCw,
  Zap,
  Activity,
  Cpu,
  Radio,
  Wifi,
} from "lucide-react";
import {
  AudioMetrics,
  JarvisSystemState,
  JarvisVoiceName,
} from "../types/jarvis";
import blueprintAsset from "../assets/jarvis-blueprint.png";

interface IronManBlueprintHUDProps {
  systemState: JarvisSystemState;
  sampleAudioMetrics: () => AudioMetrics;
  isMicMuted: boolean;
  needsUserGesture: boolean;
  voiceName: JarvisVoiceName;
  onToggleMic: () => void;
  onUnlockAudio: () => void;
  onReconnect: () => void;
  onInterrupt: () => void;
  onChangeVoice: (voice: JarvisVoiceName) => void;
  onToggleTranscript: () => void;
  isTranscriptOpen: boolean;
}

const VOICES: readonly JarvisVoiceName[] = [
  "Charon",
  "Fenrir",
  "Zephyr",
  "Puck",
  "Kore",
];

// Exact pixel coordinates in 1024 x 495 space from user's blueprint
const CHEST_REACTOR = { x: 509, y: 377, r: 65 };
const LEFT_EYE = { x: 476, y: 128, rx: 16, ry: 7 };
const RIGHT_EYE = { x: 542, y: 126, rx: 16, ry: 7 };
const JARVIS_BADGE = { x: 217, y: 377, r: 85 };

export function IronManBlueprintHUD({
  systemState,
  sampleAudioMetrics,
  isMicMuted,
  needsUserGesture,
  voiceName,
  onToggleMic,
  onUnlockAudio,
  onReconnect,
  onInterrupt,
  onChangeVoice,
  onToggleTranscript,
  isTranscriptOpen,
}: IronManBlueprintHUDProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [metricsSnapshot, setMetricsSnapshot] = useState({
    activeLevel: 0,
    bass: 0,
    mid: 0,
    treble: 0,
  });

  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const ringAngleRef = useRef(0);
  const rippleTimeRef = useRef(0);

  // Dynamic visual states derived from systemState
  const isListening = systemState === "LISTENING";
  const isUserSpeaking = systemState === "USER SPEAKING";
  const isThinking = systemState === "THINKING";
  const isJarvisSpeaking = systemState === "JARVIS SPEAKING";
  const isError = systemState === "ERROR";
  const isConnected = !isError && systemState !== "CONNECTING";

  // Fullscreen toggle handler
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignore fullscreen rejection
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        onToggleMic();
      } else if (e.code === "KeyT") {
        onToggleTranscript();
      } else if (e.code === "KeyF") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleMic, onToggleTranscript]);

  // Animation & Audio Reactive Loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const m = sampleAudioMetrics();

      // Faster HUD rotation when speaking or thinking
      const speedMult = isThinking ? 3.0 : isJarvisSpeaking || isUserSpeaking ? 2.2 : 0.7;
      ringAngleRef.current = (ringAngleRef.current + dt * 45 * speedMult) % 360;
      rippleTimeRef.current += dt * (isJarvisSpeaking ? 4.0 : 2.0);

      // Smooth metrics for SVG reactivity
      setMetricsSnapshot({
        activeLevel: m.activeLevel,
        bass: m.bass,
        mid: m.mid,
        treble: m.treble,
      });

      // Render audio spectrum strip onto the canvas inside the bottom dock
      const canvas = spectrumCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const bins = m.frequencyBins;
          const barCount = 28;
          const barWidth = canvas.width / barCount;

          for (let i = 0; i < barCount; i++) {
            const binIndex = Math.min(Math.floor((i / barCount) * 48), bins.length - 1);
            const val = bins[binIndex] || 0;
            // Synthesize subtle organic breathing when idle, or use real audio energy
            const idleAmp = isListening ? Math.sin(now * 0.0035 + i * 0.25) * 3 + 4 : 2;
            const barHeight = Math.max(2, (val / 255) * canvas.height * 0.88 + idleAmp);

            const x = i * barWidth;
            const y = canvas.height - barHeight;

            const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
            if (isError) {
              grad.addColorStop(0, "rgba(239, 68, 68, 0.9)");
              grad.addColorStop(1, "rgba(239, 68, 68, 0.2)");
            } else if (isUserSpeaking) {
              grad.addColorStop(0, "rgba(56, 189, 248, 0.95)");
              grad.addColorStop(1, "rgba(6, 182, 212, 0.25)");
            } else if (isJarvisSpeaking) {
              grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
              grad.addColorStop(1, "rgba(0, 229, 255, 0.3)");
            } else {
              grad.addColorStop(0, "rgba(0, 229, 255, 0.85)");
              grad.addColorStop(1, "rgba(0, 160, 220, 0.2)");
            }

            ctx.fillStyle = grad;
            ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [sampleAudioMetrics, isListening, isUserSpeaking, isThinking, isJarvisSpeaking, isError]);

  // Derived dynamic glow intensities
  const energy = metricsSnapshot.activeLevel;
  const reactorScale = 1 + energy * 0.35 + (isJarvisSpeaking ? 0.15 : 0);
  const reactorGlowOpacity = isError ? 0.9 : Math.min(1, 0.65 + energy * 0.7);
  const eyesGlowOpacity = isError ? 0.3 : Math.min(1, 0.75 + energy * 0.55 + (isJarvisSpeaking ? 0.25 : 0));

  const handleArcReactorClick = () => {
    if (needsUserGesture || isError) {
      onUnlockAudio();
    } else if (isJarvisSpeaking) {
      onInterrupt();
    } else {
      onToggleMic();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none flex items-center justify-center">
      {/* ── Background Blueprint Grid ─────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 229, 255, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 255, 0.3) 1px, transparent 1px),
            linear-gradient(rgba(0, 229, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 229, 255, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />

      {/* Holographic Scanline Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-screen"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 240, 255, 0.3) 3px, transparent 4px)",
        }}
      />

      {/* Radial Vignette to Blend Blueprint Edges Seamlessly into Black */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_90%_at_50%_50%,transparent_50%,rgba(0,0,0,0.85)_85%,#000000_100%)] z-10" />

      {/* ── Main Viewport — Exact 1024:495 Coordinate Frame ───────────────── */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          maxWidth: "100vw",
          maxHeight: "100vh",
          aspectRatio: "1024 / 495",
        }}
      >
        {/* Base High-Resolution Blueprint Image Asset */}
        <img
          src={blueprintAsset}
          alt="J.A.R.V.I.S. Iron Man Blueprint"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            filter: isError
              ? "hue-rotate(150deg) saturate(1.4) contrast(1.1)"
              : "contrast(1.06) brightness(1.02)",
            transition: "filter 0.5s ease",
          }}
        />

        {/* ── Interactive SVG Overlay (Aligned 1:1 on 1024x495 Coordinates) ── */}
        <svg
          viewBox="0 0 1024 495"
          className="absolute inset-0 w-full h-full pointer-events-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Arc Reactor Bloom Filter */}
            <filter id="reactor-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Eyes Visor Glow Filter */}
            <filter id="eyes-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="heavyBlur" />
              <feMerge>
                <feMergeNode in="heavyBlur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Radial Gradients for Arc Reactor Core */}
            <radialGradient id="reactor-core-grad">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="35%" stopColor="#38bdf8" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#00e5ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
            </radialGradient>
          </defs>

          {/* ── 1. Animated Visor Eyes (476, 128) & (542, 126) ───────────── */}
          <g filter="url(#eyes-glow)" opacity={eyesGlowOpacity}>
            {/* Left Eye Visor */}
            <ellipse
              cx={LEFT_EYE.x}
              cy={LEFT_EYE.y}
              rx={LEFT_EYE.rx}
              ry={LEFT_EYE.ry}
              fill={isError ? "#ef4444" : "#ffffff"}
              transform={`rotate(-4 ${LEFT_EYE.x} ${LEFT_EYE.y})`}
            />
            <ellipse
              cx={LEFT_EYE.x}
              cy={LEFT_EYE.y}
              rx={LEFT_EYE.rx * 1.3}
              ry={LEFT_EYE.ry * 1.5}
              fill={isError ? "rgba(239,68,68,0.4)" : "rgba(0, 229, 255, 0.45)"}
              transform={`rotate(-4 ${LEFT_EYE.x} ${LEFT_EYE.y})`}
            />

            {/* Right Eye Visor */}
            <ellipse
              cx={RIGHT_EYE.x}
              cy={RIGHT_EYE.y}
              rx={RIGHT_EYE.rx}
              ry={RIGHT_EYE.ry}
              fill={isError ? "#ef4444" : "#ffffff"}
              transform={`rotate(4 ${RIGHT_EYE.x} ${RIGHT_EYE.y})`}
            />
            <ellipse
              cx={RIGHT_EYE.x}
              cy={RIGHT_EYE.y}
              rx={RIGHT_EYE.rx * 1.3}
              ry={RIGHT_EYE.ry * 1.5}
              fill={isError ? "rgba(239,68,68,0.4)" : "rgba(0, 229, 255, 0.45)"}
              transform={`rotate(4 ${RIGHT_EYE.x} ${RIGHT_EYE.y})`}
            />
          </g>

          {/* ── 2. Chest Arc Reactor (509, 377) ───────────────────────────── */}
          <g
            className="cursor-pointer transition-transform duration-100"
            onClick={handleArcReactorClick}
            transform={`translate(${CHEST_REACTOR.x}, ${CHEST_REACTOR.y}) scale(${reactorScale}) translate(${-CHEST_REACTOR.x}, ${-CHEST_REACTOR.y})`}
          >
            {/* Outer Interactive Glow Ring */}
            <circle
              cx={CHEST_REACTOR.x}
              cy={CHEST_REACTOR.y}
              r={CHEST_REACTOR.r + 14}
              fill="none"
              stroke={isError ? "#ef4444" : "#00e5ff"}
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeOpacity={reactorGlowOpacity * 0.7}
              transform={`rotate(${ringAngleRef.current} ${CHEST_REACTOR.x} ${CHEST_REACTOR.y})`}
            />

            {/* Counter-rotating Inner Segment Ring */}
            <circle
              cx={CHEST_REACTOR.x}
              cy={CHEST_REACTOR.y}
              r={CHEST_REACTOR.r}
              fill="none"
              stroke={isError ? "#ef4444" : "#38bdf8"}
              strokeWidth="2"
              strokeDasharray="16 12 8 12"
              strokeOpacity={reactorGlowOpacity * 0.85}
              transform={`rotate(${-ringAngleRef.current * 1.4} ${CHEST_REACTOR.x} ${CHEST_REACTOR.y})`}
            />

            {/* Glowing Core Radial Bloom */}
            <circle
              cx={CHEST_REACTOR.x}
              cy={CHEST_REACTOR.y}
              r={36}
              fill="url(#reactor-core-grad)"
              filter="url(#reactor-glow)"
              opacity={reactorGlowOpacity}
            />

            {/* Center White Core Singularity */}
            <circle
              cx={CHEST_REACTOR.x}
              cy={CHEST_REACTOR.y}
              r={14}
              fill="#ffffff"
              filter="url(#reactor-glow)"
            />

            {/* Soundwave Energy Ripples */}
            {(isJarvisSpeaking || isUserSpeaking || energy > 0.3) && (
              <circle
                cx={CHEST_REACTOR.x}
                cy={CHEST_REACTOR.y}
                r={CHEST_REACTOR.r + (rippleTimeRef.current % 40)}
                fill="none"
                stroke={isJarvisSpeaking ? "#ffffff" : "#00f0ff"}
                strokeWidth="2"
                strokeOpacity={Math.max(0, 1 - (rippleTimeRef.current % 40) / 40)}
              />
            )}
          </g>

          {/* ── 3. Bottom-Left J.A.R.V.I.S. Badge HUD Rings (217, 377) ────── */}
          <g>
            <circle
              cx={JARVIS_BADGE.x}
              cy={JARVIS_BADGE.y}
              r={JARVIS_BADGE.r + 4}
              fill="none"
              stroke="#00e5ff"
              strokeWidth="1.2"
              strokeDasharray="6 8 18 8"
              strokeOpacity="0.65"
              transform={`rotate(${ringAngleRef.current * 0.7} ${JARVIS_BADGE.x} ${JARVIS_BADGE.y})`}
            />
            <circle
              cx={JARVIS_BADGE.x}
              cy={JARVIS_BADGE.y}
              r={JARVIS_BADGE.r - 8}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1"
              strokeDasharray="2 6"
              strokeOpacity="0.5"
              transform={`rotate(${-ringAngleRef.current * 0.5} ${JARVIS_BADGE.x} ${JARVIS_BADGE.y})`}
            />
          </g>
        </svg>
      </div>

      {/* ── Stark Holographic Top Status & Control Bar ───────────────────── */}
      <header className="absolute top-4 left-5 right-5 z-20 flex items-center justify-between pointer-events-auto">
        {/* Left: System Badge & Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/75 border border-cyan-500/40 backdrop-blur-md shadow-[0_0_15px_rgba(0,229,255,0.15)]">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? "bg-cyan-400 shadow-[0_0_8px_#00e5ff] animate-pulse"
                  : "bg-red-500 shadow-[0_0_8px_#ef4444]"
              }`}
            />
            <span className="font-mono text-[11px] tracking-[0.2em] text-cyan-300 font-bold">
              J.A.R.V.I.S.
            </span>
            <span className="font-mono text-[9px] text-slate-400 border-l border-white/10 pl-2">
              MARK VII
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md text-[10px] font-mono text-slate-400">
            <Radio className="w-3 h-3 text-cyan-400" />
            <span>GEMINI 3.8 LIVE</span>
            <span className="text-slate-600">·</span>
            <span className="text-cyan-300 uppercase">{voiceName}</span>
          </div>
        </div>

        {/* Right: Telemetry & Actions */}
        <div className="flex items-center gap-2">
          {/* Status Chip */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/75 border border-cyan-500/30 backdrop-blur-md">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="font-mono text-[10px] tracking-wider text-cyan-200">
              {systemState}
            </span>
          </div>

          {/* Transcript Log Button */}
          <button
            type="button"
            onClick={onToggleTranscript}
            className={`p-2 rounded-lg border backdrop-blur-md transition-all cursor-pointer ${
              isTranscriptOpen
                ? "bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                : "bg-black/75 border-cyan-500/30 text-slate-300 hover:text-cyan-200 hover:border-cyan-400/60"
            }`}
            title="Toggle Transcript (T)"
            aria-label="Toggle Transcript"
          >
            <MessageSquareText className="w-4 h-4" />
          </button>

          {/* Voice Selector Settings */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVoiceMenu((prev) => !prev)}
              className={`p-2 rounded-lg border backdrop-blur-md transition-all cursor-pointer ${
                showVoiceMenu
                  ? "bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                  : "bg-black/75 border-cyan-500/30 text-slate-300 hover:text-cyan-200 hover:border-cyan-400/60"
              }`}
              title="Voice Settings"
              aria-label="Voice Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Voice Dropdown */}
            {showVoiceMenu && (
              <div className="absolute right-0 top-12 w-48 rounded-xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-xl p-2 shadow-[0_10px_40px_rgba(0,0,0,0.9),0_0_20px_rgba(0,229,255,0.15)] z-50">
                <p className="font-mono text-[9px] tracking-[0.2em] text-cyan-400/80 mb-2 px-2 uppercase">
                  Vocal Synapse
                </p>
                <div className="flex flex-col gap-1">
                  {VOICES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        onChangeVoice(v);
                        setShowVoiceMenu(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                        voiceName === v
                          ? "bg-cyan-900/50 text-cyan-200 border border-cyan-500/40"
                          : "text-slate-300 hover:bg-white/5 hover:text-cyan-300"
                      }`}
                    >
                      <span>{v}</span>
                      {voiceName === v && <Zap className="w-3 h-3 text-cyan-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Mode Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border bg-black/75 border-cyan-500/30 text-slate-300 hover:text-cyan-200 hover:border-cyan-400/60 backdrop-blur-md transition-all cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen (F)" : "Enter Fullscreen (F)"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── Stark Sci-Fi Floating Bottom Control Dock ─────────────────────── */}
      <footer className="absolute bottom-4 z-20 flex items-center justify-center gap-3 pointer-events-auto px-4 max-w-full">
        {/* User Gesture Audio Unlock Banner (if browser blocked autoplay) */}
        {needsUserGesture && (
          <button
            type="button"
            onClick={onUnlockAudio}
            className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-cyan-500 text-black font-mono font-bold text-xs tracking-wider shadow-[0_0_30px_#00e5ff] hover:bg-cyan-400 transition-all cursor-pointer animate-pulse"
          >
            <Zap className="w-4 h-4" />
            INITIALIZE AUDIO MATRIX (CLICK)
          </button>
        )}

        {/* Offline / Reconnect Banner */}
        {isError && (
          <button
            type="button"
            onClick={onReconnect}
            className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-red-600 text-white font-mono font-bold text-xs tracking-wider shadow-[0_0_30px_#ef4444] hover:bg-red-500 transition-all cursor-pointer animate-pulse"
          >
            <RotateCw className="w-4 h-4 animate-spin" />
            RE-ENGAGE SYSTEM
          </button>
        )}

        {/* Primary Interactive Console */}
        {!needsUserGesture && !isError && (
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-black/85 border border-cyan-500/40 backdrop-blur-xl shadow-[0_0_30px_rgba(0,229,255,0.2)]">
            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={onToggleMic}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-semibold tracking-wider transition-all duration-200 cursor-pointer ${
                isMicMuted
                  ? "bg-amber-950/70 border border-amber-600/60 text-amber-300 shadow-[0_0_15px_rgba(217,119,6,0.3)]"
                  : "bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:bg-cyan-500/30"
              }`}
            >
              {isMicMuted ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>MIC MUTED</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>LIVE MIC</span>
                </>
              )}
            </button>

            {/* Embedded Live Frequency Spectrum */}
            <div className="hidden sm:flex flex-col items-center justify-center px-2">
              <canvas
                ref={spectrumCanvasRef}
                width={140}
                height={22}
                className="w-[140px] h-[22px]"
              />
              <span className="font-mono text-[7px] tracking-[0.2em] text-cyan-400/70 uppercase">
                {isListening ? "DUPLEX AUDIO ACTIVE" : isJarvisSpeaking ? "OUTPUT ACTIVE" : isUserSpeaking ? "VOICE IN" : "STANDBY"}
              </span>
            </div>

            {/* Arc Reactor Telemetry */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 font-mono text-[10px] text-slate-300">
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>ARC: {((energy || 0.1) * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
