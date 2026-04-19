-- ── ARTIST-NAME TOKENS ───────────────────────────────────────
-- Change client_tokens.token from uuid → text so we can store
-- friendly hyphenated artist-name slugs (e.g. "monet-warhol-basquiat").
-- Existing UUID tokens are preserved via text cast, so live links keep working.

alter table client_tokens
  alter column token type text using token::text,
  alter column token drop default;
