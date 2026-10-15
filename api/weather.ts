import type { IncomingMessage, ServerResponse } from "http";

const WMO_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

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
  const city = url.searchParams.get("city") || "Karachi";

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city.trim()
    )}&count=1&language=en&format=json`;

    const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
    if (!geoRes.ok) throw new Error(`Geocoding failed for "${city}"`);

    const geoData = (await geoRes.json()) as any;
    if (!geoData.results || geoData.results.length === 0) {
      throw new Error(`Location "${city}" not found.`);
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;

    const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(6000) });
    if (!weatherRes.ok) throw new Error(`Weather fetch failed for "${city}"`);

    const weatherData = (await weatherRes.json()) as any;
    const current = weatherData.current;
    const temp = Math.round(current.temperature_2m);
    const condition = WMO_CODE_MAP[current.weather_code] || "Clear";
    const humidity = current.relative_humidity_2m;
    const windSpeed = Math.round(current.wind_speed_10m);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        success: true,
        city: name,
        country,
        temperature: temp,
        condition,
        humidity,
        windSpeed,
        formattedText: `${name}, ${country} mein is waqt mausam ${condition} hai, temperature ${temp}°C hai, humidity ${humidity}% hai aur hawa ki raftaar ${windSpeed} km/h hai.`,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: err?.message || "Weather fetch failed" }));
  }
}
