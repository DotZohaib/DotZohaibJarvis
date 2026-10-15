import type { IncomingMessage, ServerResponse } from "http";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MY_GEMINI_API_KEY") {
    res.statusCode = 401;
    res.end(
      JSON.stringify({
        success: false,
        code: "MISSING_API_KEY",
        error: "GEMINI_API_KEY is not configured in Vercel Environment Variables. Please configure GEMINI_API_KEY in Vercel Project Settings > Environment Variables.",
      })
    );
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const tokenRes = await ai.authTokens.create({});
    const token = (tokenRes.name || "").replace(/^auth_tokens\//, "");

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        success: true,
        token,
        model: "models/gemini-3.8-live",
        endpoint: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`,
      })
    );
  } catch (err: any) {
    console.error("[VERCEL /api/session ERROR]", err);
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        success: false,
        code: "SESSION_CREATION_FAILED",
        error: err?.message || "Failed to initialize Gemini Live ephemeral session.",
      })
    );
  }
}
