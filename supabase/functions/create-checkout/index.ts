// Creates a Stripe Checkout Session and returns the hosted payment URL.
// Called by the frontend when a user clicks Subscribe.
// Requires Supabase secret STRIPE_SECRET_KEY to be set.

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

  let body: { priceId?: unknown; userId?: unknown; userEmail?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON with { priceId, userId, userEmail }" }, 400);
  }

  const priceId = String(body.priceId || "").trim();
  const userId = String(body.userId || "").trim();
  const userEmail = String(body.userEmail || "").trim();

  if (!priceId || !userId) {
    return json({ error: "priceId and userId are required" }, 400);
  }

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
  }

  const appUrl = "https://eco-analytics.vercel.app";

  try {
    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "mode": "subscription",
      "success_url": appUrl + "?payment=success",
      "cancel_url": appUrl + "?payment=canceled",
      "metadata[user_id]": userId,
    });

    if (userEmail) {
      params.append("customer_email", userEmail);
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      return json({ error: "Stripe error", detail: data }, res.status);
    }

    return json({ url: data.url });
  } catch (e) {
    return json({ error: "Failed to reach Stripe", detail: String(e) }, 502);
  }
});
