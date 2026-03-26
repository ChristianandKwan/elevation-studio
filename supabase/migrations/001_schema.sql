-- ══════════════════════════════════════════════════════════
--  ELEVATION STUDIO — Database Schema + RLS
--  All tables created first, then all policies added after.
-- ══════════════════════════════════════════════════════════

-- Extensions
create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════
--  SECTION 1: CREATE ALL TABLES
-- ════════════════════════════════════════════════════════

-- ── PROFILES ─────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  initials    text not null,
  role        text not null default 'consultant',
  created_at  timestamptz not null default now()
);

-- ── PROJECTS ─────────────────────────────────────────────
create table if not exists projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client_name     text not null default '',
  consultant_id   uuid not null references profiles(id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft','sent','approved')),
  created_at      timestamptz not null default now()
);

-- ── CLIENT TOKENS ────────────────────────────────────────
-- Created early so later policies can reference it
create table if not exists client_tokens (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '90 days')
);

-- ── ELEVATIONS ───────────────────────────────────────────
create table if not exists elevations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null default 'Main Elevation',
  display_order   int not null default 0,
  created_at      timestamptz not null default now()
);

-- ── ELEVATION OPTIONS ────────────────────────────────────
create table if not exists elevation_options (
  id              uuid primary key default gen_random_uuid(),
  elevation_id    uuid not null references elevations(id) on delete cascade,
  option          char(1) not null check (option in ('A','B')),
  image_path      text,
  orig_w          int not null default 0,
  orig_h          int not null default 0,
  scale_px_per_cm float8,
  zoom            float4 not null default 1,
  approved        boolean not null default false,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (elevation_id, option)
);

-- ── ARTWORKS ─────────────────────────────────────────────
create table if not exists artworks (
  id              uuid primary key default gen_random_uuid(),
  option_id       uuid not null references elevation_options(id) on delete cascade,
  name            text not null default 'Untitled',
  image_path      text not null,
  w_cm            float4 not null default 40,
  h_cm            float4 not null default 60,
  x_fraction      float4 not null default 0.08,
  y_fraction      float4 not null default 0.08,
  visible         boolean not null default true,
  price           int not null default 0,
  price_includes  text not null default 'artwork' check (price_includes in ('artwork','all')),
  display_order   int not null default 0,
  created_at      timestamptz not null default now()
);

-- ── ACTIVITY LOGS ────────────────────────────────────────
create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  type        text not null,
  text        text not null,
  created_at  timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════
--  SECTION 2: ENABLE RLS ON ALL TABLES
-- ════════════════════════════════════════════════════════

alter table profiles         enable row level security;
alter table projects         enable row level security;
alter table client_tokens    enable row level security;
alter table elevations       enable row level security;
alter table elevation_options enable row level security;
alter table artworks         enable row level security;
alter table activity_logs    enable row level security;


-- ════════════════════════════════════════════════════════
--  SECTION 3: AUTO-CREATE PROFILE ON SIGNUP
-- ════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, initials, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 2)),
    'consultant'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ════════════════════════════════════════════════════════
--  SECTION 4: ALL RLS POLICIES
-- ════════════════════════════════════════════════════════

-- ── PROFILES ─────────────────────────────────────────────
create policy "Consultants can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Consultants can update own profile"
  on profiles for update using (auth.uid() = id);

-- ── PROJECTS ─────────────────────────────────────────────
create policy "Consultants manage own projects"
  on projects for all using (auth.uid() = consultant_id);

-- ── CLIENT TOKENS ────────────────────────────────────────
create policy "Consultants manage tokens via project"
  on client_tokens for all using (
    exists (select 1 from projects where projects.id = client_tokens.project_id and projects.consultant_id = auth.uid())
  );

-- Anyone can read a token (needed to verify portal access)
create policy "Anyone can read tokens"
  on client_tokens for select using (true);

-- ── ELEVATIONS ───────────────────────────────────────────
create policy "Consultants manage elevations via project"
  on elevations for all using (
    exists (select 1 from projects where projects.id = elevations.project_id and projects.consultant_id = auth.uid())
  );

-- ── ELEVATION OPTIONS ────────────────────────────────────
create policy "Consultants manage options via project"
  on elevation_options for all using (
    exists (
      select 1 from elevations
      join projects on projects.id = elevations.project_id
      where elevations.id = elevation_options.elevation_id
        and projects.consultant_id = auth.uid()
    )
  );

create policy "Client token read options"
  on elevation_options for select using (
    exists (
      select 1 from client_tokens ct
      join elevations e on e.project_id = ct.project_id
      where e.id = elevation_options.elevation_id
        and ct.expires_at > now()
    )
  );

-- ── ARTWORKS ─────────────────────────────────────────────
create policy "Consultants manage artworks via project"
  on artworks for all using (
    exists (
      select 1 from elevation_options eo
      join elevations e on e.id = eo.elevation_id
      join projects p on p.id = e.project_id
      where eo.id = artworks.option_id
        and p.consultant_id = auth.uid()
    )
  );

create policy "Client token read artworks"
  on artworks for select using (
    exists (
      select 1 from elevation_options eo
      join elevations e on e.id = eo.elevation_id
      join client_tokens ct on ct.project_id = e.project_id
      where eo.id = artworks.option_id
        and ct.expires_at > now()
    )
  );

create policy "Client token update artwork position"
  on artworks for update using (
    exists (
      select 1 from elevation_options eo
      join elevations e on e.id = eo.elevation_id
      join client_tokens ct on ct.project_id = e.project_id
      where eo.id = artworks.option_id
        and ct.expires_at > now()
        and eo.approved = false
    )
  );

-- ── ACTIVITY LOGS ────────────────────────────────────────
create policy "Consultants manage activity via project"
  on activity_logs for all using (
    exists (select 1 from projects where projects.id = activity_logs.project_id and projects.consultant_id = auth.uid())
  );

create policy "Client token read activity"
  on activity_logs for select using (
    exists (
      select 1 from client_tokens ct
      where ct.project_id = activity_logs.project_id
        and ct.expires_at > now()
    )
  );

create policy "Client token insert activity"
  on activity_logs for insert with check (
    exists (
      select 1 from client_tokens ct
      where ct.project_id = activity_logs.project_id
        and ct.expires_at > now()
    )
  );
