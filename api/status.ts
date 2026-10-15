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

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const configured = Boolean(key && key.trim() !== "" && key !== "MY_GEMINI_API_KEY");

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      configured,
      model: "gemini-3.8-live",
      message: configured
        ? "JARVIS Live neural link ready."
        : "Missing GEMINI_API_KEY environment variable. Please configure it in your Vercel Project Settings > Environment Variables.",
    })
  );
}
