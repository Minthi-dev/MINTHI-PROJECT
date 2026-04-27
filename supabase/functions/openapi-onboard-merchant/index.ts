// =====================================================================
// openapi-onboard-merchant
//
// Authed (OWNER del ristorante o ADMIN). Riceve i dati fiscali +
// credenziali AdE, valida tutto lato server, e crea/aggiorna la
// IT-configuration su OpenAPI per quel ristorante.
//
// CRITICAL:
//   - Le credenziali AdE (taxCode/password/PIN) vengono inoltrate a
//     OpenAPI ma MAI salvate nel nostro DB.
//   - Idempotente: se il ristorante è già configurato, fa PATCH invece
//     di POST (utile per rotazione credenziali ogni 90 giorni).
//   - Salva uno stato 'pending'/'active'/'failed' su restaurants per
//     pilotare la UI del ristoratore.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyAccess } from "../_shared/auth.ts";
import {
    createConfiguration,
    updateConfiguration,
    isOpenApiConfigured,
    isValidVatIT,
    isValidTaxCodeIT,
} from "../_shared/openapi.ts";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const SUPABASE_FN_BASE = Deno.env.get("SUPABASE_URL") ?? "";

function buildWebhookUrl(): string {
    // Supabase functions URL: <project>.supabase.co/functions/v1/<name>
    if (!SUPABASE_FN_BASE) return "";
    return `${SUPABASE_FN_BASE}/functions/v1/openapi-receipt-webhook`;
}

function splitItalianAddress(raw: string): { street_address: string; street_number: string } | null {
    const normalized = raw.trim().replace(/\s+/g, " ");
    const match = normalized.match(/^(.+?)[,\s]+(\d+[A-Z]?(?:\/[A-Z0-9]+)?)$/i);
    if (!match) return null;
    return {
        street_address: match[1].replace(/,$/, "").trim(),
        street_number: match[2].trim(),
    };
}

function isOpenApiAlreadyExistsError(error: unknown): boolean {
    const message = String((error as any)?.message || error || "").toLowerCase();
    return (
        message.includes("already exists") ||
        message.includes('"error":111') ||
        message.includes("error\":111") ||
        message.includes(" 410 ")
    );
}

serve(async (req) => {
    const cors = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const json = (b: unknown, s = 200) =>
        new Response(JSON.stringify(b), {
            status: s,
            headers: { ...cors, "Content-Type": "application/json" },
        });

    try {
        const body = await req.json();
        const {
            userId,
            sessionToken,
            restaurantId,
            // dati fiscali
            vatNumber,        // P.IVA 11 cifre
            taxCode,          // CF (per ditte individuali)
            businessName,
            billingAddress,
            billingCity,
            billingProvince,
            billingPostalCode,
            fiscalEmail,
            // credenziali AdE (NON salvate in DB)
            adeTaxCode,       // CF del responsabile dell'invio
            adePassword,
            adePin,
            // toggles
            enableAutoEmission,
        } = body || {};

        // --- Auth ---
        if (!userId || !restaurantId) return json({ error: "Parametri mancanti" }, 400);
        const access = await verifyAccess(supabase, userId, restaurantId, sessionToken);
        if (!access.valid || (!access.isOwner && !access.isAdmin)) {
            return json({ error: "Non autorizzato" }, 403);
        }

        // --- Validazione dati fiscali ---
        const cleanVat = String(vatNumber || "").replace(/\s/g, "");
        const cleanTaxCode = taxCode ? String(taxCode).trim().toUpperCase() : "";
        const cleanBusinessName = String(businessName || "").trim();
        const cleanAddress = String(billingAddress || "").trim();
        const cleanCity = String(billingCity || "").trim();
        const cleanProvince = String(billingProvince || "").trim().toUpperCase();
        const cleanPostalCode = String(billingPostalCode || "").trim();
        const cleanEmail = String(fiscalEmail || "").trim().toLowerCase();

        if (!isValidVatIT(cleanVat)) {
            return json({ error: "Partita IVA non valida (11 cifre con checksum corretto)" }, 400);
        }
        if (cleanTaxCode && !isValidTaxCodeIT(cleanTaxCode)) {
            return json({ error: "Codice fiscale non valido" }, 400);
        }
        if (!cleanBusinessName || cleanBusinessName.length < 2) {
            return json({ error: "Ragione sociale obbligatoria" }, 400);
        }
        if (!cleanAddress || !cleanCity || !cleanProvince || !cleanPostalCode) {
            return json({ error: "Indirizzo, città, provincia e CAP obbligatori" }, 400);
        }
        const merchantStreet = splitItalianAddress(cleanAddress);
        if (!merchantStreet) {
            return json({ error: "Indirizzo non valido: inserisci anche il numero civico, es. Via Roma 12" }, 400);
        }
        if (!/^[A-Z]{2}$/.test(cleanProvince)) {
            return json({ error: "Provincia: 2 lettere (es. MI, RM, NA)" }, 400);
        }
        if (!/^\d{5}$/.test(cleanPostalCode)) {
            return json({ error: "CAP: 5 cifre" }, 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return json({ error: "Email aziendale non valida" }, 400);
        }

        // --- Credenziali AdE: validate but NEVER persist ---
        const cleanAdeTaxCode = String(adeTaxCode || "").trim().toUpperCase();
        const cleanAdePassword = String(adePassword || "");
        const cleanAdePin = String(adePin || "").trim();

        const adeProvided = cleanAdeTaxCode || cleanAdePassword || cleanAdePin;
        if (adeProvided) {
            if (!isValidTaxCodeIT(cleanAdeTaxCode)) {
                return json({ error: "Codice fiscale del responsabile invio non valido" }, 400);
            }
            if (cleanAdePassword.length < 6) {
                return json({ error: "Password Agenzia Entrate troppo corta" }, 400);
            }
            if (!/^\d{4,16}$/.test(cleanAdePin)) {
                return json({ error: "PIN Agenzia Entrate non valido (solo cifre)" }, 400);
            }
        }

        // --- Carica restaurant ---
        const { data: restaurantRow } = await supabase
            .from("restaurants")
            .select("id")
            .eq("id", restaurantId)
            .maybeSingle();

        if (!restaurantRow) return json({ error: "Ristorante non trovato" }, 404);

        const { data: existing } = await supabase
            .from("restaurant_fiscal_settings")
            .select("restaurant_id, openapi_fiscal_id, openapi_status, openapi_configured_at")
            .eq("restaurant_id", restaurantId)
            .maybeSingle();
        const hasOpenApiConfiguration = Boolean(
            existing?.openapi_fiscal_id &&
            (existing.openapi_status === "active" || existing.openapi_configured_at)
        );

        if (
            hasOpenApiConfiguration &&
            existing.openapi_fiscal_id !== cleanVat &&
            (existing.openapi_status === "active" || existing.openapi_configured_at)
        ) {
            return json({
                error: "Partita IVA già configurata su OpenAPI. Per cambiarla serve una nuova configurazione fiscale: contatta l'assistenza prima di emettere altri scontrini.",
            }, 400);
        }

        const { data: configuredElsewhere } = await supabase
            .from("restaurant_fiscal_settings")
            .select("restaurant_id")
            .eq("openapi_fiscal_id", cleanVat)
            .neq("restaurant_id", restaurantId)
            .in("openapi_status", ["active", "pending"])
            .maybeSingle();
        if (configuredElsewhere) {
            return json({
                error: "Questa Partita IVA risulta già collegata a un altro ristorante Minthi. Per evitare errori fiscali, contatta l'assistenza prima di riutilizzarla.",
            }, 409);
        }

        // --- Salva sempre i dati fiscali, anche prima di chiamare OpenAPI.
        //     Questo permette al ristoratore di iniziare il setup gradualmente.
        const restaurantFiscalUpdate: Record<string, unknown> = {
            vat_number: cleanVat,
            billing_name: cleanBusinessName,
            billing_address: cleanAddress,
            billing_city: cleanCity,
            billing_province: cleanProvince,
            billing_cap: cleanPostalCode,
        };
        const settingsUpdate: Record<string, unknown> = {
            restaurant_id: restaurantId,
            tax_code: cleanTaxCode || null,
            billing_postal_code: cleanPostalCode,
            fiscal_billing_email: cleanEmail,
            // We write openapi_fiscal_id only after OpenAPI confirms the
            // configuration. Saving draft fiscal data must not turn the next
            // activation into a PATCH against a non-existing provider config.
            openapi_fiscal_id: hasOpenApiConfiguration ? cleanVat : null,
        };

        // toggle auto-emission solo se esplicitamente passato
        if (typeof enableAutoEmission === "boolean") {
            settingsUpdate.fiscal_receipts_enabled = enableAutoEmission;
        }

        const { error: saveRestaurantErr } = await supabase
            .from("restaurants")
            .update(restaurantFiscalUpdate)
            .eq("id", restaurantId);
        if (saveRestaurantErr) {
            console.error("[openapi-onboard] errore salvataggio fiscali restaurant:", saveRestaurantErr);
            return json({ error: "Errore salvataggio dati fiscali: " + saveRestaurantErr.message }, 500);
        }

        const { error: saveSettingsErr } = await supabase
            .from("restaurant_fiscal_settings")
            .upsert(settingsUpdate, { onConflict: "restaurant_id" });
        if (saveSettingsErr) {
            console.error("[openapi-onboard] errore salvataggio fiscali settings:", saveSettingsErr);
            return json({ error: "Errore salvataggio impostazioni fiscali: " + saveSettingsErr.message }, 500);
        }

        // --- Se OpenAPI non è configurato a livello piattaforma, salviamo
        //     solo i dati fiscali e segnaliamo "pending".
        if (!isOpenApiConfigured()) {
            await supabase
                .from("restaurant_fiscal_settings")
                .update({
                    openapi_status: "pending",
                    openapi_last_error: null,
                })
                .eq("restaurant_id", restaurantId);
            return json({
                success: true,
                openapiStatus: "pending",
                message: "Dati fiscali salvati. Integrazione OpenAPI non ancora attiva sulla piattaforma — verrà attivata appena il provider sarà configurato.",
            });
        }

        // --- Se non ci sono credenziali AdE in questa chiamata, fermati.
        //     Servono al primo onboarding o al rinnovo (ogni 90gg).
        if (!adeProvided && !hasOpenApiConfiguration) {
            return json({
                success: true,
                openapiStatus: "pending",
                message: "Dati fiscali salvati. Inserisci ora le credenziali Agenzia Entrate per attivare lo scontrino elettronico.",
            });
        }
        if (!adeProvided && hasOpenApiConfiguration) {
            // Solo aggiornamento dati anagrafici, no rotazione credenziali
            return json({
                success: true,
                openapiStatus: existing.openapi_status,
                fiscalId: existing.openapi_fiscal_id,
                message: "Dati fiscali aggiornati.",
            });
        }

        // --- Chiamata OpenAPI ---
        const callbackBase = buildWebhookUrl();
        const merchant_address = {
            ...merchantStreet,
            zip_code: cleanPostalCode,
            city: cleanCity,
            province: cleanProvince,
        };
        try {
            const configurationInput = {
                fiscal_id: cleanVat,
                name: cleanBusinessName,
                email: cleanEmail,
                merchant_address,
                receipts_authentication: {
                    taxCode: cleanAdeTaxCode,
                    password: cleanAdePassword,
                    pin: cleanAdePin,
                },
                callback_receipt_url: callbackBase || undefined,
                callback_receipt_error_url: callbackBase || undefined,
            };

            if (!hasOpenApiConfiguration) {
                // Prima volta → POST /IT-configurations
                try {
                    await createConfiguration(configurationInput);
                } catch (createErr) {
                    if (!isOpenApiAlreadyExistsError(createErr)) throw createErr;

                    // Sandbox/previous attempts can leave the provider config
                    // already created while our DB still says "pending/failed".
                    // In that case, rotate credentials/callbacks with PATCH and
                    // attach the existing provider configuration to this row.
                    console.warn("[openapi-onboard] configurazione già presente su OpenAPI, eseguo PATCH di riaggancio");
                    await updateConfiguration(cleanVat, configurationInput);
                }
            } else {
                // Già configurato → PATCH (rotazione credenziali / aggiornamento)
                await updateConfiguration(existing!.openapi_fiscal_id, configurationInput);
            }

            const now = new Date();
            const expireAt = new Date(now.getTime() + 88 * 24 * 60 * 60 * 1000); // 88gg buffer
            await supabase
                .from("restaurant_fiscal_settings")
                .update({
                    openapi_status: "active",
                    openapi_fiscal_id: cleanVat,
                    openapi_configured_at: now.toISOString(),
                    openapi_last_error: null,
                    ade_credentials_set_at: now.toISOString(),
                    ade_credentials_expire_at: expireAt.toISOString(),
                })
                .eq("restaurant_id", restaurantId);

            return json({
                success: true,
                openapiStatus: "active",
                fiscalId: cleanVat,
                adeCredentialsExpireAt: expireAt.toISOString(),
                message: "Integrazione attivata. Gli scontrini fiscali saranno emessi automaticamente sui pagamenti Stripe.",
            });
        } catch (apiErr: any) {
            console.error("[openapi-onboard] OpenAPI error:", apiErr);
            const errMsg = String(apiErr?.message || apiErr).slice(0, 500);
            await supabase
                .from("restaurant_fiscal_settings")
                .update({
                    openapi_status: "failed",
                    openapi_last_error: errMsg,
                })
                .eq("restaurant_id", restaurantId);
            return json({
                error: "Attivazione fallita: " + errMsg,
                hint: "Verifica P.IVA e credenziali Area Privata AdE. Le credenziali AdE scadono ogni 90 giorni.",
            }, 502);
        }
    } catch (err: any) {
        console.error("[openapi-onboard] generic error:", err);
        return new Response(JSON.stringify({ error: err?.message || "Errore interno" }), {
            status: 500,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
});
