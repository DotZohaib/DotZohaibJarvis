import type { IncomingMessage, ServerResponse } from "http";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const query = url.searchParams.get("q") || "";

  if (!query.trim()) {
    res.statusCode = 400;
    res.end(JSON.stringify({ success: false, error: "Missing query parameter 'q'" }));
    return;
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      throw new Error(`YouTube responded with status ${response.status}`);
    }

    const html = await response.text();
    const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    let title: string | null = null;
    const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}/);
    if (titleMatch) {
      title = titleMatch[1];
    }

    if (videoId) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          videoId,
          title: title || query,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
        })
      );
    } else {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          videoId: null,
          title: query,
          videoUrl: searchUrl,
          embedUrl: null,
        })
      );
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: err?.message || "YouTube resolution failed" }));
  }
}
