-- 024: notes, per-artwork VAT, discounts and sub line items
--
-- Additive only. Nothing is dropped and nothing the live app reads changes
-- meaning, so this is safe to run before the code that uses it deploys.
--
-- framing_status and framing_cost are deliberately left in place. The cost is
-- copied into a sub line item below and the app stops reading the column, but
-- the column stays so this migration can be rolled back by reverting the code
-- alone. A later migration retires it, deployed the other way round.

-- ── artworks ──────────────────────────────────────────────────────────────────

alter table artworks
  add column if not exists note                 text    not null default '',
  add column if not exists note_shown_to_client boolean not null default true,
  add column if not exists vat_applies          boolean not null default true,
  add column if not exists discount_status      text    not null default 'none',
  add column if not exists discount_percent     numeric null,
  -- [{ id, label, kind, mode, amount, percent, vatApplies }]
  -- kind:  'framing' | 'duty' | 'shipping' | 'other'
  -- mode:  'fixed'   -> amount is pounds
  --        'percent' -> percent is of the artwork's discounted price
  add column if not exists sub_line_items       jsonb   not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'artworks_discount_status_check'
  ) then
    alter table artworks
      add constraint artworks_discount_status_check
        check (discount_status in ('none', 'confirmed', 'tbc'));
  end if;
end $$;

-- A discount only means something with a percentage behind it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'artworks_discount_percent_check'
  ) then
    alter table artworks
      add constraint artworks_discount_percent_check
        check (
          discount_percent is null
          or (discount_percent >= 0 and discount_percent <= 100)
        );
  end if;
end $$;

-- ── elevation_options ─────────────────────────────────────────────────────────
-- client_notes already exists and runs the other way: it is what the client
-- writes back to the consultant. This is the consultant writing to the client,
-- and it is where pair and set pricing is explained.

alter table elevation_options
  add column if not exists consultant_note                 text    not null default '',
  add column if not exists consultant_note_shown_to_client boolean not null default true;

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Every artwork that needs framing and has a price against it gets that cost
-- as a sub line item, so nothing disappears from a budget when the new code
-- goes live. Artworks that already have sub items are left alone, which makes
-- this safe to run twice.

update artworks
set sub_line_items = jsonb_build_array(
      jsonb_build_object(
        'id',         gen_random_uuid()::text,
        'label',      'Framing',
        'kind',       'framing',
        'mode',       'fixed',
        'amount',     framing_cost,
        'percent',    0,
        'vatApplies', true
      )
    )
where framing_status = 'requires_framing'
  and framing_cost is not null
  and sub_line_items = '[]'::jsonb;
