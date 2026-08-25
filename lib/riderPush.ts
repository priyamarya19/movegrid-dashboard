import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

/**
 * Push notifications to riders, via Expo's push service.
 *
 * Every send is fire-and-forget from the caller's point of view: a notification
 * failing must never roll back the thing it was announcing. Recording a payment
 * that then fails to notify is a minor annoyance; failing the payment because
 * the notification broke is a real problem.
 *
 * Copy is Hindi-first, matching the app — riders are Hindi-first users.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type RiderPushEvent =
  | "rent_due_tomorrow"
  | "rent_overdue"
  | "claim_approved"
  | "claim_rejected"
  | "kyc_verified"
  | "vehicle_ready"
  | "ticket_answered";

type Message = { title: string; body: string };

/** The six approved events, plus ticket replies. Hindi with the English loanwords riders actually use. */
function messageFor(event: RiderPushEvent, vars: Record<string, string | number> = {}): Message {
  const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN")}`;
  switch (event) {
    case "rent_due_tomorrow":
      return {
        title: "Rent कल due है",
        body: `${inr(vars.amount ?? 0)} कल तक जमा कर दें`,
      };
    case "rent_overdue":
      return {
        title: "Rent बाकी है",
        body: `${inr(vars.amount ?? 0)} pending है — जल्दी जमा करें`,
      };
    case "claim_approved":
      return {
        title: "Payment मिल गया ✅",
        body: `${inr(vars.amount ?? 0)} आपके account में जुड़ गया`,
      };
    case "claim_rejected":
      return {
        title: "Payment verify नहीं हुआ",
        body: String(vars.reason ?? "Team ने आपका payment proof reject किया — app में देखें"),
      };
    case "kyc_verified":
      return { title: "KYC verify हो गया ✅", body: "अब आप scooter ले सकते हैं" };
    case "vehicle_ready":
      return { title: "आपकी scooter तैयार है 🛵", body: "Hub आकर collect कर लें" };
    case "ticket_answered":
      return { title: "Team ने जवाब दिया", body: "App में अपनी request देखें" };
  }
}

type ExpoTicket = { status: string; message?: string; details?: { error?: string } };

/**
 * Send one event to one rider, on every device they've registered.
 * Never throws — returns how many devices were reached.
 */
export async function pushToRider(
  riderId: string,
  event: RiderPushEvent,
  vars: Record<string, string | number> = {}
): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT token FROM ${schemas.ops}.rider_push_tokens WHERE rider_id = $1`,
      [riderId]
    );
    const tokens: string[] = res.rows.map((r: { token: string }) => r.token);
    if (tokens.length === 0) return 0;

    const { title, body } = messageFor(event, vars);
    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data: { event, ...vars },
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    const json = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null;

    // Expo reports dead tokens per-message. Drop them so we stop trying — an
    // uninstalled app otherwise accumulates failures forever.
    const dead: string[] = [];
    json?.data?.forEach((ticket, i) => {
      if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        dead.push(tokens[i]);
      }
    });
    if (dead.length > 0) {
      await pool.query(`DELETE FROM ${schemas.ops}.rider_push_tokens WHERE token = ANY($1)`, [dead]);
    }

    return tokens.length - dead.length;
  } catch (e) {
    console.error("pushToRider failed", { riderId, event, error: String(e) });
    return 0;
  }
}

/** Fire-and-forget wrapper for request handlers that must not wait on a push. */
export function pushToRiderAsync(
  riderId: string,
  event: RiderPushEvent,
  vars: Record<string, string | number> = {}
): void {
  void pushToRider(riderId, event, vars);
}
