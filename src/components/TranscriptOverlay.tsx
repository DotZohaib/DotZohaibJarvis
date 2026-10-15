/**
 * TranscriptOverlay — Stark Industries Holographic Communication Log
 *
 * Floating HUD glass panel showing recent duplex dialogue.
 * Users on right in teal, JARVIS on left in cyan.
 */
import React, { useEffect, useRef } from "react";
import { TranscriptEntry } from "../types/jarvis";
import { Trash2, X, Terminal } from "lucide-react";

interface TranscriptOverlayProps {
  transcripts: TranscriptEntry[];
  isOpen: boolean;
  onClear: () => void;
  onClose?: () => void;
}

export const TranscriptOverlay: React.FC<TranscriptOverlayProps> = ({
  transcripts,
  isOpen,
  onClear,
  onClose,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, isOpen]);

  if (!isOpen) return null;

  const visible = transcripts.slice(-10);

  return (
    <div className="fixed top-18 right-3 sm:right-6 z-40 w-80 max-w-[calc(100vw-1.5rem)]">
      <div
        className="rounded-2xl border border-cyan-500/40 overflow-hidden shadow-[0_15px_50px_rgba(0,0,0,0.85),0_0_20px_rgba(0,229,255,0.15)] backdrop-blur-xl"
        style={{
          background: "rgba(2, 6, 18, 0.88)",
        }}
      >
        {/* Holographic Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-cyan-500/20 bg-cyan-950/20">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-300 font-semibold uppercase">
              Comm Stream Log
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClear}
              className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              aria-label="Clear transcript"
              title="Clear Log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="max-h-60 sm:max-h-72 overflow-y-auto px-3.5 py-3 space-y-3 font-sans"
        >
          {visible.length === 0 ? (
            <p className="text-[11px] text-slate-500 text-center py-4 font-mono">
              // NO COMM TRAFFIC DETECTED
            </p>
          ) : (
            visible.map((item) => {
              const isUser = item.role === "user";
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
                >
                  <span
                    className={`font-mono text-[8px] tracking-[0.16em] uppercase ${
                      isUser ? "text-teal-400" : "text-cyan-300"
                    }`}
                  >
                    {isUser ? "// USER COMM" : "// J.A.R.V.I.S."}
                  </span>
                  <div
                    className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      isUser
                        ? "bg-teal-950/70 border border-teal-500/30 text-teal-100"
                        : "bg-cyan-950/60 border border-cyan-500/30 text-cyan-50"
                    } ${!item.isComplete ? "opacity-75" : ""}`}
                    dir="auto"
                  >
                    {item.text.trim()}
                    {!item.isComplete && (
                      <span className="inline-block w-1.5 h-3 ml-1 bg-cyan-400 rounded-xs animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
