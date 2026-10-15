# J.A.R.V.I.S. Chrome Companion Extension v2.0.0

The J.A.R.V.I.S. Chrome Companion enables real-time desktop browser control, YouTube playback automation, tab switching, and webpage summarization for J.A.R.V.I.S. Voice Assistant (`http://localhost:3000`).

---

## Capabilities

- **Real Chrome Tab Creation**: Opens Google, YouTube, GitHub, Wikipedia, or custom URLs with navigation verification.
- **YouTube Playback Automation**: Automatically resolves requested songs (e.g., "Mola Ghazi Maan"), navigates directly to the video, and attempts playback.
- **Autoplay Verification**: Honestly verifies whether video playback is actively running or if browser policy held it paused, preventing false success messages.
- **Tab Switching & Closing**: Switch to next/previous tabs ("Agla tab kholo") or close active tabs.
- **Media Playback Control**: Pause, resume, stop, and volume controls for background media tabs ("Music band karo", "Pause karo").
- **Active Webpage Reading**: Reads clean textual content of the active tab for AI summarization.

---

## How to Install in Google Chrome (1 Minute)

1. Open **Google Chrome** and navigate to:
   `chrome://extensions`
2. In the top-right corner, switch the **Developer mode** toggle to **ON**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `chrome-extension` directory inside this project:
   `c:\Users\Hp\Downloads\jarvis-main\jarvis-main\ahmedgarva-main\ahmedgarva-main\chrome-extension`
5. Open or refresh `http://localhost:3000`.
6. J.A.R.V.I.S. will automatically detect the extension via its content script bridge.

---

## Verifying the Extension

- Once installed, the extension runs a background service worker (`background.js`) and injects a communication bridge (`content.js`) on `http://localhost:3000`.
- Try speaking or testing:
  - *"Jarvis, Mola Ghazi Maan song halayo"*
  - *"Jarvis, Google kholo"*
  - *"Jarvis, YouTube kholo"*
  - *"Jarvis, Chrome mein naya tab kholo"*
  - *"Jarvis, Agla tab kholo"*
  - *"Jarvis, Music band karo"*
