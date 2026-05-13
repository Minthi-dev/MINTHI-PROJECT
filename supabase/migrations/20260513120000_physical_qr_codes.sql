-- =====================================================================
-- physical_qr_codes
--
-- Reusable physical QR codes that the platform admin prints and ships
-- to restaurants. The QR encodes a stable code (slug) — NOT the
-- restaurant id directly — so the same physical QR can be re-assigned to
-- a different restaurant without reprinting.
--
-- Public scan flow:
--   QR encodes https://minthi.it/qr/{code}
--   /qr/{code} hits the public edge function resolve-qr-code
--   resolve-qr-code returns the currently assigned restaurant_id
--   browser is redirected to /client/takeaway/{restaurant_id}
-- =====================================================================

CREATE TABLE IF NOT EXISTS "public"."physical_qr_codes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL PRIMARY KEY,
    "code" "text" NOT NULL UNIQUE,
    "restaurant_id" "uuid" REFERENCES "public"."restaurants"("id") ON DELETE SET NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "assigned_at" timestamp with time zone,
    "created_by" "uuid"
);

ALTER TABLE "public"."physical_qr_codes" OWNER TO "postgres";

-- Codes are short, case-insensitive (we store lower-case), URL-safe.
ALTER TABLE "public"."physical_qr_codes"
    ADD CONSTRAINT "physical_qr_codes_code_format"
    CHECK ("code" ~ '^[a-z0-9]{6,32}$');

CREATE INDEX IF NOT EXISTS "idx_physical_qr_codes_restaurant"
    ON "public"."physical_qr_codes" ("restaurant_id")
    WHERE "restaurant_id" IS NOT NULL;

-- RLS: nessun accesso diretto. Tutto passa via edge function (admin) o via
-- la edge function pubblica resolve-qr-code (service role bypassa RLS).
ALTER TABLE "public"."physical_qr_codes" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."physical_qr_codes" IS
    'Stamped physical QR codes managed by the platform admin. The code is what is encoded in the QR; restaurant_id is the current assignment (can be re-pointed without reprinting).';

COMMENT ON COLUMN "public"."physical_qr_codes"."code" IS
    'URL slug embedded in the QR (e.g. minthi.it/qr/abc123). Lower-case alphanumeric, 6-32 chars.';

COMMENT ON COLUMN "public"."physical_qr_codes"."restaurant_id" IS
    'Current restaurant assignment. NULL = unassigned (scan shows a friendly message). When changed, the same physical QR starts pointing to the new restaurant immediately.';
