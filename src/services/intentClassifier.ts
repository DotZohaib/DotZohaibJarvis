/**
 * Intent Classifier — Multilingual Intent Detection for J.A.R.V.I.S.
 *
 * Reliably classifies natural voice commands in English, Urdu, Roman Urdu,
 * Sindhi phrases (e.g. "halayo"), and code-switched queries into concrete actions.
 */

export type RecognizedIntent =
  | "play_music"
  | "search_youtube"
  | "search_google"
  | "get_weather"
  | "open_browser_tab"
  | "open_website"
  | "switch_tab"
  | "close_tab"
  | "read_page"
  | "control_media"
  | "clarification_needed"
  | "conversational";

export interface ClassifiedCommand {
  requestId: string;
  rawText: string;
  normalizedText: string;
  intent: RecognizedIntent;
  toolName?: string;
  args?: Record<string, any>;
  requiresClarification?: boolean;
  clarificationPrompt?: string;
  isDuplicate?: boolean;
}

// ─── Deduplication State ──────────────────────────────────────────────────────

const recentCommandsCache = new Map<string, number>();

function isRecentDuplicate(normalized: string, windowMs = 3500): boolean {
  const now = Date.now();
  const lastTime = recentCommandsCache.get(normalized);
  if (lastTime && now - lastTime < windowMs) {
    return true;
  }
  recentCommandsCache.set(normalized, now);
  // Periodic cleanup
  if (recentCommandsCache.size > 50) {
    for (const [k, t] of recentCommandsCache.entries()) {
      if (now - t > 10000) recentCommandsCache.delete(k);
    }
  }
  return false;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:\"\'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let requestCounter = 0;
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

const KNOWN_SITES = new Set([
  "youtube",
  "google",
  "github",
  "wikipedia",
  "gmail",
  "twitter",
  "x",
  "linkedin",
  "reddit",
  "stackoverflow",
  "netflix",
  "spotify",
  "chatgpt",
  "vercel",
  "facebook",
  "instagram",
  "whatsapp",
]);

// ─── Intent Matchers ──────────────────────────────────────────────────────────

export function classifyIntent(rawText: string): ClassifiedCommand {
  const requestId = generateRequestId();
  const normalized = normalizeVoiceText(rawText);

  // Strip leading wake-words like "jarvis", "hey jarvis", "suno jarvis", "bhai jarvis"
  const clean = normalized
    .replace(/^(?:hey|hi|hello|suno|bhai)?\s*jarvis\s+/i, "")
    .replace(/^jarvis\s+/i, "")
    .trim();

  // Check duplicate
  const isDuplicate = isRecentDuplicate(clean);

  // ── 1. Weather Intent ───────────────────────────────────────────────────────
  const weatherTriggers = ["weather", "mausam", "temperature", "barish", "forecast"];
  if (weatherTriggers.some((t) => clean.includes(t))) {
    let city = "";
    const urduMatch = clean.match(/(?:aaj|kal)?\s*([a-z\s]+?)\s*(?:ka|ki|mein|me)\s*(?:weather|mausam)/i);
    const engMatch = clean.match(/(?:weather|temperature|forecast)\s*(?:in|for|of|at)?\s*([a-z\s]+)/i);

    if (urduMatch && urduMatch[1]) {
      city = urduMatch[1].trim();
    } else if (engMatch && engMatch[1]) {
      city = engMatch[1].trim();
    } else {
      const words = clean.split(" ");
      const wIdx = words.findIndex((w) => weatherTriggers.includes(w));
      if (wIdx > 0) {
        city = words.slice(0, wIdx).join(" ").trim();
      } else if (wIdx >= 0 && wIdx < words.length - 1) {
        city = words.slice(wIdx + 1).join(" ").trim();
      }
    }

    city = city
      .replace(/\b(aaj|kal|batao|kya|hai|bataen|check|karo|tell|me|the|today|current)\b/g, "")
      .trim();

    if (!city || city.length < 2) {
      city = "Karachi";
    }

    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "get_weather",
      toolName: "get_weather",
      args: { city },
      isDuplicate,
    };
  }

  // ── 2. Media Controls (Stop / Pause / Resume / Volume) ──────────────────────
  if (
    clean === "stop" ||
    clean === "stop music" ||
    clean === "music band karo" ||
    clean === "gana band karo" ||
    clean === "gana roko" ||
    clean === "band karo" ||
    clean.includes("stop playback")
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "control_media",
      toolName: "control_media",
      args: { action: "stop" },
      isDuplicate,
    };
  }

  if (
    clean === "pause" ||
    clean === "pause music" ||
    clean === "pause karo" ||
    clean === "gana pause karo"
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "control_media",
      toolName: "control_media",
      args: { action: "pause" },
      isDuplicate,
    };
  }

  if (
    clean === "resume" ||
    clean === "resume music" ||
    clean === "play again" ||
    clean === "gana resume karo" ||
    clean === "continue music"
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "control_media",
      toolName: "control_media",
      args: { action: "resume" },
      isDuplicate,
    };
  }

  if (clean.includes("volume kam") || clean.includes("lower volume") || clean.includes("volume down")) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "control_media",
      toolName: "control_media",
      args: { action: "volume_down" },
      isDuplicate,
    };
  }

  if (clean.includes("volume barhao") || clean.includes("raise volume") || clean.includes("volume up")) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "control_media",
      toolName: "control_media",
      args: { action: "volume_up" },
      isDuplicate,
    };
  }

  // ── 3. Page Summary / Reading ───────────────────────────────────────────────
  if (
    clean.includes("summary") ||
    clean.includes("summarize") ||
    clean.includes("page par kya hai") ||
    clean.includes("read this page") ||
    clean.includes("read page") ||
    clean.includes("page parh kar")
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "read_page",
      toolName: "read_current_page",
      args: {},
      isDuplicate,
    };
  }

  // ── 4. Tab Switching & Management ───────────────────────────────────────────
  if (
    clean.includes("agla tab") ||
    clean.includes("next tab") ||
    clean.includes("switch tab") ||
    clean.includes("dusra tab")
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "switch_tab",
      toolName: "switch_tab",
      args: { direction: "next" },
      isDuplicate,
    };
  }

  if (clean.includes("pichla tab") || clean.includes("previous tab") || clean.includes("prev tab")) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "switch_tab",
      toolName: "switch_tab",
      args: { direction: "prev" },
      isDuplicate,
    };
  }

  if (
    clean === "tab band karo" ||
    clean === "close tab" ||
    clean === "tab close karo" ||
    clean === "current tab band karo"
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "close_tab",
      toolName: "close_tab",
      args: {},
      isDuplicate,
    };
  }

  if (
    clean.includes("naya tab") ||
    clean.includes("new tab") ||
    clean === "tab kholo" ||
    clean === "open tab" ||
    clean === "open a new tab"
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "open_browser_tab",
      toolName: "open_browser_tab",
      args: { url: "https://www.google.com" },
      isDuplicate,
    };
  }

  // ── 5. Named Website Opening (Urdu & English syntax) ────────────────────────
  // Matches: "Google kholo", "YouTube open karo", "Open GitHub", "Wikipedia kholo"
  const openEndMatch = clean.match(/^([a-z0-9_\-\.]+)\s+(?:kholo|open karo|launch karo)$/i);
  const openStartMatch = clean.match(/^(?:open|kholo|launch|go to|navigate to)\s+([a-z0-9_\-\.]+)$/i);

  const websiteTargetCandidate = (openEndMatch ? openEndMatch[1] : openStartMatch ? openStartMatch[1] : "")
    .toLowerCase()
    .trim();

  if (
    websiteTargetCandidate &&
    (KNOWN_SITES.has(websiteTargetCandidate) ||
      websiteTargetCandidate.includes(".com") ||
      websiteTargetCandidate.includes(".org") ||
      websiteTargetCandidate.includes(".dev") ||
      websiteTargetCandidate.includes(".net"))
  ) {
    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "open_website",
      toolName: "open_website",
      args: { target: websiteTargetCandidate },
      isDuplicate,
    };
  }

  // ── 6. Explicit Search Requests ─────────────────────────────────────────────
  // YouTube Search: "YouTube par Mola Ghazi Maan search karo"
  if (
    clean.includes("youtube") &&
    (clean.includes("search") || clean.includes("dhundo") || clean.includes("khojo")) &&
    !clean.includes("song") &&
    !clean.includes("gana") &&
    !clean.includes("halayo")
  ) {
    let query = clean
      .replace(/^youtube\s*(?:par|pe|mein)?\s*/i, "")
      .replace(/^(?:search\s+youtube\s+for|search\s+for|search)\s+/i, "")
      .replace(/\s*(?:search karo|search|dhundo|khojo)$/i, "")
      .replace(/\byoutube\b/g, "")
      .trim();

    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "search_youtube",
      toolName: "search_youtube",
      args: { query: query || "trending" },
      isDuplicate,
    };
  }

  // Google Search: "Google par artificial intelligence search karo"
  const isExplicitGoogleSearch =
    clean.match(/(?:google\s+(?:par|pe|mein)|search\s+google\s+for)\s+(.+?)(?:\s+(?:search karo|dhundo))?$/i) ||
    clean.match(/^(.+?)\s+google\s+par\s+search\s+karo$/i) ||
    (clean.includes("google") && clean.includes("search") && !clean.includes("kholo"));

  if (isExplicitGoogleSearch) {
    let query = clean
      .replace(/^google\s*(?:par|pe|mein)?\s*/i, "")
      .replace(/^(?:search\s+google\s+for|search\s+for|google\s+for|google)\s+/i, "")
      .replace(/\s*(?:search karo|search karain|dhundo|find karo)$/i, "")
      .replace(/\bgoogle\b/g, "")
      .trim();

    if (query && query !== "kholo" && query !== "open") {
      return {
        requestId,
        rawText,
        normalizedText: clean,
        intent: "search_google",
        toolName: "search_google",
        args: { query },
        isDuplicate,
      };
    }
  }

  // ── 7. Music Playback / Songs (English, Urdu, Sindhi "halayo") ───────────────
  // Examples:
  // "Jarvis, Mola Ghazi Maan song halayo."
  // "YouTube par Mola Ghazi Maan chalao."
  // "Atif Aslam ka song chalao."
  // "Play Bohemian Rhapsody"
  // "Play relaxing music"
  const isMusicPhrase =
    clean.includes("song") ||
    clean.includes("gana") ||
    clean.includes("geet") ||
    clean.includes("music") ||
    clean.includes("halayo") || // Sindhi for play/run!
    clean.includes("chalao") ||
    clean.includes("bajao") ||
    clean.includes("lagao") ||
    clean.includes("play");

  if (isMusicPhrase) {
    // Missing song title check
    const bareMusicTriggers = new Set([
      "song chalao",
      "gana chalao",
      "gana bajao",
      "gana lagao",
      "gana sunao",
      "koi gana chalao",
      "koi song chalao",
      "koi bhi song chalao",
      "play song",
      "play a song",
      "play music",
      "play some music",
      "music chalao",
      "music play karo",
      "song halayo",
      "gana halayo",
    ]);

    if (bareMusicTriggers.has(clean)) {
      return {
        requestId,
        rawText,
        normalizedText: clean,
        intent: "play_music",
        requiresClarification: true,
        clarificationPrompt:
          "Aap kaunsa song ya artist sunna chahte hain? Please song ka naam batayein.",
        isDuplicate,
      };
    }

    // Extract song/artist name
    let query = clean
      // Strip YouTube context
      .replace(/^youtube\s*(?:par|pe|mein|on)?\s*/i, "")
      // Strip verbs at end: "halayo", "chalao", "play karo", "bajao", "lagao", "sunao"
      .replace(/\s*(?:play karo|chalao|chala do|chalaen|lagao|laga do|sunao|play|bajao|baja do|halayo)$/i, "")
      // Strip verbs at start
      .replace(/^(?:play|chalao|lagao|sunao|baja)\s+/i, "")
      // Strip connective phrases
      .replace(/\s*(?:ka|ki|ke)\s*(?:song|gana|music)\s*$/i, "")
      // Strip remaining bare entity descriptors
      .replace(/\b(song|gana|geet|music)\b/g, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();

    if (!query || query.length < 2) {
      return {
        requestId,
        rawText,
        normalizedText: clean,
        intent: "play_music",
        requiresClarification: true,
        clarificationPrompt:
          "Aap kaunsa song ya artist sunna chahte hain? Please song ka naam batayein.",
        isDuplicate,
      };
    }

    return {
      requestId,
      rawText,
      normalizedText: clean,
      intent: "play_music",
      toolName: "play_youtube_video",
      args: { songOrVideo: query },
      isDuplicate,
    };
  }

  // ── 8. Conversational / General AI Turn ─────────────────────────────────────
  return {
    requestId,
    rawText,
    normalizedText: clean,
    intent: "conversational",
    isDuplicate,
  };
}
