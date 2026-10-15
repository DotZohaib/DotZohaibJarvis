/**
 * J.A.R.V.I.S. Chrome Companion — Content Script Bridge
 *
 * Runs inside http://localhost:3000 to bridge window.postMessage from the web app
 * to the background service worker using chrome.runtime.sendMessage.
 */

(function () {
  const VERSION = "2.0.0";

  // Mark the page so the app can instantly check presence
  try {
    document.documentElement.setAttribute("data-jarvis-companion", "ready");
    document.documentElement.setAttribute("data-jarvis-companion-version", VERSION);
  } catch (e) {
    // Ignore DOM availability issues during early load
  }

  // Notify listeners that companion bridge is initialized
  try {
    window.dispatchEvent(
      new CustomEvent("jarvis-companion-ready", {
        detail: { version: VERSION },
      })
    );
  } catch (e) {}

  // Relay messages from the web page to the background service worker
  window.addEventListener("message", (event) => {
    // Only accept messages from same window and intended for JARVIS
    if (event.source !== window || !event.data || event.data.source !== "JARVIS_APP") {
      return;
    }

    const { requestId, action, payload } = event.data;

    // Fast-path for PING
    if (action === "PING") {
      window.postMessage(
        {
          source: "JARVIS_EXTENSION",
          requestId,
          response: {
            success: true,
            connected: true,
            version: VERSION,
          },
        },
        "*"
      );
      return;
    }

    try {
      chrome.runtime.sendMessage({ action, payload, requestId }, (response) => {
        const lastErr = chrome.runtime.lastError;
        const finalResponse = lastErr
          ? { success: false, error: lastErr.message || "Background worker unavailable" }
          : response || { success: false, error: "Empty response from extension background" };

        window.postMessage(
          {
            source: "JARVIS_EXTENSION",
            requestId,
            response: finalResponse,
          },
          "*"
        );
      });
    } catch (sendErr) {
      window.postMessage(
        {
          source: "JARVIS_EXTENSION",
          requestId,
          response: {
            success: false,
            error: sendErr?.message || "Failed to contact extension background worker",
          },
        },
        "*"
      );
    }
  });

  console.log(`[J.A.R.V.I.S. COMPANION] Content script bridge v${VERSION} active.`);
})();
