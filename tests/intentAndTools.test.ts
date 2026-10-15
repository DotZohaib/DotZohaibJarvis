/**
 * Automated Verification Suite — J.A.R.V.I.S. Intent Detection & Tool Execution
 *
 * Tests all required scenarios:
 * 1. "Song chalao" → asks for the missing song name.
 * 2. "Atif Aslam ka song chalao" → music intent.
 * 3. "YouTube par Tajdar-e-Haram play karo" → YouTube music workflow.
 * 4. "Google par Python tutorials search karo" → Google search workflow.
 * 5. "Aaj Karachi ka weather batao" → weather workflow.
 * 6. "London ka weather batao" → weather workflow for London.
 * 7. "Stop music" → playback-stop workflow.
 * 8. "Chrome mein naya tab kholo" → browser-tab workflow.
 * 9. "Google kholo" → opens Google (open_website target: google, NOT search).
 * 10. "YouTube kholo" → opens YouTube (open_website target: youtube).
 * 11. "Wikipedia kholo" → opens Wikipedia (open_website target: wikipedia).
 * 12. "GitHub kholo" → opens GitHub (open_website target: github).
 * 13. "Jarvis, Mola Ghazi Maan song halayo" → Sindhi verb 'halayo' recognized, extracts 'Mola Ghazi Maan'.
 * 14. "Jarvis, YouTube par Mola Ghazi Maan chalao" → music intent on YouTube for Mola Ghazi Maan.
 * 15. "Jarvis, Google par artificial intelligence search karo" → Google search for 'artificial intelligence'.
 * 16. "Jarvis, YouTube par Mola Ghazi Maan search karo" → explicit YouTube search.
 * 17. "Agla tab kholo" → switch tab workflow.
 * 18. "Current page ka summary batao" → read page workflow.
 * 19. An ambiguous command → clarification/conversational instead of an unrelated action.
 * 20. An unavailable tool → honest failure response.
 * 21. A missing song title → no false playback-success message.
 * 22. Two consecutive different commands → no stale intent or cross-contamination.
 * 23. Duplicate tool events → no unintended duplicate action.
 * 24. Weather never triggers music, music never triggers weather.
 * 25. Real YouTube Track Resolver integration (extracts real video ID for 'Mola Ghazi Maan').
 * 26. Real Live Weather API Integration (Open-Meteo).
 */

import { classifyIntent } from "../src/services/intentClassifier";
import { executeTool, fetchLiveWeather } from "../src/services/toolRegistry";
import { resolveYouTubeTrack } from "../src/services/youtubeResolver";

interface TestReport {
  id: number;
  description: string;
  type: "UNIT" | "INTEGRATION";
  passed: boolean;
  details: string;
}

const report: TestReport[] = [];

function assert(id: number, description: string, type: "UNIT" | "INTEGRATION", condition: boolean, details: string) {
  report.push({
    id,
    description,
    type,
    passed: condition,
    details,
  });
  const symbol = condition ? "✅ PASS" : "❌ FAIL";
  console.log(`[${symbol}] [${type}] Test ${id}: ${description} — ${details}`);
}

async function runAllTests() {
  console.log("\n================================================================================");
  console.log("   J.A.R.V.I.S. MASTER SUITE: REAL CHROME CONTROL & ACTION EXECUTION VERIFICATION");
  console.log("================================================================================\n");

  // 1. "Song chalao" → asks for the missing song name
  {
    const res = classifyIntent("Jarvis, song chalao");
    const passed =
      res.intent === "play_music" &&
      res.requiresClarification === true &&
      Boolean(res.clarificationPrompt?.includes("kaunsa song"));
    assert(1, '"Song chalao" asks for missing song name', "UNIT", passed, `Prompt: "${res.clarificationPrompt}"`);
  }

  // 2. "Atif Aslam ka song chalao" → music intent
  {
    const res = classifyIntent("Atif Aslam ka song chalao");
    const passed =
      res.intent === "play_music" &&
      res.toolName === "play_youtube_video" &&
      res.args?.songOrVideo?.toLowerCase().includes("atif aslam");
    assert(2, '"Atif Aslam ka song chalao" selects music intent', "UNIT", passed, `Extracted: "${res.args?.songOrVideo}"`);
  }

  // 3. "YouTube par Tajdar-e-Haram play karo" → YouTube music workflow
  {
    const res = classifyIntent("YouTube par Tajdar-e-Haram play karo");
    const passed =
      res.intent === "play_music" &&
      res.toolName === "play_youtube_video" &&
      res.args?.songOrVideo?.toLowerCase().includes("tajdar");
    assert(3, '"YouTube par Tajdar-e-Haram play karo" YouTube music workflow', "UNIT", passed, `Extracted: "${res.args?.songOrVideo}"`);
  }

  // 4. "Google par Python tutorials search karo" → Google search workflow
  {
    const res = classifyIntent("Google par Python tutorials search karo");
    const passed =
      res.intent === "search_google" &&
      res.toolName === "search_google" &&
      res.args?.query?.toLowerCase().includes("python");
    assert(4, '"Google par Python tutorials search karo" Google search workflow', "UNIT", passed, `Query: "${res.args?.query}"`);
  }

  // 5. "Aaj Karachi ka weather batao" → weather workflow
  {
    const res = classifyIntent("Aaj Karachi ka weather batao");
    const passed =
      res.intent === "get_weather" &&
      res.toolName === "get_weather" &&
      res.args?.city?.toLowerCase() === "karachi";
    assert(5, '"Aaj Karachi ka weather batao" weather workflow', "UNIT", passed, `City: "${res.args?.city}"`);
  }

  // 6. "London ka weather batao" → weather workflow for London
  {
    const res = classifyIntent("London ka weather batao");
    const passed =
      res.intent === "get_weather" &&
      res.toolName === "get_weather" &&
      res.args?.city?.toLowerCase() === "london";
    assert(6, '"London ka weather batao" weather workflow for London', "UNIT", passed, `City: "${res.args?.city}"`);
  }

  // 7. "Stop music" → playback-stop workflow
  {
    const res = classifyIntent("Stop music");
    const passed =
      res.intent === "control_media" &&
      res.toolName === "control_media" &&
      res.args?.action === "stop";
    assert(7, '"Stop music" playback-stop workflow', "UNIT", passed, `Action: "${res.args?.action}"`);
  }

  // 8. "Chrome mein naya tab kholo" → browser-tab workflow
  {
    const res = classifyIntent("Chrome mein naya tab kholo");
    const passed =
      res.intent === "open_browser_tab" &&
      res.toolName === "open_browser_tab";
    assert(8, '"Chrome mein naya tab kholo" browser-tab workflow', "UNIT", passed, `Tool: "${res.toolName}"`);
  }

  // 9. "Google kholo" → opens Google (NOT search for 'kholo')
  {
    const res = classifyIntent("Google kholo");
    const passed =
      res.intent === "open_website" &&
      res.toolName === "open_website" &&
      res.args?.target === "google";
    assert(9, '"Google kholo" opens Google website directly', "UNIT", passed, `Target: "${res.args?.target}" (Tool: ${res.toolName})`);
  }

  // 10. "YouTube kholo" → opens YouTube
  {
    const res = classifyIntent("YouTube kholo");
    const passed =
      res.intent === "open_website" &&
      res.toolName === "open_website" &&
      res.args?.target === "youtube";
    assert(10, '"YouTube kholo" opens YouTube website directly', "UNIT", passed, `Target: "${res.args?.target}"`);
  }

  // 11. "Wikipedia kholo" → opens Wikipedia
  {
    const res = classifyIntent("Wikipedia kholo");
    const passed =
      res.intent === "open_website" &&
      res.toolName === "open_website" &&
      res.args?.target === "wikipedia";
    assert(11, '"Wikipedia kholo" opens Wikipedia website directly', "UNIT", passed, `Target: "${res.args?.target}"`);
  }

  // 12. "GitHub kholo" → opens GitHub
  {
    const res = classifyIntent("GitHub kholo");
    const passed =
      res.intent === "open_website" &&
      res.toolName === "open_website" &&
      res.args?.target === "github";
    assert(12, '"GitHub kholo" opens GitHub website directly', "UNIT", passed, `Target: "${res.args?.target}"`);
  }

  // 13. "Jarvis, Mola Ghazi Maan song halayo." → Sindhi verb 'halayo', extracts song title cleanly
  {
    const res = classifyIntent("Jarvis, Mola Ghazi Maan song halayo");
    const passed =
      res.intent === "play_music" &&
      res.toolName === "play_youtube_video" &&
      res.args?.songOrVideo?.toLowerCase() === "mola ghazi maan";
    assert(13, '"Jarvis, Mola Ghazi Maan song halayo" parses Sindhi verb & title', "UNIT", passed, `Song: "${res.args?.songOrVideo}"`);
  }

  // 14. "Jarvis, YouTube par Mola Ghazi Maan chalao." → music intent on YouTube for Mola Ghazi Maan
  {
    const res = classifyIntent("Jarvis, YouTube par Mola Ghazi Maan chalao");
    const passed =
      res.intent === "play_music" &&
      res.toolName === "play_youtube_video" &&
      res.args?.songOrVideo?.toLowerCase() === "mola ghazi maan";
    assert(14, '"YouTube par Mola Ghazi Maan chalao" selects music playback', "UNIT", passed, `Song: "${res.args?.songOrVideo}"`);
  }

  // 15. "Jarvis, Google par artificial intelligence search karo" → Google search
  {
    const res = classifyIntent("Jarvis, Google par artificial intelligence search karo");
    const passed =
      res.intent === "search_google" &&
      res.toolName === "search_google" &&
      res.args?.query?.toLowerCase() === "artificial intelligence";
    assert(15, '"Google par artificial intelligence search karo" Google search', "UNIT", passed, `Query: "${res.args?.query}"`);
  }

  // 16. "Jarvis, YouTube par Mola Ghazi Maan search karo" → YouTube search
  {
    const res = classifyIntent("Jarvis, YouTube par Mola Ghazi Maan search karo");
    const passed =
      res.intent === "search_youtube" &&
      res.toolName === "search_youtube" &&
      res.args?.query?.toLowerCase() === "mola ghazi maan";
    assert(16, '"YouTube par Mola Ghazi Maan search karo" YouTube search', "UNIT", passed, `Query: "${res.args?.query}"`);
  }

  // 17. "Agla tab kholo" → switch tab workflow
  {
    const res = classifyIntent("Agla tab kholo");
    const passed =
      res.intent === "switch_tab" &&
      res.toolName === "switch_tab" &&
      res.args?.direction === "next";
    assert(17, '"Agla tab kholo" tab switching workflow', "UNIT", passed, `Direction: "${res.args?.direction}"`);
  }

  // 18. "Current page ka summary batao" → read page workflow
  {
    const res = classifyIntent("Current page ka summary batao");
    const passed =
      res.intent === "read_page" &&
      res.toolName === "read_current_page";
    assert(18, '"Current page ka summary batao" page reading workflow', "UNIT", passed, `Tool: "${res.toolName}"`);
  }

  // 19. Ambiguous command → conversational turn without false tool triggers
  {
    const res = classifyIntent("Koi ajeeb si cheez");
    const passed =
      res.intent === "conversational" &&
      res.toolName === undefined;
    assert(19, "Ambiguous command defaults to conversational turn", "UNIT", passed, `Intent assigned: "${res.intent}"`);
  }

  // 20. Unavailable tool → honest failure response
  {
    const result = await executeTool("hack_pentagon", { target: "nasa" });
    const passed =
      result.success === false &&
      Boolean(result.error?.includes("not registered"));
    assert(20, "Unavailable tool returns honest failure", "UNIT", passed, `Reported error: "${result.error}"`);
  }

  // 21. Missing song title → fails cleanly without false success
  {
    const result = await executeTool("play_youtube_video", { songOrVideo: "" });
    const passed =
      result.success === false &&
      Boolean(result.error?.includes("not specified"));
    assert(21, "Missing song title fails cleanly without false success", "UNIT", passed, `Reported error: "${result.error}"`);
  }

  // 22. Two consecutive different commands → independent intents without crosstalk
  {
    const cmd1 = classifyIntent("Atif Aslam ka song chalao");
    const cmd2 = classifyIntent("Aaj Karachi ka weather batao");
    const passed =
      cmd1.intent === "play_music" &&
      cmd2.intent === "get_weather" &&
      cmd2.args?.city?.toLowerCase() === "karachi" &&
      !cmd2.args?.songOrVideo;
    assert(22, "Consecutive commands maintain independent intents without crosstalk", "UNIT", passed, `Cmd1: ${cmd1.intent}, Cmd2: ${cmd2.intent}`);
  }

  // 23. Duplicate tool events → caught by deduplication filter
  {
    const first = classifyIntent("Open GitHub");
    const second = classifyIntent("Open GitHub");
    const passed = first.isDuplicate === false && second.isDuplicate === true;
    assert(23, "Duplicate tool events caught by deduplication filter", "UNIT", passed, `First: ${first.isDuplicate}, Second: ${second.isDuplicate}`);
  }

  // 24. Weather never triggers music, music never triggers weather
  {
    const wRes = classifyIntent("Karachi weather report batao");
    const mRes = classifyIntent("Play relaxing music");
    const passed =
      wRes.intent === "get_weather" &&
      wRes.toolName === "get_weather" &&
      mRes.intent === "play_music" &&
      mRes.toolName === "play_youtube_video";
    assert(24, "Weather request never triggers music; music never triggers weather", "UNIT", passed, `Weather -> ${wRes.toolName}, Music -> ${mRes.toolName}`);
  }

  // 25. Real YouTube Track Resolver integration (extracts real video ID for 'Mola Ghazi Maan')
  {
    try {
      const track = await resolveYouTubeTrack("Mola Ghazi Maan");
      const passed =
        track.resolved === true &&
        Boolean(track.videoId && track.videoId.length === 11) &&
        track.videoUrl.startsWith("https://www.youtube.com/watch?v=");
      assert(
        25,
        "Real YouTube Track Resolver Integration (Video ID & Direct URL)",
        "INTEGRATION",
        passed,
        `Resolved video ID: "${track.videoId}", Title: "${track.videoTitle.slice(0, 45)}...", URL: ${track.videoUrl}`
      );
    } catch (err: any) {
      assert(25, "Real YouTube Track Resolver Integration", "INTEGRATION", false, `Failed: ${err.message}`);
    }
  }

  // 26. Real Live Weather API Integration (Open-Meteo)
  {
    try {
      const weather = await fetchLiveWeather("Karachi");
      const passed =
        weather.city === "Karachi" &&
        typeof weather.temperature === "number" &&
        Boolean(weather.condition);
      assert(
        26,
        "Real Live Weather API Integration (Open-Meteo)",
        "INTEGRATION",
        passed,
        `Result: ${weather.city}, Temp: ${weather.temperature}°C, Condition: "${weather.condition}"`
      );
    } catch (err: any) {
      assert(26, "Real Live Weather API Integration", "INTEGRATION", false, `Failed: ${err.message}`);
    }
  }

  console.log("\n================================================================================");
  const total = report.length;
  const passedCount = report.filter((r) => r.passed).length;
  console.log(`   TOTAL TESTS: ${total} | PASSED: ${passedCount} | FAILED: ${total - passedCount}`);
  console.log("================================================================================\n");

  if (passedCount === total) {
    console.log(`🎉 ALL ${total} AUTOMATED TESTS PASSED WITH 100% SUCCESS RATE!\n`);
    process.exit(0);
  } else {
    console.error("❌ Some tests failed. Review output above.\n");
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
