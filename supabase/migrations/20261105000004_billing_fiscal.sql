-- =====================================================================
-- MINTHI v2 · 004 · Abbonamenti, Stripe Connect, fiscale, piattaforma
-- =====================================================================

-- Dati di fatturazione e abbonamento MINTHI del ristorante
create table public.billing_accounts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  billing_name text,
  vat_number text,
  tax_code text,
  address text,
  city text,
  postal_code text,
  province text,
  sdi_code text,
  pec text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text check (subscription_status is null or subscription_status in
    ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'free')),
  current_period_end timestamptz,
  cancel_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger billing_accounts_touch before update on public.billing_accounts
  for each row execute function public.touch_updated_at();

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  stripe_invoice_id text unique,
  stripe_payment_intent_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'eur',
  status text not null check (status in ('paid', 'failed', 'refunded', 'pending')),
  period_start timestamptz,
  period_end timestamptz,
  invoice_issued boolean not null default false,   -- fattura emessa dall'admin
  created_at timestamptz not null default now()
);
create index subscription_payments_restaurant_idx on public.subscription_payments(restaurant_id, created_at desc);

-- Account Stripe Connect del ristorante (incassi dai clienti)
create table public.stripe_accounts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  online_payments_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger stripe_accounts_touch before update on public.stripe_accounts
  for each row execute function public.touch_updated_at();

-- Inviti alla registrazione (link /register/:token)
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  note text,
  free_months integer not null default 0 check (free_months between 0 and 36),
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  discount_duration text not null default 'once' check (discount_duration in ('once', 'repeating', 'forever')),
  discount_months integer check (discount_months is null or discount_months between 1 and 36),
  stripe_coupon_id text,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_by_restaurant_id uuid references public.restaurants(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.restaurant_bonuses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  free_months integer not null check (free_months between 1 and 36),
  reason text,
  is_active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Configurazione pubblica della piattaforma (landing ecc.)
create table public.platform_config (
  key text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fiscale (scontrini elettronici)
-- ---------------------------------------------------------------------
create table public.fiscal_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  provider text not null default 'openapi' check (provider in ('openapi', 'none')),
  enabled boolean not null default false,
  auto_issue_online_payments boolean not null default true,
  email_to_customer boolean not null default false,
  tax_code text,                          -- P.IVA / CF esercente
  fiscal_id text,                         -- id configurazione presso il provider
  default_vat_rate_code text not null default '10',
  status text not null default 'not_configured' check (status in ('not_configured', 'pending', 'active', 'error')),
  last_error text,
  ade_credentials_set_at timestamptz,
  ade_credentials_expire_at timestamptz,
  onboarding_log jsonb not null default '[]'::jsonb,
  configured_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger fiscal_settings_touch before update on public.fiscal_settings
  for each row execute function public.touch_updated_at();

create table public.fiscal_receipts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null default 'sale' check (kind in ('sale', 'void', 'refund')),
  linked_receipt_id uuid references public.fiscal_receipts(id) on delete set null,
  session_id uuid references public.table_sessions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'openapi',
  provider_receipt_id text,
  provider_env text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'ready', 'failed', 'voided')),
  items jsonb not null,
  cash_amount numeric(10, 2) not null default 0,
  electronic_amount numeric(10, 2) not null default 0,
  voucher_amount numeric(10, 2) not null default 0,
  voucher_quantity integer not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  customer_email text,
  customer_tax_code text,
  customer_lottery_code text,
  document_number text,
  provider_response jsonb,
  error text,
  email_sent_at timestamptz,
  issued_via text not null check (issued_via in ('manual', 'auto_stripe', 'auto_takeaway')),
  issued_by uuid references public.profiles(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fiscal_receipts_restaurant_idx on public.fiscal_receipts(restaurant_id, created_at desc);
create index fiscal_receipts_session_idx on public.fiscal_receipts(session_id);
create trigger fiscal_receipts_touch before update on public.fiscal_receipts
  for each row execute function public.touch_updated_at();

-- Outbox: ogni emissione passa da qui (retry con backoff, dedupe)
create table public.fiscal_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dedupe_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  receipt_id uuid references public.fiscal_receipts(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fiscal_jobs_queue_idx on public.fiscal_jobs(status, run_after) where status in ('queued', 'running');
create trigger fiscal_jobs_touch before update on public.fiscal_jobs
  for each row execute function public.touch_updated_at();

-- Prende in carico i job pronti (sicuro con più worker in parallelo)
create or replace function public.claim_fiscal_jobs(p_limit integer default 10)
returns setof public.fiscal_jobs language plpgsql security definer set search_path = public as $$
begin
  -- job rimasti "running" per un crash vengono rimessi in coda
  update public.fiscal_jobs set status = 'queued', locked_at = null
  where status = 'running' and locked_at < now() - interval '5 minutes';

  return query
  update public.fiscal_jobs j
  set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.fiscal_jobs
    where status = 'queued' and run_after <= now()
    order by run_after
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning j.*;
end $$;
revoke all on function public.claim_fiscal_jobs(integer) from public, anon, authenticated;
