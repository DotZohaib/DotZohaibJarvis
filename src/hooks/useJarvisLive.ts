import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioMetrics,
  JarvisErrorCode,
  JarvisSystemState,
  JarvisVoiceName,
  TranscriptEntry,
} from "../types/jarvis";
import { routeCommandAsync } from "./useCommandRouter";
import { executeTool } from "../services/toolRegistry";
import {
  getBackendBaseUrl,
  getBackendWsUrl,
  getBackendApiUrl,
  getBackendConnectionHelpText,
} from "../services/backendConfig";
import {
  GEMINI_TOOLS,
  JARVIS_SYSTEM_INSTRUCTION,
} from "../services/geminiLiveConfig";

function getLiveWsUrl(voice: string): string {
  return getBackendWsUrl(`/live?voice=${encodeURIComponent(voice)}`);
}

function getStatusUrl(): string {
  return getBackendApiUrl("/api/status");
}

const TARGET_INPUT_SAMPLE_RATE = 16000;
const TARGET_OUTPUT_SAMPLE_RATE = 24000;
const FFT_SIZE = 256; // 128 frequency bins

/**
 * Downsamples a Float32Array from any native AudioContext sampleRate to 16000Hz
 * and encodes it as base64 16-bit signed little-endian PCM.
 */
function float32To16kHzBase64Pcm(
  inputBuffer: Float32Array,
  inputSampleRate: number
): { base64: string; rms: number } {
  let sumSquares = 0;
  for (let i = 0; i < inputBuffer.length; i++) {
    const sample = inputBuffer[i];
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, inputBuffer.length));

  let resampled: Float32Array;
  if (inputSampleRate === TARGET_INPUT_SAMPLE_RATE) {
    resampled = inputBuffer;
  } else {
    const ratio = inputSampleRate / TARGET_INPUT_SAMPLE_RATE;
    const newLength = Math.round(inputBuffer.length / ratio);
    resampled = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < resampled.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < inputBuffer.length;
        i++
      ) {
        accum += inputBuffer[i];
        count++;
      }
      resampled[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
  }

  const pcm16 = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }

  return {
    base64: btoa(binary),
    rms,
  };
}

/**
 * Decodes base64 16-bit little-endian PCM (24kHz) into Float32Array (-1..1).
 */
function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export function useJarvisLive() {
  const [systemState, setSystemState] = useState<JarvisSystemState>("CONNECTING");
  const [errorCode, setErrorCode] = useState<JarvisErrorCode>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [needsUserGesture, setNeedsUserGesture] = useState<boolean>(false);
  const [voiceName, setVoiceName] = useState<JarvisVoiceName>("Charon");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  // Refs for closure-safe access inside WebSocket & Audio callbacks
  const systemStateRef = useRef<JarvisSystemState>("CONNECTING");
  const isMicMutedRef = useRef<boolean>(false);
  const voiceNameRef = useRef<JarvisVoiceName>("Charon");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const pingIntervalRef = useRef<number | null>(null);
  const thinkingTimeoutRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const isManualDisconnectRef = useRef<boolean>(false);
  const isDirectGoogleLiveRef = useRef<boolean>(false);

  // Web Audio API refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  // Voice Activity Detection tracking
  const lastSpeechTimestampRef = useRef<number>(0);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const isUserSpeakingRef = useRef<boolean>(false);
  const isJarvisPlayingRef = useRef<boolean>(false);

  // Pre-allocated buffers for 60fps audio visualization (zero GC pressure)
  const inputFreqDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const outputFreqDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const inputWaveDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(128));
  const outputWaveDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(128));

  const audioMetricsRef = useRef<AudioMetrics>({
    inputLevel: 0,
    outputLevel: 0,
    activeLevel: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    frequencyBins: new Uint8Array(64),
    timeDomainData: new Uint8Array(128).fill(128),
  });

  const updateState = useCallback((next: JarvisSystemState) => {
    systemStateRef.current = next;
    setSystemState(next);
  }, []);

  /**
   * Immediately halts all scheduled or playing JARVIS audio chunks (for interruptions).
   */
  const stopAllPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    isJarvisPlayingRef.current = false;
  }, []);

  /**
   * Append or update real-time streaming transcript entries.
   */
  const appendTranscript = useCallback(
    (role: "user" | "jarvis", deltaText: string, finished: boolean) => {
      const cleaned = deltaText;
      if (!cleaned && !finished) return;

      setTranscripts((prev) => {
        const next = [...prev];
        // Find the most recent entry of the same role if it is still incomplete
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === role && !next[lastIdx].isComplete) {
          const updated = {
            ...next[lastIdx],
            text: next[lastIdx].text + cleaned,
            isComplete: finished,
          };
          next[lastIdx] = updated;
          return next;
        }

        // If switching roles, mark previous entry complete
        if (lastIdx >= 0 && !next[lastIdx].isComplete) {
          next[lastIdx] = { ...next[lastIdx], isComplete: true };
        }

        if (!cleaned.trim()) return next;

        next.push({
          id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text: cleaned,
          timestamp: Date.now(),
          isComplete: finished,
        });

        // Keep transcript history concise (last 30 turns)
        return next.slice(-30);
      });
    },
    []
  );

  const finalizeCurrentTranscripts = useCallback(() => {
    setTranscripts((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.isComplete) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...last, isComplete: true };
      return next;
    });
  }, []);

  /**
   * Schedules a 24kHz PCM audio chunk from Gemini Live for gapless playback.
   */
  const scheduleAudioChunk = useCallback(
    (base64Pcm: string) => {
      const outCtx = outputAudioCtxRef.current;
      const outAnalyser = outputAnalyserRef.current;
      if (!outCtx || !outAnalyser) return;

      if (outCtx.state === "suspended") {
        outCtx.resume().catch(() => {});
      }

      const float32Samples = base64PcmToFloat32(base64Pcm);
      if (float32Samples.length === 0) return;

      const audioBuffer = outCtx.createBuffer(
        1,
        float32Samples.length,
        TARGET_OUTPUT_SAMPLE_RATE
      );
      audioBuffer.getChannelData(0).set(float32Samples);

      const source = outCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outAnalyser);

      const now = outCtx.currentTime;
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now + 0.015;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      activeSourcesRef.current.add(source);
      isJarvisPlayingRef.current = true;

      if (thinkingTimeoutRef.current) {
        window.clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      if (systemStateRef.current !== "JARVIS SPEAKING") {
        updateState("JARVIS SPEAKING");
      }

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0) {
          isJarvisPlayingRef.current = false;
          // Return automatically to LISTENING once playback queue finishes
          if (systemStateRef.current === "JARVIS SPEAKING") {
            updateState("LISTENING");
          }
        }
      };
    },
    [updateState]
  );

  /**
   * Initializes microphone capture and Web Audio contexts.
   */
  const initAudioPipeline = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorCode("MIC_PERMISSION_DENIED");
        setErrorMessage("Microphone permission is required for voice conversation.");
        updateState("ERROR");
        return false;
      }

      // Request real microphone stream with hardware echo cancellation & noise suppression
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: TARGET_INPUT_SAMPLE_RATE,
          },
        });
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!inputAudioCtxRef.current) {
        const inCtx = new AudioCtx({ sampleRate: TARGET_INPUT_SAMPLE_RATE });
        const inAnalyser = inCtx.createAnalyser();
        inAnalyser.fftSize = FFT_SIZE;
        inAnalyser.smoothingTimeConstant = 0.75;

        const micSource = inCtx.createMediaStreamSource(mediaStreamRef.current);
        const processor = inCtx.createScriptProcessor(2048, 1, 1);

        micSource.connect(inAnalyser);
        inAnalyser.connect(processor);
        processor.connect(inCtx.destination);

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          if (isMicMutedRef.current) return;
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;

          const inputChannel = event.inputBuffer.getChannelData(0);
          const { base64, rms } = float32To16kHzBase64Pcm(
            inputChannel,
            inCtx.sampleRate
          );

          // Continuously stream real-time 16kHz PCM audio to Gemini 3.8 Live
          if (isDirectGoogleLiveRef.current) {
            ws.send(
              JSON.stringify({
                realtimeInput: {
                  mediaChunks: [
                    {
                      mimeType: "audio/pcm;rate=16000",
                      data: base64,
                    },
                  ],
                },
              })
            );
          } else {
            ws.send(JSON.stringify({ type: "audio", audio: base64 }));
          }

          // Automatic Voice Activity Detection (VAD) for responsive state feedback
          const now = performance.now();
          // Higher threshold while JARVIS is speaking to avoid false echo triggers
          const speechThreshold = isJarvisPlayingRef.current ? 0.048 : 0.016;

          if (rms > speechThreshold) {
            consecutiveSpeechFramesRef.current += 1;
            lastSpeechTimestampRef.current = now;

            // Require 2 consecutive frames (~120ms) for normal speech, or 4 frames during playback barge-in
            const requiredFrames = isJarvisPlayingRef.current ? 4 : 2;
            if (consecutiveSpeechFramesRef.current >= requiredFrames) {
              if (isJarvisPlayingRef.current) {
                // User interrupted JARVIS mid-sentence
                stopAllPlayback();
              }
              if (!isUserSpeakingRef.current) {
                isUserSpeakingRef.current = true;
                updateState("USER SPEAKING");
              }
            }
          } else {
            consecutiveSpeechFramesRef.current = 0;
            if (
              isUserSpeakingRef.current &&
              now - lastSpeechTimestampRef.current > 680
            ) {
              // User finished their spoken phrase -> transition to THINKING
              isUserSpeakingRef.current = false;
              if (systemStateRef.current === "USER SPEAKING") {
                updateState("THINKING");
                if (thinkingTimeoutRef.current) {
                  window.clearTimeout(thinkingTimeoutRef.current);
                }
                thinkingTimeoutRef.current = window.setTimeout(() => {
                  if (systemStateRef.current === "THINKING") {
                    updateState("LISTENING");
                  }
                }, 6500);
              }
            }
          }
        };

        inputAudioCtxRef.current = inCtx;
        inputAnalyserRef.current = inAnalyser;
        scriptProcessorRef.current = processor;
      }

      if (!outputAudioCtxRef.current) {
        const outCtx = new AudioCtx({ sampleRate: TARGET_OUTPUT_SAMPLE_RATE });
        const outAnalyser = outCtx.createAnalyser();
        outAnalyser.fftSize = FFT_SIZE;
        outAnalyser.smoothingTimeConstant = 0.72;
        outAnalyser.connect(outCtx.destination);

        outputAudioCtxRef.current = outCtx;
        outputAnalyserRef.current = outAnalyser;
      }

      // Resume AudioContexts if suspended by browser autoplay policy
      if (inputAudioCtxRef.current.state === "suspended") {
        await inputAudioCtxRef.current.resume().catch(() => {});
      }
      if (outputAudioCtxRef.current.state === "suspended") {
        await outputAudioCtxRef.current.resume().catch(() => {});
      }

      const isSuspended =
        inputAudioCtxRef.current.state === "suspended" ||
        outputAudioCtxRef.current.state === "suspended";
      setNeedsUserGesture(isSuspended);

      return true;
    } catch (err: any) {
      const name = err?.name || "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        String(err?.message || "").toLowerCase().includes("permission")
      ) {
        setErrorCode("MIC_PERMISSION_DENIED");
        setErrorMessage(
          "Microphone permission is required for voice conversation."
        );
      } else {
        setErrorCode("MIC_PERMISSION_DENIED");
        setErrorMessage(
          "Microphone permission is required for voice conversation."
        );
      }
      updateState("ERROR");
      return false;
    }
  }, [stopAllPlayback, updateState]);

  /**
   * Connects to our server-side Gemini 3.8 Live WebSocket bridge.
   */
  const connectLiveSession = useCallback(async () => {
    isManualDisconnectRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    updateState("CONNECTING");
    setErrorCode(null);
    setErrorMessage(null);

    // 1. Resolve session endpoint (Direct Ephemeral Token vs Bridge)
    let targetWsUrl: string;
    let isDirect = false;

    try {
      const sessionRes = await fetch(getBackendApiUrl("/api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.success && sessionData.endpoint) {
          targetWsUrl = sessionData.endpoint;
          isDirect = true;
        } else {
          targetWsUrl = getLiveWsUrl(voiceNameRef.current);
        }
      } else {
        const errJson = await sessionRes.json().catch(() => ({}));
        if (errJson.code === "MISSING_API_KEY") {
          setErrorCode("MISSING_API_KEY");
          setErrorMessage(
            errJson.error ||
              "GEMINI_API_KEY is not configured in Vercel Environment Variables. Please add GEMINI_API_KEY in your Vercel Project Settings."
          );
          updateState("ERROR");
          return;
        }
        targetWsUrl = getLiveWsUrl(voiceNameRef.current);
      }
    } catch {
      targetWsUrl = getLiveWsUrl(voiceNameRef.current);
    }

    // 2. Initialize microphone & Web Audio pipeline
    const audioReady = await initAudioPipeline();
    if (!audioReady) {
      return;
    }

    // 3. Open WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {
        // Ignore
      }
    }

    isDirectGoogleLiveRef.current = isDirect;
    const ws = new WebSocket(targetWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      if (isDirectGoogleLiveRef.current) {
        const setupPayload = {
          setup: {
            model: "models/gemini-3.8-live",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceNameRef.current,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: JARVIS_SYSTEM_INSTRUCTION }],
            },
            tools: GEMINI_TOOLS,
          },
        };
        ws.send(JSON.stringify(setupPayload));
      } else {
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // ── Direct Google Gemini Live Protocol ───────────────────
        if (isDirectGoogleLiveRef.current) {
          if (msg.setupComplete) {
            setErrorCode(null);
            setErrorMessage(null);
            updateState("READY");
            window.setTimeout(() => {
              if (systemStateRef.current === "READY") {
                updateState("LISTENING");
              }
            }, 900);
            return;
          }

          if (msg.serverContent) {
            const sc = msg.serverContent;
            if (sc.interrupted) {
              stopAllPlayback();
              finalizeCurrentTranscripts();
              updateState("LISTENING");
            }

            if (sc.modelTurn?.parts) {
              for (const part of sc.modelTurn.parts) {
                if (part.inlineData?.data) {
                  isUserSpeakingRef.current = false;
                  scheduleAudioChunk(part.inlineData.data);
                }
                if (part.text) {
                  appendTranscript("jarvis", part.text, false);
                }
              }
            }

            if (sc.turnComplete) {
              finalizeCurrentTranscripts();
              if (!isJarvisPlayingRef.current && activeSourcesRef.current.size === 0) {
                updateState("LISTENING");
              }
            }
          }

          if (msg.toolCall?.functionCalls) {
            for (const call of msg.toolCall.functionCalls) {
              console.log(
                `[JARVIS CLIENT] Executing direct tool call "${call.name}" (id: ${call.id})`,
                call.args
              );
              executeTool(call.name, (call.args || {}) as Record<string, any>, {
                requestId: call.id,
                source: "gemini_tool_call",
                openInNewTab: true,
              })
                .then((res) => {
                  if (res.confirmationText) {
                    appendTranscript("jarvis", res.confirmationText, true);
                  }
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        toolResponse: {
                          functionResponses: [
                            {
                              response: {
                                output: res.data || {
                                  success: res.success,
                                  confirmationText: res.confirmationText,
                                  error: res.error,
                                },
                              },
                              id: call.id,
                            },
                          ],
                        },
                      })
                    );
                  }
                })
                .catch((err) => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        toolResponse: {
                          functionResponses: [
                            {
                              response: {
                                output: {
                                  success: false,
                                  error: err?.message || "Execution exception",
                                },
                              },
                              id: call.id,
                            },
                          ],
                        },
                      })
                    );
                  }
                });
            }
          }
          return;
        }

        // ── Bridge Server Protocol ───────────────────────────────
        switch (msg.type) {
          case "connected": {
            setErrorCode(null);
            setErrorMessage(null);
            // Briefly show READY then automatically transition into LISTENING
            updateState("READY");
            window.setTimeout(() => {
              if (systemStateRef.current === "READY") {
                updateState("LISTENING");
              }
            }, 900);
            break;
          }

          case "audio": {
            if (typeof msg.audio === "string") {
              isUserSpeakingRef.current = false;
              scheduleAudioChunk(msg.audio);
            }
            break;
          }

          case "input_transcription": {
            if (typeof msg.text === "string") {
              if (
                systemStateRef.current === "LISTENING" ||
                systemStateRef.current === "READY"
              ) {
                updateState("USER SPEAKING");
              }
              appendTranscript("user", msg.text, Boolean(msg.finished));

              // Route deterministic commands on finished transcript
              if (msg.finished && msg.text.trim().length > 3) {
                routeCommandAsync(msg.text, (feedback) => {
                  appendTranscript("jarvis", feedback, true);
                }).catch((err) => {
                  console.error("[JARVIS ROUTER ERROR]", err);
                });
              }
            }
            break;
          }

          case "execute_tool_request": {
            if (msg.callId && msg.tool) {
              console.log(
                `[JARVIS CLIENT] Executing tool request "${msg.tool}" (callId: ${msg.callId})`,
                msg.args
              );
              executeTool(msg.tool as string, (msg.args || {}) as Record<string, any>, {
                requestId: msg.callId,
                source: "gemini_tool_call",
                openInNewTab: true,
              })
                .then((res) => {
                  if (res.confirmationText) {
                    appendTranscript("jarvis", res.confirmationText, true);
                  }
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "tool_execution_response",
                        callId: msg.callId,
                        success: res.success,
                        result: res.data || { success: res.success },
                        error: res.error,
                      })
                    );
                  }
                })
                .catch((err) => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "tool_execution_response",
                        callId: msg.callId,
                        success: false,
                        error: err?.message || "Execution exception",
                      })
                    );
                  }
                });
            }
            break;
          }

          case "client_action": {
            if (msg.tool && msg.args) {
              executeTool(msg.tool as string, msg.args as Record<string, any>, {
                source: "gemini_tool_call",
                openInNewTab: true,
              })
                .then((res) => {
                  if (res.confirmationText) {
                    appendTranscript("jarvis", res.confirmationText, true);
                  }
                })
                .catch(() => {});
            }
            break;
          }

          case "tool_executed": {
            if (msg.tool === "get_weather" && (msg.data as any)?.formattedText) {
              appendTranscript("jarvis", (msg.data as any).formattedText, true);
            }
            break;
          }

          case "output_transcription": {
            if (typeof msg.text === "string") {
              appendTranscript("jarvis", msg.text, Boolean(msg.finished));
            }
            break;
          }

          case "interrupted": {
            stopAllPlayback();
            finalizeCurrentTranscripts();
            updateState("LISTENING");
            break;
          }

          case "turn_complete": {
            finalizeCurrentTranscripts();
            if (!isJarvisPlayingRef.current && activeSourcesRef.current.size === 0) {
              updateState("LISTENING");
            }
            break;
          }

          case "error": {
            stopAllPlayback();
            if (msg.code === "MISSING_API_KEY") {
              setErrorCode("MISSING_API_KEY");
              setErrorMessage(
                msg.message ||
                  "Missing GEMINI_API_KEY. Please configure it in Settings > Secrets."
              );
            } else {
              setErrorCode("GEMINI_CONNECTION_FAILED");
              setErrorMessage(msg.message || "Unable to connect to JARVIS.");
            }
            updateState("ERROR");
            break;
          }

          case "session_closed": {
            if (!isManualDisconnectRef.current && systemStateRef.current !== "ERROR") {
              scheduleReconnect();
            }
            break;
          }
        }
      } catch {
        // Ignore parse error
      }
    };

    ws.onerror = () => {
      if (systemStateRef.current !== "ERROR") {
        setErrorCode("GEMINI_CONNECTION_FAILED");
        setErrorMessage(getBackendConnectionHelpText());
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (!isManualDisconnectRef.current && systemStateRef.current !== "ERROR") {
        scheduleReconnect();
      }
    };
  }, [
    appendTranscript,
    finalizeCurrentTranscripts,
    initAudioPipeline,
    scheduleAudioChunk,
    stopAllPlayback,
    updateState,
  ]);

  const scheduleReconnect = useCallback(() => {
    if (isManualDisconnectRef.current) return;
    if (reconnectAttemptsRef.current >= 5) {
      setErrorCode("GEMINI_CONNECTION_FAILED");
      setErrorMessage(getBackendConnectionHelpText());
      updateState("ERROR");
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delayMs = Math.min(1500 * Math.pow(1.6, reconnectAttemptsRef.current - 1), 8000);
    updateState("CONNECTING");
    setErrorCode("NETWORK_DISCONNECTED");
    setErrorMessage(`Network interrupted. Reconnecting to JARVIS (attempt ${reconnectAttemptsRef.current}/5)...`);

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = window.setTimeout(() => {
      connectLiveSession();
    }, delayMs);
  }, [connectLiveSession, updateState]);

  /**
   * Unlocks AudioContext on user tap (for mobile/browser autoplay policies) and ensures session is active.
   */
  const unlockAndResumeAudio = useCallback(async () => {
    if (inputAudioCtxRef.current?.state === "suspended") {
      await inputAudioCtxRef.current.resume().catch(() => {});
    }
    if (outputAudioCtxRef.current?.state === "suspended") {
      await outputAudioCtxRef.current.resume().catch(() => {});
    }
    setNeedsUserGesture(false);

    if (
      systemStateRef.current === "ERROR" ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      reconnectAttemptsRef.current = 0;
      await connectLiveSession();
    }
  }, [connectLiveSession]);

  const toggleMicMute = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev;
      isMicMutedRef.current = next;
      if (next && systemStateRef.current === "USER SPEAKING") {
        updateState("LISTENING");
      }
      return next;
    });
  }, [updateState]);

  const changeVoice = useCallback(
    (newVoice: JarvisVoiceName) => {
      voiceNameRef.current = newVoice;
      setVoiceName(newVoice);
      stopAllPlayback();
      reconnectAttemptsRef.current = 0;
      connectLiveSession();
    },
    [connectLiveSession, stopAllPlayback]
  );

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  /**
   * Samples real-time frequency and waveform data from the active AnalyserNodes.
   * Called inside the 60fps animation frame loop without causing React re-renders.
   */
  const sampleAudioMetrics = useCallback((): AudioMetrics => {
    const inAnalyser = inputAnalyserRef.current;
    const outAnalyser = outputAnalyserRef.current;
    const metrics = audioMetricsRef.current;

    let inSum = 0;
    let outSum = 0;

    if (inAnalyser && !isMicMutedRef.current) {
      inAnalyser.getByteFrequencyData(inputFreqDataRef.current);
      inAnalyser.getByteTimeDomainData(inputWaveDataRef.current);
      for (let i = 0; i < inputFreqDataRef.current.length; i++) {
        inSum += inputFreqDataRef.current[i];
      }
    } else {
      inputFreqDataRef.current.fill(0);
      inputWaveDataRef.current.fill(128);
    }

    if (outAnalyser && isJarvisPlayingRef.current) {
      outAnalyser.getByteFrequencyData(outputFreqDataRef.current);
      outAnalyser.getByteTimeDomainData(outputWaveDataRef.current);
      for (let i = 0; i < outputFreqDataRef.current.length; i++) {
        outSum += outputFreqDataRef.current[i];
      }
    } else {
      outputFreqDataRef.current.fill(0);
      outputWaveDataRef.current.fill(128);
    }

    const rawInputLevel = Math.min(1, inSum / (64 * 140));
    const rawOutputLevel = Math.min(1, outSum / (64 * 130));

    // Smooth exponential interpolation
    metrics.inputLevel = metrics.inputLevel * 0.72 + rawInputLevel * 0.28;
    metrics.outputLevel = metrics.outputLevel * 0.72 + rawOutputLevel * 0.28;

    const isSpeakingOut =
      systemStateRef.current === "JARVIS SPEAKING" || isJarvisPlayingRef.current;
    const activeFreq = isSpeakingOut
      ? outputFreqDataRef.current
      : inputFreqDataRef.current;
    const activeWave = isSpeakingOut
      ? outputWaveDataRef.current
      : inputWaveDataRef.current;

    metrics.activeLevel = isSpeakingOut
      ? Math.max(metrics.outputLevel, metrics.inputLevel * 0.4)
      : metrics.inputLevel;

    // Compute bass (bins 0..10), mid (bins 11..32), treble (bins 33..63)
    let bassSum = 0;
    for (let i = 0; i <= 10; i++) bassSum += activeFreq[i];
    let midSum = 0;
    for (let i = 11; i <= 32; i++) midSum += activeFreq[i];
    let trebleSum = 0;
    for (let i = 33; i < 64; i++) trebleSum += activeFreq[i];

    metrics.bass = metrics.bass * 0.7 + Math.min(1, bassSum / (11 * 200)) * 0.3;
    metrics.mid = metrics.mid * 0.7 + Math.min(1, midSum / (22 * 180)) * 0.3;
    metrics.treble =
      metrics.treble * 0.7 + Math.min(1, trebleSum / (31 * 150)) * 0.3;

    metrics.frequencyBins.set(activeFreq);
    metrics.timeDomainData.set(activeWave);

    return metrics;
  }, []);

  // Automatically start the JARVIS Live session on mount
  useEffect(() => {
    connectLiveSession();

    const handleGlobalInteraction = () => {
      if (
        inputAudioCtxRef.current?.state === "suspended" ||
        outputAudioCtxRef.current?.state === "suspended"
      ) {
        inputAudioCtxRef.current?.resume().catch(() => {});
        outputAudioCtxRef.current?.resume().catch(() => {});
        setNeedsUserGesture(false);
      }
    };

    window.addEventListener("pointerdown", handleGlobalInteraction, { passive: true });
    window.addEventListener("keydown", handleGlobalInteraction, { passive: true });

    return () => {
      isManualDisconnectRef.current = true;
      window.removeEventListener("pointerdown", handleGlobalInteraction);
      window.removeEventListener("keydown", handleGlobalInteraction);

      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current);
      if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current);
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);

      stopAllPlayback();

      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {
          // Ignore
        }
      }

      if (scriptProcessorRef.current) {
        try {
          scriptProcessorRef.current.disconnect();
        } catch {
          // Ignore
        }
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      inputAudioCtxRef.current?.close().catch(() => {});
      outputAudioCtxRef.current?.close().catch(() => {});
    };
  }, [connectLiveSession, stopAllPlayback]);

  return {
    systemState,
    errorCode,
    errorMessage,
    isMicMuted,
    needsUserGesture,
    voiceName,
    transcripts,
    sampleAudioMetrics,
    unlockAndResumeAudio,
    reconnect: connectLiveSession,
    toggleMicMute,
    changeVoice,
    clearTranscripts,
    interruptJarvis: stopAllPlayback,
  };
}
