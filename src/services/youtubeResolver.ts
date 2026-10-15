/**
 * YouTube Track Resolver for J.A.R.V.I.S.
 *
 * Resolves a natural song/artist title into a specific YouTube video ID and title.
 * In browser: queries backend /api/youtube-resolve to prevent browser CORS blocks.
 * In Node.js / fallback: fetches YouTube search page directly.
 */

import { getBackendApiUrl } from "./backendConfig";

export interface ResolvedYouTubeTrack {
  resolved: boolean;
  videoId: string | null;
  videoTitle: string;
  videoUrl: string;
  searchUrl: string;
}

export async function resolveYouTubeTrack(query: string): Promise<ResolvedYouTubeTrack> {
  const cleanQuery = query.trim();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;

  if (!cleanQuery) {
    return {
      resolved: false,
      videoId: null,
      videoTitle: "",
      videoUrl: searchUrl,
      searchUrl,
    };
  }

  // 1. In browser, use backend endpoint to avoid browser CORS restrictions
  if (typeof window !== "undefined") {
    try {
      const endpoint = getBackendApiUrl(`/api/youtube-resolve?q=${encodeURIComponent(cleanQuery)}`);
      const backendRes = await fetch(endpoint, {
        signal: AbortSignal.timeout(6000),
      });
      if (backendRes.ok) {
        const data = (await backendRes.json()) as any;
        if (data && data.videoId) {
          return {
            resolved: true,
            videoId: data.videoId,
            videoTitle: data.videoTitle || cleanQuery,
            videoUrl: data.videoUrl || `https://www.youtube.com/watch?v=${data.videoId}`,
            searchUrl: data.searchUrl || searchUrl,
          };
        }
      }
    } catch (browserApiErr) {
      console.warn("[YOUTUBE RESOLVER] Backend resolve endpoint failed, checking direct fetch:", browserApiErr);
    }
  }

  // 2. Direct fetch (works in Node.js backend and Chrome extension contexts)
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const html = await res.text();
      const idMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);

      if (idMatch && idMatch[1]) {
        const videoId = idMatch[1];
        const videoTitle = titleMatch && titleMatch[1] ? titleMatch[1] : cleanQuery;
        return {
          resolved: true,
          videoId,
          videoTitle,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          searchUrl,
        };
      }
    }
  } catch (err) {
    console.warn("[YOUTUBE RESOLVER] Direct lookup failed, falling back to search URL:", err);
  }

  return {
    resolved: false,
    videoId: null,
    videoTitle: cleanQuery,
    videoUrl: searchUrl,
    searchUrl,
  };
}
