-- Durable fiscal receipt outbox.
-- Stripe/payment handlers enqueue here and return quickly; a worker claims and
-- submits jobs to OpenAPI with retries.

CREATE TABLE IF NOT EXISTS public.fiscal_receipt_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    dedupe_key text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    priority integer NOT NULL DEFAULT 100,
    payload jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 8,
    run_after timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    locked_by text,
    receipt_id uuid REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fiscal_receipt_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead')),
    CONSTRAINT fiscal_receipt_jobs_attempts_check CHECK (attempts >= 0),
    CONSTRAINT fiscal_receipt_jobs_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 20),
    CONSTRAINT fiscal_receipt_jobs_dedupe_key_len CHECK (char_length(dedupe_key) BETWEEN 8 AND 240)
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_receipt_jobs_dedupe_key_idx
    ON public.fiscal_receipt_jobs (dedupe_key);

CREATE INDEX IF NOT EXISTS fiscal_receipt_jobs_ready_idx
    ON public.fiscal_receipt_jobs (status, run_after, priority, created_at)
    WHERE status IN ('queued', 'failed', 'processing');

CREATE INDEX IF NOT EXISTS fiscal_receipt_jobs_restaurant_idx
    ON public.fiscal_receipt_jobs (restaurant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fiscal_receipt_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_receipt_jobs_updated_at ON public.fiscal_receipt_jobs;
CREATE TRIGGER fiscal_receipt_jobs_updated_at
    BEFORE UPDATE ON public.fiscal_receipt_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fiscal_receipt_jobs_set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_fiscal_receipt_jobs(
    p_limit integer DEFAULT 10,
    p_worker_id text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    restaurant_id uuid,
    dedupe_key text,
    payload jsonb,
    attempts integer,
    max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    v_worker text := COALESCE(NULLIF(p_worker_id, ''), 'fiscal-worker');
BEGIN
    RETURN QUERY
    WITH candidates AS (
        SELECT j.id
        FROM public.fiscal_receipt_jobs j
        WHERE (
            (j.status IN ('queued', 'failed') AND j.run_after <= now())
            OR (j.status = 'processing' AND j.locked_at < now() - interval '5 minutes')
          )
          AND j.attempts < j.max_attempts
        ORDER BY j.priority ASC, j.created_at ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.fiscal_receipt_jobs j
        SET status = 'processing',
            locked_at = now(),
            locked_by = v_worker,
            attempts = j.attempts + 1,
            last_error = NULL
        FROM candidates c
        WHERE j.id = c.id
        RETURNING j.id, j.restaurant_id, j.dedupe_key, j.payload, j.attempts, j.max_attempts
    )
    SELECT claimed.id, claimed.restaurant_id, claimed.dedupe_key, claimed.payload, claimed.attempts, claimed.max_attempts
    FROM claimed;
END;
$$;

ALTER TABLE public.fiscal_receipt_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_receipt_jobs FROM anon, authenticated;
GRANT ALL ON public.fiscal_receipt_jobs TO service_role;

REVOKE ALL ON FUNCTION public.claim_fiscal_receipt_jobs(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_receipt_jobs(integer, text) TO service_role;
