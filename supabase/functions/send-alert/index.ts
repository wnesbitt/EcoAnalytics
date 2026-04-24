// Sends EcoAnalytics alert emails via Resend.
// Called by the app (Settings save) and the Python cron script (threshold/digest alerts).
// Requires Supabase secret RESEND_API_KEY to be set.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON with { to, subject, html }" }, 400);
  }

  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "").trim();

  if (!to || !subject || !html) {
    return json({ error: "to, subject, and html are all required" }, 400);
  }

  // Basic email format check
  if (!to.includes("@") || !to.includes(".")) {
    return json({ error: "Invalid email address" }, 400);
  }

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "EcoAnalytics <alerts@ecoanalytics.com>",
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ error: "Resend error", detail: data }, res.status);
    }

    return json({ success: true, id: data.id });
  } catch (e) {
    return json({ error: "Failed to reach Resend", detail: String(e) }, 502);
  }
});
