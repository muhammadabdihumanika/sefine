// WhatsApp Cloud API helpers (Deno, Edge Function).

const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppMessage(to: string, body: string): Promise<boolean> {
  const token = Deno.env.get("WA_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    console.error("sendWhatsAppMessage: missing WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID");
    return false;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      },
    );
    if (!res.ok) {
      console.error("WA send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("WA send error", e);
    return false;
  }
}

/** Verify the X-Hub-Signature-256 HMAC of the raw body with WA_APP_SECRET. */
export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("WA_APP_SECRET");
  if (!secret || !signatureHeader) return false;
  const expected = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expected;
}

export type Inbound = {
  from: string; // E.164 without +
  messageId: string;
  text: string | null;
};

// deno-lint-ignore no-explicit-any
export function parseInbound(payload: any): Inbound | null {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null;
  const from = msg.from;
  const messageId = msg.id;
  let text: string | null = null;
  if (msg.type === "text") text = msg.text?.body ?? null;
  else if (msg.type === "button") text = msg.button?.text ?? null;
  else if (msg.type === "interactive") {
    text = msg.interactive?.button_reply?.id ??
      msg.interactive?.list_reply?.title ??
      null;
  }
  return { from, messageId, text };
}
