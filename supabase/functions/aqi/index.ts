// Proxies EPA AirNow so the API key stays server-side.
// Called by the browser via supabase.functions.invoke('aqi', { body: { lat, lon } }).
// Requires Supabase secret AIRNOW_KEY to be set.
// AirNow returns an array of observations; we pass it through unchanged.

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

  const key = Deno.env.get("AIRNOW_KEY");
  if (!key) {
    return json({ error: "AIRNOW_KEY not configured" }, 500);
  }

  const url =
    "https://www.airnowapi.org/aq/observation/latLong/current/" +
    `?format=application/json&latitude=${lat}&longitude=${lon}&distance=25&API_KEY=${key}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    return json(data, upstream.ok ? 200 : upstream.status);
  } catch (e) {
    return json({ error: "Upstream fetch failed", detail: String(e) }, 502);
  }
});
