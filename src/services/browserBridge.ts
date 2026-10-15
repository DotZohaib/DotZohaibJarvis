/**
 * Browser Bridge — Coordinates Browser Control between Web App, Companion Extension & Server
 *
 * Primary execution: J.A.R.V.I.S. Chrome Companion extension (via content script bridge)
 * Fallback execution: Backend system browser launcher (bypasses browser popup blockers on localhost)
 */

import { getBackendApiUrl } from "./backendConfig";

export interface BrowserActionResult {
  success: boolean;
  action: string;
  tabId?: number;
  url?: string;
  data?: any;
  error?: string;
  playbackStarted?: boolean;
  autoplayBlocked?: boolean;
  verification?: string;
  executor: "chrome_extension" | "system_fallback" | "none";
}

let isCompanionAvailable = false;
let companionVersion = "";
const pendingRequests = new Map<
  string,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: number;
  }
>();

// Listen for extension responses via postMessage
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "JARVIS_EXTENSION") {
      return;
    }

    const { requestId, response } = event.data;

    // Handle PING / Status announcements
    if (response?.connected) {
      isCompanionAvailable = true;
      companionVersion = response.version || "2.0.0";
    }

    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      clearTimeout(pending.timer);
      pendingRequests.delete(requestId);
      pending.resolve(response);
    }
  });

  // Check document dataset attribute set by content script
  if (document.documentElement.getAttribute("data-jarvis-companion") === "ready") {
    isCompanionAvailable = true;
  }

  // Listen for initial announcement event
  window.addEventListener("jarvis-companion-ready", () => {
    isCompanionAvailable = true;
  });
}

/**
 * Checks whether the Chrome Companion Extension is active.
 */
export async function checkCompanionStatus(timeoutMs = 1200): Promise<{
  connected: boolean;
  version?: string;
}> {
  if (typeof window === "undefined") {
    return { connected: false };
  }

  const reqId = `ping_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const res = await new Promise<any>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingRequests.delete(reqId);
        resolve({ connected: false });
      }, timeoutMs);

      pendingRequests.set(reqId, { resolve, reject, timer });
      window.postMessage(
        {
          source: "JARVIS_APP",
          requestId: reqId,
          action: "PING",
        },
        "*"
      );
    });

    if (res?.connected) {
      isCompanionAvailable = true;
      companionVersion = res.version || "2.0.0";
      return { connected: true, version: companionVersion };
    }
  } catch {
    // Ping failed
  }

  return { connected: isCompanionAvailable, version: companionVersion };
}

export function isCompanionExtensionConnected(): boolean {
  return isCompanionAvailable;
}


/**
 * Fallback to backend system browser launcher (e.g. Windows Start-Process)
 * or client-side new tab navigation when Chrome companion extension is not loaded.
 */
async function launchViaSystemFallback(url: string): Promise<boolean> {
  // 1. If backend system launcher is available (desktop / local host), try it
  try {
    const endpoint = getBackendApiUrl("/api/open-system-browser");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return true;
    }
  } catch {
    // Backend unreachable or running on remote Vercel domain without local OS bridge
  }

  // 2. Client-side browser tab opening (works on Android, iOS, tablets, and desktop)
  if (typeof window !== "undefined") {
    try {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) return true;

      // Programmatic link fallback for strict mobile browser popup blockers
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Execute a browser action with end-to-end verification.
 */
export async function executeBrowserAction(
  action: string,
  payload: Record<string, any> = {},
  timeoutMs = 9000
): Promise<BrowserActionResult> {
  const reqId = `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 1. Check if Chrome Companion Extension is connected
  const status = await checkCompanionStatus(600);

  if (status.connected) {
    try {
      const extResponse = await new Promise<any>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingRequests.delete(reqId);
          reject(new Error(`Companion action "${action}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingRequests.set(reqId, { resolve, reject, timer });

        window.postMessage(
          {
            source: "JARVIS_APP",
            requestId: reqId,
            action,
            payload,
          },
          "*"
        );
      });

      return {
        success: Boolean(extResponse.success),
        action,
        tabId: extResponse.tabId,
        url: extResponse.url,
        data: extResponse,
        error: extResponse.error,
        playbackStarted: extResponse.playbackStarted,
        autoplayBlocked: extResponse.autoplayBlocked,
        verification: extResponse.verification,
        executor: "chrome_extension",
      };
    } catch (err: any) {
      console.warn(`[BROWSER BRIDGE] Extension execution error for ${action}:`, err);
    }
  }

  // 2. Fallback when Chrome Extension is not installed / connected
  console.log(`[BROWSER BRIDGE] Extension not detected for ${action}. Evaluating fallback...`);

  if (action === "OPEN_TAB" || action === "SEARCH_GOOGLE" || action === "SEARCH_YOUTUBE" || action === "PLAY_YOUTUBE_SONG") {
    let targetUrl = payload.url || "https://www.google.com";

    if (action === "SEARCH_GOOGLE") {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(payload.query || "")}`;
    } else if (action === "SEARCH_YOUTUBE") {
      targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(payload.query || "")}`;
    } else if (action === "PLAY_YOUTUBE_SONG") {
      const query = payload.artist ? `${payload.song} ${payload.artist}` : payload.song;
      targetUrl = payload.videoUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }

    const opened = await launchViaSystemFallback(targetUrl);
    return {
      success: opened,
      action,
      url: targetUrl,
      executor: "system_fallback",
      playbackStarted: false,
      verification: opened
        ? "Opened in Chrome via system launcher (Companion extension not loaded; automated playback checking requires extension)"
        : "Failed to open browser tab",
      error: opened ? undefined : "Browser could not be launched",
    };
  }

  // Tab switching, media control, and page reading strictly require the extension
  return {
    success: false,
    action,
    executor: "none",
    error: `Action "${action}" requires J.A.R.V.I.S. Chrome Companion extension to be loaded in chrome://extensions.`,
    verification: "Companion extension unavailable",
  };
}
