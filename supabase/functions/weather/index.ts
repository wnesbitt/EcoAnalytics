// Proxies OpenWeatherMap so the API key stays server-side.
// Called by the browser via supabase.functions.invoke('weather', { body: { lat, lon } }).
// Requires Supabase secret WEATHER_KEY to be set.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { lat?: unknown; lon?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON with { lat, lon }" }, 400);
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "lat and lon must be finite numbers" }, 400);
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json({ error: "lat/lon out of range" }, 400);
  }

  const key = Deno.env.get("WEATHER_KEY");
  if (!key) {
    return json({ error: "WEATHER_KEY not configured" }, 500);
  }

  const url =
    "https://api.openweathermap.org/data/2.5/weather" +
    `?lat=${lat}&lon=${lon}&appid=${key}&units=imperial`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    return json(data, upstream.ok ? 200 : upstream.status);
  } catch (e) {
    return json({ error: "Upstream fetch failed", detail: String(e) }, 502);
  }
});
