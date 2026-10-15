import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { WebSocket } from "ws";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const tokenRes = await ai.authTokens.create({});
  const token = (tokenRes.name || "").replace("auth_tokens/", "");

  const ws = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`
  );

  ws.on("open", () => {
    console.log("Connected to Google Gemini Live!");
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
        systemInstruction: {
          parts: [{ text: "You are JARVIS. Respond with a short greeting." }],
        },
      },
    };
    ws.send(JSON.stringify(setup));
  });

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.setupComplete) {
      console.log("Setup complete! Sending simulated user greeting text/audio...");
      // Send text input turn to prompt Gemini
      ws.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text: "Hello Jarvis, can you hear me?" }],
              },
            ],
            turnComplete: true,
          },
        })
      );
    }

    if (data.serverContent?.modelTurn?.parts) {
      for (const part of data.serverContent.modelTurn.parts) {
        if (part.text) {
          console.log("Gemini transcript:", part.text);
        }
        if (part.inlineData) {
          console.log(
            "Gemini Audio chunk received! Mime:",
            part.inlineData.mimeType,
            "Length:",
            part.inlineData.data?.length
          );
        }
      }
    }

    if (data.serverContent?.turnComplete) {
      console.log("🎉 Gemini turn completed successfully!");
      ws.close();
    }
  });

  ws.on("error", (err) => console.error("WS error:", err));
  ws.on("close", (code, reason) => console.log("Closed:", code, reason.toString()));
}

main().catch(console.error);
