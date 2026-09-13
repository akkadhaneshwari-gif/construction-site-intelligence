-- ============================================================================
-- Construction Site Intelligence Platform — Migration v2
-- Multi-project support + Cost Analysis
-- ============================================================================
-- Run this AFTER supabase/migration.sql (v1). Safe to re-run: every
-- statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, and the backfill
-- UPDATEs only touch rows where project_id is still NULL.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend projects with the new fields the "+ New Project" form collects
-- ----------------------------------------------------------------------------
alter table if exists projects
  add column if not exists client_name text,
  add column if not exists start_date date,
  add column if not exists expected_completion_date date,
  add column if not exists progress_percent numeric default 0;

-- Make sure at least one project exists (defensive — v1 already does this).
insert into projects (name, location, status)
select 'Smart Construction Project', 'Main Construction Site — Solapur', 'Active'
where not exists (select 1 from projects);

-- ----------------------------------------------------------------------------
-- 2. Add project_id to every entity that should belong to a project
-- ----------------------------------------------------------------------------
alter table if exists site_data
  add column if not exists project_id bigint references projects(id);

alter table if exists reports
  add column if not exists project_id bigint references projects(id);

alter table if exists incidents
  add column if not exists project_id bigint references projects(id);

alter table if exists materials
  add column if not exists project_id bigint references projects(id);

alter table if exists ai_observations
  add column if not exists project_id bigint references projects(id);

-- ----------------------------------------------------------------------------
-- 3. Backfill existing rows (created before projects existed) onto the
--    oldest/default project so nothing becomes orphaned or invisible.
-- ----------------------------------------------------------------------------
update site_data
   set project_id = (select id from projects order by created_at asc limit 1)
 where project_id is null;

update reports
   set project_id = (select id from projects order by created_at asc limit 1)
 where project_id is null;

update incidents
   set project_id = (select id from projects order by created_at asc limit 1)
 where project_id is null;

update materials
   set project_id = (select id from projects order by created_at asc limit 1)
 where project_id is null;

update ai_observations
   set project_id = (select id from projects order by created_at asc limit 1)
 where project_id is null;

-- ----------------------------------------------------------------------------
-- 4. Cost Analysis
-- ----------------------------------------------------------------------------
create table if not exists costs (
  id bigint generated always as identity primary key,
  project_id bigint references projects(id) on delete cascade,
  category text not null,
  description text,
  estimated_cost numeric default 0,
  actual_cost numeric default 0,
  date date default current_date,
  area text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- OPTIONAL: helpful indexes now that every table is filtered by project_id
-- ----------------------------------------------------------------------------
create index if not exists idx_site_data_project_id on site_data(project_id);
create index if not exists idx_reports_project_id on reports(project_id);
create index if not exists idx_incidents_project_id on incidents(project_id);
create index if not exists idx_materials_project_id on materials(project_id);
create index if not exists idx_ai_observations_project_id on ai_observations(project_id);
create index if not exists idx_costs_project_id on costs(project_id);
