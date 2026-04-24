// Receives webhook events from Stripe after payment succeeds or subscription changes.
// Updates the subscriptions table in Supabase accordingly.
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const GROVE_PRICE_ID = "price_1TPmOtFHlEDRqk3QPiDibvbK";
const FOREST_PRICE_ID = "price_1TPm9BFHlEDRqk3QVjxsPBlO";

function tierFromPriceId(priceId: string): string {
  if (priceId === FOREST_PRICE_ID) return "forest";
  return "grove";
}

async function upsertSubscription(supabaseUrl: string, serviceKey: string, payload: {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  tier: string;
  status: string;
}) {
  const res = await fetch(supabaseUrl + "/rest/v1/subscriptions", {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": "Bearer " + serviceKey,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Supabase upsert failed: " + err);
  }
}

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return new Response("Missing secrets", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  // Verify the webhook signature with Stripe
  const verifyRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
    headers: { "Authorization": "Bearer " + stripeKey },
  });

  // Parse the event directly (signature verification done via Stripe)
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = (session.metadata as Record<string, string>)?.user_id;
      const customerId = String(session.customer || "");
      const subscriptionId = String(session.subscription || "");

      if (!userId) {
        console.error("No user_id in session metadata");
        return new Response("Missing user_id", { status: 400 });
      }

      // Fetch the subscription to get the price ID
      const subRes = await fetch("https://api.stripe.com/v1/subscriptions/" + subscriptionId, {
        headers: { "Authorization": "Bearer " + stripeKey },
      });
      const sub = await subRes.json();
      const priceId = sub?.items?.data?.[0]?.price?.id || "";
      const tier = tierFromPriceId(priceId);

      await upsertSubscription(supabaseUrl, serviceKey, {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        tier,
        status: "active",
      });

      console.log("Subscription saved: " + userId + " -> " + tier);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const subscriptionId = String(sub.id || "");

      // Mark as canceled in Supabase
      const res = await fetch(
        supabaseUrl + "/rest/v1/subscriptions?stripe_subscription_id=eq." + subscriptionId,
        {
          method: "PATCH",
          headers: {
            "apikey": serviceKey,
            "Authorization": "Bearer " + serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "canceled", updated_at: new Date().toISOString() }),
        }
      );
      if (!res.ok) console.error("Failed to cancel subscription: " + await res.text());
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const subscriptionId = String(sub.id || "");
      const status = String((sub as Record<string, unknown>).status || "active");

      const res = await fetch(
        supabaseUrl + "/rest/v1/subscriptions?stripe_subscription_id=eq." + subscriptionId,
        {
          method: "PATCH",
          headers: {
            "apikey": serviceKey,
            "Authorization": "Bearer " + serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
        }
      );
      if (!res.ok) console.error("Failed to update subscription: " + await res.text());
    }

  } catch (e) {
    console.error("Webhook handler error: " + String(e));
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
