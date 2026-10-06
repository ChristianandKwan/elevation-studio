-- ══════════════════════════════════════════════════════════
--  042 — Other currencies on the budget
--
--  Some works are quoted in another currency (Nepean's come from a US
--  gallery), and some clients pay in one. Two separate things, both added
--  here, for nine currencies: pounds, euros, US dollars, yen, yuan, Hong Kong
--  dollars, Swiss francs, Canadian dollars and Australian dollars.
--
--  ── A price in the currency it was quoted in ──────────────
--
--  A work's price is kept as the gallery gave it, with its currency. The
--  budget converts it at the day's rate wherever it is shown in the other
--  currency, so nobody converts by hand and nothing goes stale. Framing,
--  installation, the fee and every other cost stay in pounds.
--
--  ── Showing the client their currency ─────────────────────
--
--  `client_currency` puts a switch on one project's budget between pounds and
--  that currency (£ / $ for Nepean), for the consultant and the client. Null,
--  pounds only, for every project until a consultant sets one.
--
--  ── The rate ──────────────────────────────────────────────
--
--  The server fetches the European Central Bank's daily reference rates when
--  a budget opens, and keeps the last good ones here, so a budget still opens
--  (saying which day its rate is from) if the source cannot be reached. Only
--  the server writes it.
--
--  Deploy order: ADDITIVE — run this first, then deploy. Every existing
--  work becomes priced in pounds, which is what its price already is, and
--  the live app reads none of the new columns.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. A work's price currency ────────────────────────────

alter table works
  add column if not exists price_currency text not null default 'GBP';

alter table works drop constraint if exists works_price_currency_check;
alter table works add constraint works_price_currency_check
  check (price_currency in ('GBP', 'EUR', 'USD', 'JPY', 'CNY', 'HKD', 'CHF', 'CAD', 'AUD'));

-- ── 2. The client's currency on a project's budget ────────

alter table project_budgets
  add column if not exists client_currency text null;

alter table project_budgets drop constraint if exists project_budgets_client_currency_check;
alter table project_budgets add constraint project_budgets_client_currency_check
  check (client_currency is null or client_currency in ('EUR', 'USD', 'JPY', 'CNY', 'HKD', 'CHF', 'CAD', 'AUD'));

-- ── 3. The last good exchange rates ───────────────────────

create table if not exists exchange_rates (
  base        text not null,
  quote       text not null,
  -- Units of `quote` per one `base`: for GBP→USD, dollars per pound.
  -- The server keeps one row per currency, all against GBP.
  rate        numeric not null,
  -- The day the source published it for.
  rate_date   date not null,
  fetched_at  timestamptz not null default now(),
  primary key (base, quote)
);

comment on table exchange_rates is
  'The last exchange rates the server fetched, kept for when the source cannot be reached. See 042.';

alter table exchange_rates enable row level security;

-- Signed-in consultants may read it. Writes are the server's (service role).
drop policy if exists "Signed-in users read exchange rates" on exchange_rates;
create policy "Signed-in users read exchange rates"
  on exchange_rates for select to authenticated using (true);
