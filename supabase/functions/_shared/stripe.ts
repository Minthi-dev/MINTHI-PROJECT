// Stripe: client unico. Gli incassi dei clienti avvengono come "direct charge"
// sull'account Connect (Express) del ristorante.
import Stripe from "npm:stripe@17.7.0";
import { requireEnv } from "./http.ts";

let client: Stripe | null = null;

export function stripe(): Stripe {
  client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
  return client;
}

export function stripeMode(): "live" | "test" {
  return (Deno.env.get("STRIPE_SECRET_KEY") ?? "").includes("_live_") ? "live" : "test";
}

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number | null | undefined) => Math.round(Number(cents ?? 0)) / 100;

export { Stripe };
