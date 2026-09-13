-- ============================================================================
-- Construction Site Intelligence Platform — Schema Migration
-- ============================================================================
-- Safe to run multiple times: every statement uses IF NOT EXISTS / ADD COLUMN
-- IF NOT EXISTS, so re-running this file will not error or duplicate data.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend the existing site_data table (kept as-is, only additive columns)
-- ----------------------------------------------------------------------------
alter table if exists site_data
  add column if not exists severity text default 'Medium',
  add column if not exists status text default 'Open',
  add column if not exists source text default 'Manual Entry';

-- ----------------------------------------------------------------------------
-- 2. Project / Site / Area hierarchy
--    (Groundwork for full multi-site management. The current UI reads/edits
--    the "projects" table directly; "sites" and "areas" are provided so the
--    hierarchy can be extended without another migration.)
-- ----------------------------------------------------------------------------
create table if not exists projects (
  id bigint generated always as identity primary key,
  name text not null,
  location text,
  status text default 'Active',
  created_at timestamptz default now()
);

create table if not exists sites (
  id bigint generated always as identity primary key,
  project_id bigint references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists areas (
  id bigint generated always as identity primary key,
  site_id bigint references sites(id) on delete cascade,
  name text not null,
  status text default 'Active',
  created_at timestamptz default now()
);

-- Seed the existing "Smart Construction Project" as the default project,
-- only if no project row exists yet (keeps this idempotent).
insert into projects (name, location, status)
select 'Smart Construction Project', 'Main Construction Site — Solapur', 'Active'
where not exists (select 1 from projects);

-- ----------------------------------------------------------------------------
-- 3. Safety Incidents
-- ----------------------------------------------------------------------------
create table if not exists incidents (
  id bigint generated always as identity primary key,
  area text not null,
  incident_type text not null,
  description text,
  severity text default 'Medium',
  status text default 'Open',
  incident_date date default current_date,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 4. Materials
-- ----------------------------------------------------------------------------
create table if not exists materials (
  id bigint generated always as identity primary key,
  area text not null,
  material_name text not null,
  quantity numeric default 0,
  unit text default 'units',
  status text default 'Available', -- Available | Low Stock | Required | Delivered
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 5. AI photo-analysis log
--    Every photo analysis run (real GPT-5 Vision call OR the rule-based demo
--    fallback) is logged here with which mode produced it. This is what
--    powers the dashboard's "AI Observations" count honestly — it reflects
--    actual analysis runs, not just the total number of site records.
-- ----------------------------------------------------------------------------
create table if not exists ai_observations (
  id bigint generated always as identity primary key,
  area text,
  issue_type text,
  severity text,
  ai_mode text default 'rule-based-demo', -- 'real-vision' | 'rule-based-demo'
  raw_result text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 6. Daily progress reports (kept — already used by the existing feature)
-- ----------------------------------------------------------------------------
create table if not exists reports (
  id bigint generated always as identity primary key,
  report_type text default 'Daily Progress Report',
  title text,
  description text,
  report_date date default current_date,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- OPTIONAL: Row Level Security
-- The current demo relies on the anon/public key for all reads and writes,
-- so RLS is left OFF by default to avoid breaking the working demo the day
-- before a Buildathon. If you want to lock this down after judging, enable
-- RLS and add policies like the commented example below for each table.
-- ----------------------------------------------------------------------------
-- alter table incidents enable row level security;
-- create policy "public read incidents" on incidents for select using (true);
-- create policy "public insert incidents" on incidents for insert with check (true);
