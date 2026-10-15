import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { exec } from "child_process";
import { resolveYouTubeTrack } from "./src/services/youtubeResolver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = "gemini-3.8-live";

// ─── Weather Helper (Free Open-Meteo API) ─────────────────────────────────────

const WMO_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

async function fetchLiveWeather(city: string) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city.trim()
  )}&count=1&language=en&format=json`;

  const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
  if (!geoRes.ok) throw new Error(`Geocoding failed for "${city}"`);

  const geoData = (await geoRes.json()) as any;
  if (!geoData.results || geoData.results.length === 0) {
    throw new Error(`Location "${city}" not found.`);
  }

  const { latitude, longitude, name, country } = geoData.results[0];
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;

  const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(6000) });
  if (!weatherRes.ok) throw new Error(`Weather fetch failed for "${city}"`);

  const weatherData = (await weatherRes.json()) as any;
  const current = weatherData.current;
  const temp = Math.round(current.temperature_2m);
  const condition = WMO_CODE_MAP[current.weather_code] || "Clear";
  const humidity = current.relative_humidity_2m;
  const windSpeed = Math.round(current.wind_speed_10m);

  return {
    city: name,
    country,
    temperature: temp,
    condition,
    humidity,
    windSpeed,
    formattedText: `${name}, ${country} mein is waqt mausam ${condition} hai, temperature ${temp}°C hai, humidity ${humidity}% hai aur hawa ki raftaar ${windSpeed} km/h hai.`,
  };
}

// ─── Gemini Live Tool Declarations ────────────────────────────────────────────

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description:
          "Fetch real-time, live weather conditions, temperature, humidity, and forecast for any city.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            city: {
              type: Type.STRING,
              description: "City name (e.g. Karachi, Lahore, London, New York, Tokyo).",
            },
          },
          required: ["city"],
        },
      },
      {
        name: "play_youtube_video",
        description:
          "Play or launch a requested song, music track, or video on YouTube with verified tab navigation and playback state.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            songOrVideo: {
              type: Type.STRING,
              description: "The specific song title, track name, or video to play.",
            },
            artist: {
              type: Type.STRING,
              description: "Optional artist, singer, or channel name.",
            },
          },
          required: ["songOrVideo"],
        },
      },
      {
        name: "search_google",
        description:
          "Search Google for the user's requested query and open the search results.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The search query or terms to look up on Google.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_youtube",
        description: "Search YouTube for videos or channels and open the search results.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The video topic, title, or creator to search for on YouTube.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "open_website",
        description:
          "Open a requested website (e.g. Google, YouTube, GitHub, Wikipedia, Reddit) or direct URL in Chrome.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: {
              type: Type.STRING,
              description:
                "The target website name (e.g. 'google', 'youtube', 'github', 'wikipedia') or full URL.",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "open_browser_tab",
        description: "Open a new blank browser tab or navigate to a specified page in Chrome.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: "Optional URL to load. Defaults to Google homepage.",
            },
          },
        },
      },
      {
        name: "switch_tab",
        description: "Switch to the next, previous, or specified browser tab in Chrome.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            direction: {
              type: Type.STRING,
              description: "Direction to switch tabs: 'next' or 'prev'.",
            },
          },
        },
      },
      {
        name: "read_current_page",
        description: "Extract and summarize the text content of the currently active browser tab.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: "control_media",
        description: "Control audio or music playback across open tabs (stop, pause, resume, volume).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: "Playback action: stop, pause, resume, volume_up, volume_down.",
            },
          },
          required: ["action"],
        },
      },
    ],
  },
];

// ─── System Instructions ──────────────────────────────────────────────────────

const JARVIS_SYSTEM_INSTRUCTION = `You are JARVIS, an advanced, futuristic, real-time AI voice assistant created by Tony Stark.

CORE IDENTITY & PERSONALITY:
- You are intelligent, calm, composed, articulate, helpful, confident, and respectful.
- Speak naturally and conversationally, as a real-time voice intelligence.
- Keep simple answers concise and direct (1 to 3 sentences). For complex technical, scientific, or conceptual questions, provide clear, well-structured spoken explanations.
- Avoid robotic filler or repetitive clichés such as "Certainly sir", "Of course sir", or "How may I assist you?" in every single response. Vary your phrasing naturally.
- Never format responses with heavy markdown symbols (like asterisks, code blocks, or bullet characters) that sound unnatural when spoken aloud.

AUTOMATIC LANGUAGE DETECTION & MULTILINGUAL FLUENCY:
- Automatically detect the language the user is speaking in every turn and respond in that same language.
- If the user speaks English (e.g., "Hello Jarvis, how are you?"), respond naturally in English.
- If the user speaks Urdu or Roman Urdu (e.g., "Assalam o Alaikum, kya haal hai?" or "Mujhe batao JavaScript kya hai?"), respond naturally and fluently in conversational Urdu.
- If the user mixes Urdu and English (code-switching), respond naturally in the same conversational Urdu/English blend.
- If the user speaks Sindhi or uses regional phrases (e.g., "Mola Ghazi Maan song halayo"), recognize "halayo" as play/run, and respond fluently.

INTENT DISAMBIGUATION & REAL-WORLD ACTION RULES:
- NEVER confuse music/song requests with weather or general search!
- NEVER substitute one intent for another merely because an action is available!

1. MUSIC & SONGS:
   - When the user asks for music or songs (e.g. "Mola Ghazi Maan song halayo", "Atif Aslam ka song chalao", "Tajdar-e-Haram play karo", "Play Bohemian Rhapsody", "Play relaxing music"):
     * If a song title or artist is given: Call the play_youtube_video tool with songOrVideo.
     * If NO song title is specified (e.g. "Song chalao", "Koi gana bajao", "Play a song"): DO NOT call weather and DO NOT guess! Ask politely: "Aap kaunsa song ya artist sunna chahte hain? Please song ka naam batayein."
     * Never falsely claim a song is playing unless the tool confirms playback is active. If autoplay is blocked by browser policy, politely explain that the tab opened and user should click play.

2. OPENING WEBSITES VS SEARCHING:
   - When the user says "Google kholo", "Open Google", "YouTube kholo", "Open YouTube", "GitHub kholo", "Open GitHub", "Wikipedia kholo":
     * Call the open_website tool with the website target name (e.g. 'google', 'youtube', 'github', 'wikipedia').
     * DO NOT perform a search for 'kholo'. Actually open the requested website!

3. GOOGLE SEARCH:
   - When the user asks to search Google (e.g. "Google par artificial intelligence search karo", "Google par Next.js search karo", "Search Google for React"):
     * Call the search_google tool with the user's query.

4. YOUTUBE SEARCH:
   - When the user asks to search YouTube without requesting playback (e.g. "YouTube par tutorials search karo"):
     * Call the search_youtube tool with the query.

5. BROWSER TABS & NAVIGATION:
   - "Chrome mein naya tab kholo" / "New tab open karo": Call open_browser_tab.
   - "Agla tab kholo" / "Next tab" / "Tab switch karo": Call switch_tab with direction "next".
   - "Current page ka summary batao" / "Summarize this page": Call read_current_page.

6. WEATHER:
   - When the user asks about weather (e.g. "Aaj Karachi ka weather batao", "London ka weather batao", "Mausam kaisa hai"):
     * Call the get_weather tool with the requested city name.
     * Speak the real temperature and conditions returned by the tool.

7. MEDIA CONTROL:
   - When the user says "Stop music", "Gana band karo", "Pause karo", or "Volume kam karo":
     * Call the control_media tool with the appropriate action.`;

function isApiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() !== "" && key !== "MY_GEMINI_API_KEY");
}

function createGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json());

  // CORS — allow the frontend (local dev and Vercel) to call the backend
  app.use((_req, res, next) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
    ].filter(Boolean);
    const origin = _req.headers.origin || "";
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV !== "production" ||
      (origin && origin.endsWith(".vercel.app"))
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health & configuration check endpoint
  app.get("/api/status", (_req, res) => {
    const configured = isApiKeyConfigured();
    res.json({
      configured,
      model: MODEL_NAME,
      message: configured
        ? "JARVIS Live neural link ready."
        : "GEMINI_API_KEY is missing. Please configure GEMINI_API_KEY in the environment / Secrets panel.",
    });
  });

  // Direct REST API for Gemini Live Ephemeral Token generation
  app.all("/api/session", async (_req, res) => {
    if (!isApiKeyConfigured()) {
      return res.status(401).json({
        success: false,
        code: "MISSING_API_KEY",
        error: "GEMINI_API_KEY is missing. Please configure GEMINI_API_KEY in your environment.",
      });
    }

    try {
      const ai = createGenAIClient();
      const tokenRes = await ai.authTokens.create({});
      const token = (tokenRes.name || "").replace(/^auth_tokens\//, "");
      return res.json({
        success: true,
        token,
        model: "models/gemini-3.8-live",
        endpoint: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`,
      });
    } catch (err: any) {
      console.error("[SERVER /api/session ERROR]", err);
      return res.status(500).json({
        success: false,
        code: "SESSION_CREATION_FAILED",
        error: err?.message || "Failed to create ephemeral session token.",
      });
    }
  });

  // Direct REST API for live weather lookup
  app.get("/api/weather", async (req, res) => {
    const city = (req.query.city as string) || "Karachi";
    try {
      const data = await fetchLiveWeather(city);
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct REST API for YouTube video resolving
  app.get("/api/youtube-resolve", async (req, res) => {
    const query = (req.query.q as string) || "";
    if (!query.trim()) {
      return res.status(400).json({ success: false, error: "Missing query parameter 'q'" });
    }
    try {
      const track = await resolveYouTubeTrack(query);
      res.json({ success: true, ...track });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // OS-level Browser Launcher Fallback (bypasses browser popup blockers on localhost)
  app.post("/api/open-system-browser", (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: "Missing or invalid url parameter" });
    }

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ success: false, error: "Only HTTP/HTTPS URLs are allowed" });
      }
    } catch {
      return res.status(400).json({ success: false, error: "Malformed URL format" });
    }

    const isWin = process.platform === "win32";
    const cmd = isWin
      ? `start "" "${url.replace(/"/g, '\\"')}"`
      : `xdg-open "${url.replace(/"/g, '\\"')}"`;

    exec(cmd, (err) => {
      if (err) {
        console.error("[SERVER] Failed to launch system browser:", err);
        return res.status(500).json({ success: false, error: err.message });
      }
      return res.json({ success: true, openedVia: "system_browser", url });
    });
  });

  // WebSocket server for real-time bidirectional Gemini Live audio streaming
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      if (url.pathname === "/live") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (clientWs: WebSocket, request) => {
    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    if (!isApiKeyConfigured()) {
      sendToClient({
        type: "error",
        code: "MISSING_API_KEY",
        message:
          "Missing GEMINI_API_KEY environment variable. Configure your Gemini API key in Settings > Secrets.",
      });
      clientWs.close(1008, "Missing API key");
      return;
    }

    const url = new URL(request.url || "/live", `http://${request.headers.host || "localhost"}`);
    const requestedVoice = url.searchParams.get("voice") || "Charon";
    const allowedVoices = new Set(["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]);
    const voiceName = allowedVoices.has(requestedVoice) ? requestedVoice : "Charon";

    let isClosed = false;
    const ai = createGenAIClient();

    let sessionPromise: Promise<any> | null = null;
    let activeLiveSession: any = null;

    // Track asynchronous tool executions awaiting verified browser execution
    const pendingToolExecutions = new Map<string, (result: any) => void>();

    try {
      sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
          tools: GEMINI_TOOLS as any,
        },
        callbacks: {
          onopen: () => {
            sendToClient({
              type: "connected",
              model: MODEL_NAME,
              voice: voiceName,
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isClosed) return;

            // ── Handle Function Calling / Tool Calls from Gemini Live ─────────
            const toolCall = message.toolCall;
            if (toolCall?.functionCalls && toolCall.functionCalls.length > 0 && activeLiveSession) {
              const responses: any[] = [];

              for (const call of toolCall.functionCalls) {
                console.log(`[JARVIS SERVER TOOL CALL] ${call.name} (id: ${call.id})`, call.args);
                let outputData: Record<string, any> = { success: true };

                try {
                  if (call.name === "get_weather") {
                    const city = (call.args as any)?.city || "Karachi";
                    const weather = await fetchLiveWeather(city);
                    outputData = weather;
                    sendToClient({
                      type: "tool_executed",
                      tool: "get_weather",
                      args: call.args,
                      data: weather,
                    });
                  } else {
                    const callId = call.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    // Browser action: request execution from client with real verification
                    const executionPromise = new Promise<any>((resolve) => {
                      const timer = setTimeout(() => {
                        pendingToolExecutions.delete(callId);
                        console.warn(`[JARVIS SERVER] Tool call ${call.name} timed out.`);
                        resolve({
                          success: false,
                          error: "Browser action timed out waiting for companion execution.",
                        });
                      }, 8500);

                      pendingToolExecutions.set(callId, (clientResult) => {
                        clearTimeout(timer);
                        resolve(clientResult);
                      });
                    });

                    sendToClient({
                      type: "execute_tool_request",
                      callId,
                      tool: call.name,
                      args: call.args,
                    });

                    outputData = await executionPromise;
                  }
                } catch (toolErr: any) {
                  outputData = { success: false, error: toolErr.message || "Execution failed" };
                }

                responses.push({
                  id: call.id,
                  name: call.name,
                  response: { output: outputData },
                });
              }

              // Send REAL verified tool responses back to Gemini so speech is grounded in reality
              try {
                activeLiveSession.sendToolResponse({ functionResponses: responses });
              } catch (respErr) {
                console.error("[JARVIS SERVER] Failed to send tool response to Gemini:", respErr);
              }
            }

            const serverContent = message.serverContent;
            if (!serverContent) return;

            // Handle interruption signal immediately
            if (serverContent.interrupted) {
              sendToClient({ type: "interrupted" });
            }

            // Forward all audio and text parts from the model turn
            const parts = serverContent.modelTurn?.parts;
            if (parts && Array.isArray(parts)) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  sendToClient({
                    type: "audio",
                    audio: part.inlineData.data,
                  });
                }
                if (part.text) {
                  sendToClient({
                    type: "model_text",
                    text: part.text,
                  });
                }
              }
            }

            // Forward real-time input speech transcription (user voice)
            if (serverContent.inputTranscription?.text) {
              sendToClient({
                type: "input_transcription",
                text: serverContent.inputTranscription.text,
                finished: Boolean(serverContent.inputTranscription.finished),
              });
            }

            // Forward real-time output speech transcription (JARVIS voice)
            if (serverContent.outputTranscription?.text) {
              sendToClient({
                type: "output_transcription",
                text: serverContent.outputTranscription.text,
                finished: Boolean(serverContent.outputTranscription.finished),
              });
            }

            // Notify when turn generation is complete
            if (serverContent.turnComplete) {
              sendToClient({ type: "turn_complete" });
            }
          },
          onerror: (err: any) => {
            if (isClosed) return;
            const rawMsg = err?.message || String(err || "Unknown Live API error");
            sendToClient({
              type: "error",
              code: "GEMINI_LIVE_ERROR",
              message: rawMsg.includes("API_KEY") || rawMsg.includes("403")
                ? "Invalid or unauthorized Gemini API key. Check Settings > Secrets."
                : "Unable to connect to JARVIS.",
              details: rawMsg,
            });
          },
          onclose: (event: any) => {
            if (isClosed) return;
            sendToClient({
              type: "session_closed",
              reason: event?.reason || "Gemini Live session closed.",
            });
          },
        },
      });

      activeLiveSession = await sessionPromise;
    } catch (err: any) {
      const rawMsg = err?.message || String(err || "Connection failed");
      sendToClient({
        type: "error",
        code: "GEMINI_CONNECTION_FAILED",
        message: "Unable to connect to JARVIS.",
        details: rawMsg,
      });
      clientWs.close(1011, "Gemini Live connection failed");
      return;
    }

    clientWs.on("message", (rawData) => {
      if (isClosed || !sessionPromise) return;
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === "ping") {
          sendToClient({ type: "pong" });
          return;
        }

        // Handle tool execution response from client
        if (msg.type === "tool_execution_response" && msg.callId) {
          const handler = pendingToolExecutions.get(msg.callId);
          if (handler) {
            pendingToolExecutions.delete(msg.callId);
            handler(msg.result || { success: msg.success, error: msg.error });
          }
          return;
        }

        if (msg.type === "audio" && typeof msg.audio === "string") {
          sessionPromise
            .then((session) => {
              if (!isClosed && session) {
                session.sendRealtimeInput({
                  audio: {
                    data: msg.audio,
                    mimeType: "audio/pcm;rate=16000",
                  },
                });
              }
            })
            .catch(() => {
              // Ignore transient send errors when closing
            });
        } else if (msg.type === "text" && typeof msg.text === "string") {
          sessionPromise
            .then((session) => {
              if (!isClosed && session) {
                session.sendRealtimeInput({
                  text: msg.text,
                });
              }
            })
            .catch(() => {});
        }
      } catch {
        // Ignore malformed JSON frames
      }
    });

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      if (sessionPromise) {
        sessionPromise
          .then((session) => {
            try {
              session?.close();
            } catch {
              // Ignore close errors
            }
          })
          .catch(() => {});
      }
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`JARVIS Live Server listening on http://localhost:${PORT}`);
  });
}

startServer();
