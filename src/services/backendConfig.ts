/**
 * Central Backend Configuration & Environment URL Resolution
 *
 * In local development: same origin (Express serves both UI and APIs).
 * In production on Vercel: reads VITE_BACKEND_URL pointing to the deployed backend (Render/Railway).
 */

export function getBackendBaseUrl(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) {
    const envUrl = String(import.meta.env.VITE_BACKEND_URL).trim();
    if (envUrl !== "") {
      return envUrl.replace(/\/$/, "");
    }
  }
  return "";
}

export function getBackendWsUrl(pathWithParams = "/live"): string {
  const base = getBackendBaseUrl();
  const cleanPath = pathWithParams.startsWith("/") ? pathWithParams : `/${pathWithParams}`;

  if (base === "") {
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}${cleanPath}`;
    }
    return `ws://localhost:3000${cleanPath}`;
  }

  const wsProtocol = base.startsWith("https") ? "wss" : "ws";
  const hostPart = base.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${hostPart}${cleanPath}`;
}

export function getBackendApiUrl(endpoint: string): string {
  const base = getBackendBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}

export function getBackendConnectionHelpText(): string {
  const base = getBackendBaseUrl();
  if (base) {
    return `Unable to connect to JARVIS backend at ${base}. Please verify your backend server is online.`;
  }
  if (typeof window !== "undefined") {
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!isLocal) {
      return "Backend connection failed. Set VITE_BACKEND_URL in your Vercel project environment variables pointing to your deployed backend (e.g. Railway or Render).";
    }
  }
  return "Unable to connect to JARVIS. Please ensure the server is running.";
}

