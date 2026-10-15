import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { WebSocket } from "ws";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const tokenRes = await ai.authTokens.create({});
  const token = (tokenRes.name || "").replace("auth_tokens/", "");
  console.log("Token:", token);

  const ws = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`
  );

  ws.on("open", () => {
    console.log("WS Opened! Sending setup...");
    const setup = {
      setup: {
        model: "models/gemini-3.8-live",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Charon",
              },
            },
          },
        },
      },
    };
    ws.send(JSON.stringify(setup));
  });

  ws.on("message", (data) => {
    const text = data.toString();
    console.log("Received frame:", text.slice(0, 300));
    try {
      const parsed = JSON.parse(text);
      if (parsed.setupComplete) {
        console.log("🎉 SETUP COMPLETE RECEIVED FROM GEMINI LIVE!");
        ws.close();
      }
    } catch {}
  });

  ws.on("error", (err) => console.error("WS Error:", err));
  ws.on("close", (code, reason) => console.log("WS Closed:", code, reason.toString()));
}

main().catch(console.error);
