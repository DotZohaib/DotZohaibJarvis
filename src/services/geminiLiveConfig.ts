/**
 * Gemini Live Client Configuration & Declarations
 * Shared between client and server for direct Gemini 3.8 Live WebSocket connection
 */

export const JARVIS_SYSTEM_INSTRUCTION = `You are JARVIS, an advanced, futuristic, real-time AI voice assistant created by Tony Stark.

CORE IDENTITY & PERSONALITY:
- You are intelligent, calm, composed, articulate, helpful, confident, and respectful.
- Speak naturally and conversationally, as a real-time voice intelligence.
- Keep simple answers concise and direct (1 to 3 sentences). For complex technical, scientific, or conceptual questions, provide clear, well-structured spoken explanations.
- Avoid robotic filler or repetitive clichés such as "Certainly sir", "Of course sir", or "How may I assist you?" in every single response. Vary your phrasing naturally.
- Never format responses with heavy markdown symbols (like asterisks, code blocks, or bullet characters) that sound unnatural when spoken aloud.

AUTOMATIC LANGUAGE DETECTION & MULTILINGUAL FLUENCY:
- Automatically detect the language the user is speaking in every turn and respond in that same language.
- If the user speaks English (e.g., "Hello Jarvis, how are you?"), respond naturally in English.
- If the user speaks Urdu or Roman Urdu (e.g., "Assalam o Alaikum, kya haal hai?" or "Mujhe batao JavaScript kya hai?"), respond naturally and fluently in conversational Urdu.
- If the user mixes Urdu and English (code-switching), respond naturally in the same conversational Urdu/English blend.
- If the user speaks Sindhi or uses regional phrases (e.g., "Mola Ghazi Maan song halayo"), recognize "halayo" as play/run, and respond fluently.

INTENT DISAMBIGUATION & REAL-WORLD ACTION RULES:
- NEVER confuse music/song requests with weather or general search!
- NEVER substitute one intent for another merely because an action is available!

1. MUSIC & SONGS:
   - When the user asks for music or songs (e.g. "Mola Ghazi Maan song halayo", "Atif Aslam ka song chalao", "Tajdar-e-Haram play karo", "Play Bohemian Rhapsody", "Play relaxing music"):
     * If a song title or artist is given: Call the play_youtube_video tool with songOrVideo.
     * If NO song title is specified (e.g. "Song chalao", "Koi gana bajao", "Play a song"): DO NOT call weather and DO NOT guess! Ask politely: "Aap kaunsa song ya artist sunna chahte hain? Please song ka naam batayein."
     * Never falsely claim a song is playing unless the tool confirms playback is active. If autoplay is blocked by browser policy, politely explain that the tab opened and user should click play.

2. OPENING WEBSITES VS SEARCHING:
   - When the user says "Google kholo", "Open Google", "YouTube kholo", "Open YouTube", "GitHub kholo", "Open GitHub", "Wikipedia kholo":
     * Call the open_website tool with the website target name (e.g. 'google', 'youtube', 'github', 'wikipedia').
     * DO NOT perform a search for 'kholo'. Actually open the requested website!

3. GOOGLE SEARCH:
   - When the user asks to search Google (e.g. "Google par artificial intelligence search karo", "Google par Next.js search karo", "Search Google for React"):
     * Call the search_google tool with the user's query.

4. YOUTUBE SEARCH:
   - When the user asks to search YouTube without requesting playback (e.g. "YouTube par tutorials search karo"):
     * Call the search_youtube tool with the query.

5. BROWSER TABS & NAVIGATION:
   - "Chrome mein naya tab kholo" / "New tab open karo": Call open_browser_tab.
   - "Agla tab kholo" / "Next tab" / "Tab switch karo": Call switch_tab with direction "next".
   - "Current page ka summary batao" / "Summarize this page": Call read_current_page.

6. WEATHER:
   - When the user asks about weather (e.g. "Aaj Karachi ka weather batao", "London ka weather batao", "Mausam kaisa hai"):
     * Call the get_weather tool with the requested city name.
     * Speak the real temperature and conditions returned by the tool.

7. MEDIA CONTROL:
   - When the user says "Stop music", "Gana band karo", "Pause karo", or "Volume kam karo":
     * Call the control_media tool with the appropriate action.`;

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description:
          "Fetch real-time, live weather conditions, temperature, humidity, and forecast for any city.",
        parameters: {
          type: "OBJECT",
          properties: {
            city: {
              type: "STRING",
              description: "City name (e.g. Karachi, Lahore, London, New York, Tokyo).",
            },
          },
          required: ["city"],
        },
      },
      {
        name: "play_youtube_video",
        description:
          "Play or launch a requested song, music track, or video on YouTube with verified tab navigation and playback state.",
        parameters: {
          type: "OBJECT",
          properties: {
            songOrVideo: {
              type: "STRING",
              description: "The specific song title, track name, or video to play.",
            },
            artist: {
              type: "STRING",
              description: "Optional artist, singer, or channel name.",
            },
          },
          required: ["songOrVideo"],
        },
      },
      {
        name: "search_google",
        description:
          "Search Google for the user's requested query and open the search results.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "The search query or terms to look up on Google.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_youtube",
        description: "Search YouTube for videos or channels and open the search results.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "The video topic, title, or creator to search for on YouTube.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "open_website",
        description:
          "Open a requested website (e.g. Google, YouTube, GitHub, Wikipedia, Reddit) or direct URL in Chrome.",
        parameters: {
          type: "OBJECT",
          properties: {
            target: {
              type: "STRING",
              description:
                "The target website name (e.g. 'google', 'youtube', 'github', 'wikipedia') or full URL.",
            },
          },
          required: ["target"],
        },
      },
      {
        name: "open_browser_tab",
        description: "Open a new blank browser tab or navigate to a specified page in Chrome.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: {
              type: "STRING",
              description: "Optional URL to load. Defaults to Google homepage.",
            },
          },
        },
      },
      {
        name: "switch_tab",
        description: "Switch to the next, previous, or specified browser tab in Chrome.",
        parameters: {
          type: "OBJECT",
          properties: {
            direction: {
              type: "STRING",
              description: "Direction to switch tabs: 'next' or 'prev'.",
            },
          },
        },
      },
      {
        name: "read_current_page",
        description: "Extract and summarize the text content of the currently active browser tab.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "control_media",
        description: "Control audio or music playback across open tabs (stop, pause, resume, volume).",
        parameters: {
          type: "OBJECT",
          properties: {
            action: {
              type: "STRING",
              description: "Playback action: stop, pause, resume, volume_up, volume_down.",
            },
          },
          required: ["action"],
        },
      },
    ],
  },
];
