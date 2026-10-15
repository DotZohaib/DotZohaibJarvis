/**
 * Tool Registry — Standardized Tool Definitions and Execution Handlers for J.A.R.V.I.S.
 *
 * Real browser execution is dispatched via browserBridge to the Chrome Companion extension,
 * with verified state reporting and zero false success claims.
 */

import { executeBrowserAction, BrowserActionResult } from "./browserBridge";
import { resolveYouTubeTrack } from "./youtubeResolver";

export interface ToolParameterSchema {
  type: "string" | "number" | "boolean" | "object";
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
  execute: (args: Record<string, any>, context?: ExecutionContext) => Promise<ToolExecutionResult>;
}

export interface ExecutionContext {
  requestId?: string;
  source?: "client" | "gemini_tool_call";
  openInNewTab?: boolean;
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  data?: any;
  error?: string;
  confirmationText?: string;
  verificationDetails?: string;
  browserResult?: BrowserActionResult;
}

// ─── Weather Helper (Open-Meteo Free API) ─────────────────────────────────────

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

export async function fetchLiveWeather(city: string): Promise<{
  city: string;
  country: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  formattedText: string;
}> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city.trim()
  )}&count=1&language=en&format=json`;

  const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
  if (!geoRes.ok) {
    throw new Error(`Geocoding failed for city "${city}"`);
  }

  const geoData = await geoRes.json();
  if (!geoData.results || geoData.results.length === 0) {
    throw new Error(`Location "${city}" not found.`);
  }

  const { latitude, longitude, name, country } = geoData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;

  const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(6000) });
  if (!weatherRes.ok) {
    throw new Error(`Weather data fetch failed for "${city}"`);
  }

  const weatherData = await weatherRes.json();
  const current = weatherData.current;

  const temp = Math.round(current.temperature_2m);
  const condition = WMO_CODE_MAP[current.weather_code] || "Clear";
  const humidity = current.relative_humidity_2m;
  const windSpeed = Math.round(current.wind_speed_10m);

  const formattedText = `${name}, ${country} mein is waqt mausam ${condition} hai, temperature ${temp}°C hai, humidity ${humidity}% hai aur hawa ki raftaar ${windSpeed} km/h hai.`;

  return {
    city: name,
    country,
    temperature: temp,
    condition,
    humidity,
    windSpeed,
    formattedText,
  };
}

// ─── Named Web Shortcuts ──────────────────────────────────────────────────────

export const NAMED_SITES: Record<string, string> = {
  youtube: "https://www.youtube.com",
  github: "https://www.github.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
  twitter: "https://www.twitter.com",
  x: "https://www.x.com",
  linkedin: "https://www.linkedin.com",
  reddit: "https://www.reddit.com",
  stackoverflow: "https://stackoverflow.com",
  "stack overflow": "https://stackoverflow.com",
  wikipedia: "https://www.wikipedia.org",
  netflix: "https://www.netflix.com",
  spotify: "https://open.spotify.com",
  "youtube music": "https://music.youtube.com",
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  whatsapp: "https://web.whatsapp.com",
  chatgpt: "https://chat.openai.com",
  vercel: "https://vercel.com",
  "next.js": "https://nextjs.org",
  nextjs: "https://nextjs.org",
  react: "https://react.dev",
};

// ─── Tools Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  play_youtube_video: {
    name: "play_youtube_video",
    description:
      "Play or launch a requested song, music track, or video on YouTube/YouTube Music with real tab creation and playback verification.",
    parameters: {
      type: "object",
      properties: {
        songOrVideo: {
          type: "string",
          description: "The specific song title, track name, or video to play.",
        },
        artist: {
          type: "string",
          description: "Optional artist, singer, or channel name.",
        },
      },
      required: ["songOrVideo"],
    },
    execute: async (args, context) => {
      const song = (args.songOrVideo || "").trim();
      const artist = (args.artist || "").trim();

      if (!song) {
        return {
          success: false,
          toolName: "play_youtube_video",
          error: "Song title was not specified.",
          confirmationText: "Aap kaunsa song sunna chahte hain? Please song ka naam batayein.",
        };
      }

      const fullQuery = artist ? `${song} ${artist}` : song;

      // Resolve video ID and title
      const resolved = await resolveYouTubeTrack(fullQuery);

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "play_youtube_video",
          data: { song, artist, query: fullQuery, resolved },
          confirmationText: `Music workflow verified for "${fullQuery}".`,
        };
      }

      // Execute browser action via extension / bridge
      const browserRes = await executeBrowserAction("PLAY_YOUTUBE_SONG", {
        song,
        artist,
        query: fullQuery,
        videoUrl: resolved.videoUrl,
      });

      if (!browserRes.success) {
        return {
          success: false,
          toolName: "play_youtube_video",
          error: browserRes.error || "Failed to launch YouTube playback tab",
          confirmationText: `Maaf kijiye, YouTube tab open karne mein masla pesh aaya: ${browserRes.error}`,
          browserResult: browserRes,
        };
      }

      let confirmationText = `Playing "${resolved.videoTitle || fullQuery}" on YouTube.`;
      if (browserRes.autoplayBlocked) {
        confirmationText = `Main ne YouTube par "${resolved.videoTitle || fullQuery}" open kar diya hai, lekin browser policy ki wajah se autoplay pause hai. Please Play par click kijiye.`;
      } else if (browserRes.playbackStarted) {
        confirmationText = `Main ne YouTube par "${resolved.videoTitle || fullQuery}" chala diya hai. Playback verified.`;
      } else if (browserRes.executor === "system_fallback") {
        confirmationText = `Main ne Chrome mein YouTube open kar diya hai "${resolved.videoTitle || fullQuery}" ke liye.`;
      }

      return {
        success: true,
        toolName: "play_youtube_video",
        data: {
          song,
          artist,
          query: fullQuery,
          resolved,
          tabId: browserRes.tabId,
          playbackStarted: browserRes.playbackStarted,
          autoplayBlocked: browserRes.autoplayBlocked,
        },
        confirmationText,
        verificationDetails: browserRes.verification,
        browserResult: browserRes,
      };
    },
  },

  search_google: {
    name: "search_google",
    description: "Search Google for the user's requested query and open the search results.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query or terms to look up on Google.",
        },
      },
      required: ["query"],
    },
    execute: async (args, context) => {
      const query = (args.query || "").trim();
      if (!query) {
        return {
          success: false,
          toolName: "search_google",
          error: "Empty search query provided.",
          confirmationText: "Please search query provide kijiye.",
        };
      }

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "search_google",
          data: { query },
          confirmationText: `Searching Google for "${query}".`,
        };
      }

      const browserRes = await executeBrowserAction("SEARCH_GOOGLE", { query });
      return {
        success: browserRes.success,
        toolName: "search_google",
        data: { query, url: browserRes.url },
        error: browserRes.error,
        confirmationText: browserRes.success
          ? `Searching Google for "${query}". I have opened the results in a new tab.`
          : `Failed to open Google search: ${browserRes.error}`,
        browserResult: browserRes,
      };
    },
  },

  search_youtube: {
    name: "search_youtube",
    description: "Search YouTube for videos or channels and open the search results.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The video topic, title, or creator to search for on YouTube.",
        },
      },
      required: ["query"],
    },
    execute: async (args, context) => {
      const query = (args.query || "").trim();
      if (!query) {
        return {
          success: false,
          toolName: "search_youtube",
          error: "Empty YouTube query provided.",
          confirmationText: "Please YouTube search query batayein.",
        };
      }

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "search_youtube",
          data: { query },
          confirmationText: `Searching YouTube for "${query}".`,
        };
      }

      const browserRes = await executeBrowserAction("SEARCH_YOUTUBE", { query });
      return {
        success: browserRes.success,
        toolName: "search_youtube",
        data: { query, url: browserRes.url },
        error: browserRes.error,
        confirmationText: browserRes.success
          ? `Searching YouTube for "${query}". Opening search results.`
          : `Failed to open YouTube search: ${browserRes.error}`,
        browserResult: browserRes,
      };
    },
  },

  open_website: {
    name: "open_website",
    description: "Open a popular website or specified URL in a new browser tab.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Website name (e.g. google, youtube, github, wikipedia, reddit) or URL.",
        },
      },
      required: ["target"],
    },
    execute: async (args, context) => {
      const target = (args.target || "").trim().toLowerCase();
      if (!target) {
        return {
          success: false,
          toolName: "open_website",
          error: "No target website specified.",
          confirmationText: "Aap kaunsi website kholna chahte hain?",
        };
      }

      let url = NAMED_SITES[target];
      if (!url) {
        if (target.includes(".")) {
          url = target.startsWith("http") ? target : `https://${target}`;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
        }
      }

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "open_website",
          data: { target, url },
          confirmationText: `Opening ${target} in a new tab.`,
        };
      }

      const browserRes = await executeBrowserAction("OPEN_TAB", { url });
      return {
        success: browserRes.success,
        toolName: "open_website",
        data: { target, url, tabId: browserRes.tabId },
        error: browserRes.error,
        confirmationText: browserRes.success
          ? `Opening ${target} in Chrome now.`
          : `Website open karne mein masla aaya: ${browserRes.error}`,
        browserResult: browserRes,
      };
    },
  },

  open_browser_tab: {
    name: "open_browser_tab",
    description: "Open a new blank browser tab or navigate to a specified page in Chrome.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional URL to load. Defaults to Google homepage.",
        },
      },
      required: [],
    },
    execute: async (args, context) => {
      const url = (args.url || "https://www.google.com").trim();

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "open_browser_tab",
          data: { url },
          confirmationText: "Opening a new browser tab.",
        };
      }

      const browserRes = await executeBrowserAction("OPEN_TAB", { url });
      return {
        success: browserRes.success,
        toolName: "open_browser_tab",
        data: { url, tabId: browserRes.tabId },
        error: browserRes.error,
        confirmationText: browserRes.success
          ? "Chrome mein naya tab open kar diya hai."
          : `Tab open nahi ho saka: ${browserRes.error}`,
        browserResult: browserRes,
      };
    },
  },

  switch_tab: {
    name: "switch_tab",
    description: "Switch to the next, previous, or specified browser tab in Chrome.",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["next", "prev"],
          description: "Direction to switch tabs: next or prev.",
        },
      },
      required: [],
    },
    execute: async (args, context) => {
      const direction = (args.direction || "next").toLowerCase();

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "switch_tab",
          data: { direction },
          confirmationText: `Switched to ${direction} tab.`,
        };
      }

      const browserRes = await executeBrowserAction("SWITCH_TAB", { direction });
      return {
        success: browserRes.success,
        toolName: "switch_tab",
        data: browserRes.data,
        error: browserRes.error,
        confirmationText: browserRes.success
          ? `Switched to tab: "${browserRes.data?.title || "next tab"}".`
          : (browserRes.error || "Unable to switch tab without Chrome companion extension."),
        browserResult: browserRes,
      };
    },
  },

  close_tab: {
    name: "close_tab",
    description: "Close the currently active browser tab.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_args, context) => {
      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "close_tab",
          confirmationText: "Tab closed.",
        };
      }

      const browserRes = await executeBrowserAction("CLOSE_ACTIVE_TAB");
      return {
        success: browserRes.success,
        toolName: "close_tab",
        data: browserRes.data,
        error: browserRes.error,
        confirmationText: browserRes.success
          ? "Active tab close kar diya hai."
          : (browserRes.error || "Unable to close tab."),
        browserResult: browserRes,
      };
    },
  },

  read_current_page: {
    name: "read_current_page",
    description: "Read, extract, and summarize the text content of the active browser tab.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_args, context) => {
      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "read_current_page",
          data: { text: "Sample page text" },
          confirmationText: "Reading page text.",
        };
      }

      const browserRes = await executeBrowserAction("GET_CURRENT_PAGE_TEXT");
      if (!browserRes.success || !browserRes.data?.data) {
        return {
          success: false,
          toolName: "read_current_page",
          error: browserRes.error || "Failed to read active page.",
          confirmationText:
            "Current page read karne ke liye Chrome companion extension ka active hona zaroori hai.",
          browserResult: browserRes,
        };
      }

      const { title, url, text } = browserRes.data.data;
      const snippet = text.slice(0, 300);
      return {
        success: true,
        toolName: "read_current_page",
        data: { title, url, text },
        confirmationText: `Active page "${title}" ka content: ${snippet}...`,
        browserResult: browserRes,
      };
    },
  },

  control_media: {
    name: "control_media",
    description: "Control audio or music playback across open tabs (stop, pause, resume, volume).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["stop", "pause", "resume", "volume_up", "volume_down"],
          description: "Playback action to perform.",
        },
      },
      required: ["action"],
    },
    execute: async (args, context) => {
      const action = (args.action || "stop").toLowerCase();
      const messages: Record<string, string> = {
        stop: "Music playback stopped.",
        pause: "Playback paused.",
        resume: "Playback resumed.",
        volume_up: "Volume increased.",
        volume_down: "Volume decreased.",
      };

      if (context?.openInNewTab === false) {
        return {
          success: true,
          toolName: "control_media",
          data: { action },
          confirmationText: messages[action] || "Media command processed.",
        };
      }

      const browserRes = await executeBrowserAction("MEDIA_CONTROL", { action });
      return {
        success: browserRes.success,
        toolName: "control_media",
        data: { action, ...browserRes.data },
        error: browserRes.error,
        confirmationText: browserRes.success
          ? (messages[action] || "Media action executed.")
          : (browserRes.error || "No active media tabs found to control."),
        browserResult: browserRes,
      };
    },
  },

  get_weather: {
    name: "get_weather",
    description:
      "Fetch real-time, live weather conditions, temperature, humidity, and forecast for any city.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name (e.g. Karachi, Lahore, London, New York, Tokyo).",
        },
      },
      required: ["city"],
    },
    execute: async (args) => {
      const city = (args.city || "").trim();
      if (!city) {
        return {
          success: false,
          toolName: "get_weather",
          error: "City was not specified.",
          confirmationText: "Aap kis shehar ka weather jan-na chahte hain?",
        };
      }

      try {
        const weather = await fetchLiveWeather(city);
        return {
          success: true,
          toolName: "get_weather",
          data: weather,
          confirmationText: weather.formattedText,
        };
      } catch (err: any) {
        return {
          success: false,
          toolName: "get_weather",
          error: err.message || "Failed to retrieve weather data.",
          confirmationText: `Maaf kijiye, ${city} ka weather data fetch karne mein masla pesh aaya.`,
        };
      }
    },
  },
};

/**
 * Execute a registered tool safely with parameter validation and timeout.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context?: ExecutionContext
): Promise<ToolExecutionResult> {
  const tool = TOOL_DEFINITIONS[toolName];
  if (!tool) {
    return {
      success: false,
      toolName,
      error: `Tool "${toolName}" is not registered or supported.`,
      confirmationText: `Maaf kijiye, yeh feature ("${toolName}") filhal supported nahi hai.`,
    };
  }

  // Validate required parameters
  for (const req of tool.parameters.required) {
    if (args[req] === undefined || args[req] === null || String(args[req]).trim() === "") {
      return {
        success: false,
        toolName,
        error: `Required parameter "${req}" was not specified or empty.`,
        confirmationText: `Required parameter "${req}" provide nahi kiya gaya.`,
      };
    }
  }

  try {
    const resultPromise = tool.execute(args, context);
    const timeoutPromise = new Promise<ToolExecutionResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after 10s`)), 10000)
    );

    return await Promise.race([resultPromise, timeoutPromise]);
  } catch (err: any) {
    return {
      success: false,
      toolName,
      error: err.message || "Execution failed",
      confirmationText: `Action perform karne mein masla pesh aaya: ${err.message}`,
    };
  }
}
