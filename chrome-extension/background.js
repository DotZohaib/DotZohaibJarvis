/**
 * J.A.R.V.I.S. Chrome Companion — Background Service Worker v2.0.0
 *
 * Provides real Chrome browser control:
 * - Tab creation, switching, and closing
 * - YouTube song resolution, automated navigation, and playback verification
 * - Media playback control across open media tabs
 * - Active webpage text extraction
 */

function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Asynchronously wait for tab to complete loading ─────────────────────────

function waitForTabComplete(tabId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let timer = null;

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve({ success: true, tab });
      }
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    timer = setTimeout(() => {
      cleanup();
      // Even if timeout fires, tab might still be usable
      chrome.tabs.get(tabId, (tab) => {
        resolve({ success: Boolean(tab), tab, timedOut: true });
      });
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─── Extract Video ID & Title from YouTube Search ────────────────────────────

async function resolveYouTubeTrack(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) throw new Error(`YouTube search HTTP ${response.status}`);
    const html = await response.text();

    const idMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);

    if (idMatch && idMatch[1]) {
      return {
        resolved: true,
        videoId: idMatch[1],
        videoTitle: titleMatch ? titleMatch[1] : query,
        videoUrl: `https://www.youtube.com/watch?v=${idMatch[1]}&autoplay=1`,
        searchUrl,
      };
    }
  } catch (err) {
    console.warn("[JARVIS EXTENSION] YouTube resolution error:", err);
  }

  return {
    resolved: false,
    videoId: null,
    videoTitle: query,
    videoUrl: searchUrl,
    searchUrl,
  };
}

// ─── Main Action Router ──────────────────────────────────────────────────────

async function handleAction(action, payload = {}) {
  switch (action) {
    case "PING":
    case "CHECK_STATUS": {
      return {
        success: true,
        connected: true,
        version: "2.0.0",
        timestamp: Date.now(),
      };
    }

    case "OPEN_TAB": {
      const targetUrl = payload.url || "https://www.google.com";
      if (!isValidUrl(targetUrl)) {
        return { success: false, error: `Invalid URL: "${targetUrl}"` };
      }

      return new Promise((resolve) => {
        chrome.tabs.create({ url: targetUrl, active: payload.active !== false }, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({
              success: false,
              error: chrome.runtime.lastError?.message || "Failed to create tab",
            });
          } else {
            resolve({
              success: true,
              tabId: tab.id,
              url: targetUrl,
            });
          }
        });
      });
    }

    case "SWITCH_TAB": {
      return new Promise((resolve) => {
        if (typeof payload.tabId === "number") {
          chrome.tabs.update(payload.tabId, { active: true }, (tab) => {
            if (chrome.runtime.lastError || !tab) {
              resolve({ success: false, error: chrome.runtime.lastError?.message });
            } else {
              resolve({ success: true, activeTabId: tab.id, title: tab.title });
            }
          });
          return;
        }

        chrome.tabs.query({ currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length <= 1) {
            resolve({ success: false, message: "No other tabs to switch to." });
            return;
          }

          const activeIdx = tabs.findIndex((t) => t.active);
          const direction = payload.direction === "prev" ? -1 : 1;
          const nextIdx = (activeIdx + direction + tabs.length) % tabs.length;
          const targetTab = tabs[nextIdx];

          chrome.tabs.update(targetTab.id, { active: true }, (updated) => {
            if (chrome.runtime.lastError || !updated) {
              resolve({ success: false, error: chrome.runtime.lastError?.message });
            } else {
              resolve({
                success: true,
                activeTabId: updated.id,
                title: updated.title,
                url: updated.url,
              });
            }
          });
        });
      });
    }

    case "CLOSE_ACTIVE_TAB": {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0 || !tabs[0].id) {
            resolve({ success: false, error: "No active tab found to close." });
            return;
          }
          const tabId = tabs[0].id;
          chrome.tabs.remove(tabId, () => {
            resolve({ success: true, closedTabId: tabId });
          });
        });
      });
    }

    case "PLAY_YOUTUBE_SONG": {
      const song = (payload.song || payload.songOrVideo || "").trim();
      const artist = (payload.artist || "").trim();
      const query = artist ? `${song} ${artist}` : song;

      if (!query) {
        return { success: false, error: "Song title not specified." };
      }

      // Step 1: Resolve YouTube top video
      const resolvedTrack = await resolveYouTubeTrack(query);

      // Step 2: Open tab in Chrome
      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url: resolvedTrack.videoUrl, active: true }, (created) => {
          resolve(created);
        });
      });

      if (!tab || !tab.id) {
        return { success: false, error: "Failed to open YouTube tab in Chrome." };
      }

      // Step 3: Wait for tab navigation to finish
      await waitForTabComplete(tab.id, 7000);

      // Step 4: If it is a direct watch URL, attempt playback and verify video state
      if (resolvedTrack.resolved && resolvedTrack.videoId) {
        // Wait a brief tick for DOM video element mounting
        await new Promise((r) => setTimeout(r, 800));

        try {
          const scriptResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const video = document.querySelector("video");
              if (!video) {
                return { hasVideo: false, title: document.title };
              }

              // Unmute if muted by default
              if (video.muted) {
                video.muted = false;
              }

              let playCalled = false;
              if (video.paused) {
                try {
                  const p = video.play();
                  playCalled = true;
                  if (p && p.catch) {
                    p.catch((err) => {
                      console.warn("Autoplay blocked:", err);
                    });
                  }
                } catch (e) {}
              }

              return {
                hasVideo: true,
                isPlaying: !video.paused,
                currentTime: video.currentTime,
                duration: video.duration,
                title: document.title,
                playCalled,
              };
            },
          });

          const playbackData = scriptResults?.[0]?.result || {};
          const isPlaying = Boolean(playbackData.isPlaying);

          return {
            success: true,
            tabId: tab.id,
            url: resolvedTrack.videoUrl,
            songName: resolvedTrack.videoTitle,
            videoId: resolvedTrack.videoId,
            playbackStarted: isPlaying,
            autoplayBlocked: !isPlaying,
            verification: isPlaying
              ? "Playback active and verified"
              : "Video page loaded, autoplay requires user click",
          };
        } catch (scriptErr) {
          return {
            success: true,
            tabId: tab.id,
            url: resolvedTrack.videoUrl,
            songName: resolvedTrack.videoTitle,
            videoId: resolvedTrack.videoId,
            playbackStarted: false,
            verification: "Video page opened (script inspection restricted)",
          };
        }
      }

      // Fallback: search results opened
      return {
        success: true,
        tabId: tab.id,
        url: resolvedTrack.searchUrl,
        songName: query,
        playbackStarted: false,
        verification: "YouTube search results opened in new tab",
      };
    }

    case "SEARCH_GOOGLE": {
      const query = (payload.query || "").trim();
      if (!query) return { success: false, error: "Empty search query" };

      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return new Promise((resolve) => {
        chrome.tabs.create({ url, active: true }, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({ success: false, error: chrome.runtime.lastError?.message });
          } else {
            resolve({ success: true, tabId: tab.id, url, query });
          }
        });
      });
    }

    case "SEARCH_YOUTUBE": {
      const query = (payload.query || "").trim();
      if (!query) return { success: false, error: "Empty YouTube query" };

      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return new Promise((resolve) => {
        chrome.tabs.create({ url, active: true }, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({ success: false, error: chrome.runtime.lastError?.message });
          } else {
            resolve({ success: true, tabId: tab.id, url, query });
          }
        });
      });
    }

    case "MEDIA_CONTROL": {
      const mediaAction = (payload.action || "toggle").toLowerCase();

      return new Promise((resolve) => {
        // Query for YouTube tabs or any audible tabs
        chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            // Also check audible tabs if no YouTube tab found
            chrome.tabs.query({ audible: true }, (audibleTabs) => {
              if (!audibleTabs || audibleTabs.length === 0) {
                resolve({
                  success: false,
                  message: "No active YouTube or audio tabs found to control.",
                });
                return;
              }
              executeMediaOnTab(audibleTabs[0], mediaAction, resolve);
            });
            return;
          }
          executeMediaOnTab(tabs[0], mediaAction, resolve);
        });
      });
    }

    case "GET_CURRENT_PAGE_TEXT": {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (!tabs || tabs.length === 0 || !tabs[0].id) {
            resolve({ success: false, error: "No active browser tab found." });
            return;
          }

          const targetTab = tabs[0];
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              func: () => {
                const clone = document.body.cloneNode(true);
                // Remove scripts, styles, iframes
                const removeTags = ["script", "style", "noscript", "iframe", "svg"];
                removeTags.forEach((tag) => {
                  clone.querySelectorAll(tag).forEach((el) => el.remove());
                });
                const cleanText = (clone.innerText || "").replace(/\s+/g, " ").trim();
                return {
                  title: document.title,
                  url: window.location.href,
                  text: cleanText.slice(0, 3500),
                };
              },
            });

            const data = results?.[0]?.result;
            resolve({ success: Boolean(data), data });
          } catch (err) {
            resolve({
              success: false,
              error: err?.message || "Failed to extract text from page",
            });
          }
        });
      });
    }

    default:
      return { success: false, error: `Unknown action: "${action}"` };
  }
}

function executeMediaOnTab(targetTab, cmd, resolve) {
  if (!targetTab || !targetTab.id) {
    resolve({ success: false, message: "Invalid target tab ID." });
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId: targetTab.id },
      func: (command) => {
        const video = document.querySelector("video") || document.querySelector("audio");
        if (!video) return { executed: false, error: "No video or audio element found." };

        switch (command) {
          case "stop":
          case "pause": {
            video.pause();
            return { executed: true, state: "paused" };
          }
          case "resume":
          case "play": {
            video.play();
            return { executed: true, state: "playing" };
          }
          case "volume_up": {
            video.volume = Math.min(1, video.volume + 0.15);
            return { executed: true, volume: Math.round(video.volume * 100) };
          }
          case "volume_down": {
            video.volume = Math.max(0, video.volume - 0.15);
            return { executed: true, volume: Math.round(video.volume * 100) };
          }
          default: {
            if (video.paused) {
              video.play();
              return { executed: true, state: "playing" };
            } else {
              video.pause();
              return { executed: true, state: "paused" };
            }
          }
        }
      },
      args: [cmd],
    },
    (results) => {
      const res = results?.[0]?.result || {};
      resolve({
        success: Boolean(res.executed),
        tabId: targetTab.id,
        tabTitle: targetTab.title,
        ...res,
      });
    }
  );
}

// ─── Listeners ───────────────────────────────────────────────────────────────

// Internal messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, payload } = request || {};
  handleAction(action, payload).then((result) => {
    sendResponse(result);
  });
  return true; // Keep channel open for async response
});

// External messages from web pages via externally_connectable
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  const { action, payload } = request || {};
  handleAction(action, payload).then((result) => {
    sendResponse(result);
  });
  return true;
});

console.log("[J.A.R.V.I.S. COMPANION] Background service worker v2.0.0 initialized.");
