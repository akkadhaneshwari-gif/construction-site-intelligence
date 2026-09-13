# Construction Site Intelligence Platform

A construction-site monitoring platform for Project Managers, Site Supervisors,
Safety Officers, Contractors, and Construction Administrators — built for a
Buildathon. It collects site observations, safety incidents, and material data,
and turns it into dashboard intelligence: recurring issue detection, risk
scoring per area, and a data-driven AI assistant.

## Problem Statement

Construction sites generate scattered information — safety concerns, quality
issues, material shortages, daily progress — usually recorded informally or
not at all. This platform gives a single place to log that information and
automatically surface: what's happening, where problems are recurring, which
areas need attention, and what the AI-analyzed photos are showing.

## Features

- **Multi-project platform** — a Projects landing page with project cards
  (progress, budget, active issues); click a card to open that project's own
  dashboard. Every project's data is fully independent (`project_id` on
  every table)
- **Project management** — create/edit projects (name, location, client,
  start date, expected completion, status), switch projects from a dropdown
  inside any project's dashboard
- **Site Data** — area, date, issue type, observation, photo, severity,
  status, and source, with search + filters, scoped to the selected project
- **Photo AI analysis** — uploads a construction photo to GPT-5 Vision for a
  real analysis (PPE/helmet visibility, unsafe conditions, materials,
  equipment, visible quality problems); falls back to a clearly-labeled
  rule-based demo result if no API key is configured or the call fails
- **Cost Analysis module** — budget summary (estimated/actual/remaining/%
  used), a per-category Estimated vs Actual breakdown, budget status alert
  (Healthy / Attention / Exceeded), and an AI Cost Insight (real LLM call
  over the real cost data, with a labeled rule-based fallback)
- **AI Project Insights & Progress Insights** — same real-AI-with-honest-
  fallback pattern, summarizing safety/materials/recurring issues and
  progress reports respectively
- **Safety Incidents** — dedicated incident log with severity/status
- **Materials** — inventory tracking with Available / Low Stock / Required /
  Delivered status
- **Recurring Issue Detection** — flags issue types repeated 2+ times in the
  same area, computed from real stored records
- **Areas Needing Attention** — transparent, weighted risk score per area
  (safety issues, high-severity records, incidents, recurrence)
- **Daily Progress Reports** — free-text daily updates; each report
  increments that project's persisted `progress_percent` (still explicitly
  labeled as a manually tracked estimate, not a measured value)
- **Construction AI Assistant** — answers questions using only the selected
  project's stored data (safety, incidents, materials, recurring issues,
  attention areas, progress, cost/budget, date-ranged incident queries) —
  labeled as data-based intelligence, not a general chatbot
- **CSV report exports** — site data, incidents, recurring issues, area
  attention, and cost summaries, per project

## Technology Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Storage) via `@supabase/ssr`
- OpenAI `gpt-5-mini` (Responses API, vision) for photo analysis

## Architecture

```
Browser (page.tsx, client component)
   │
   ├── view === "projects"  → Projects landing page (project cards, + New Project)
   ├── view === "dashboard" → Selected project's dashboard (everything below is
   │                           filtered by project_id = selectedProjectId)
   │
   ├── Supabase client (lib/supabase.ts) ──► Postgres tables + Storage bucket
   │     reads/writes: projects, site_data, reports, incidents, materials,
   │     costs, ai_observations — every table except `projects` itself is
   │     filtered by project_id
   │
   ├── POST /api/analyze-photo ──► OpenAI GPT-5 Vision
   │     Server-side only; OPENAI_API_KEY never reaches the browser.
   │     Returns a text analysis of the uploaded photo.
   │
   ├── POST /api/observations ──► Supabase (ai_observations table)
   │     Logs every photo-analysis run (real or demo) for the
   │     dashboard's "AI Observations" counter.
   │
   └── POST /api/ai-insights ──► OpenAI GPT-5 (text, no image)
         Generates cost / project / progress narrative insights from a
         JSON summary of the real, already-fetched project data. Falls
         back to a deterministic rule-based summary on failure.
```

Dashboard intelligence (recurring issues, risk scores, safety/material
stats, cost breakdown) is computed **client-side from the data already
fetched from Supabase, scoped to the selected project** — nothing on the
dashboard is hardcoded except explicitly labeled defaults.

## Database Structure

Run both migration files, in order:

1. `supabase/migration.sql` — original tables (`site_data` columns,
   `incidents`, `materials`, `ai_observations`, `projects`, `sites`, `areas`)
2. `supabase/migration_v2_projects_and_costs.sql` — adds `project_id` to
   every entity, extends `projects` with `client_name`/`start_date`/
   `expected_completion_date`/`progress_percent`, backfills existing rows
   onto the oldest project so nothing is orphaned, and creates `costs`

| Table              | Purpose                                             |
|--------------------|------------------------------------------------------|
| `projects`          | Name, location, client, dates, status, `progress_percent` (per-project) |
| `site_data`         | area, date, issue type, observation, photo, severity/status/source, `project_id` |
| `reports`           | Daily progress reports, `project_id` |
| `incidents`         | Safety incident log, `project_id` |
| `materials`         | Material inventory, `project_id` |
| `costs`             | Cost entries by category (estimated/actual), `project_id` |
| `ai_observations`   | Log of every photo-AI run, tagged `real-vision`/`rule-based-demo`, `project_id` |
| `sites`, `areas`    | Hierarchy groundwork for future multi-site-per-project expansion (not yet exposed in the UI) |

Until both migrations are run, the app still works for whatever tables
already exist — new sections (Incidents, Materials, Cost Analysis) show an
empty state with a note to run the migration, instead of crashing.

## AI/ML Approach — Honest Disclosure

**Photo analysis**: When `OPENAI_API_KEY` is configured, `/api/analyze-photo`
sends the uploaded image to OpenAI's `gpt-5-mini` model via the Responses API
for a real vision-based analysis (PPE/helmet visibility, unsafe conditions,
materials, visible quality issues). This is a genuine model call, not a
simulation.

If that call is unavailable (no key, network failure, rate limit), the app
falls back to a rule-based demo result. **The UI always labels which one
produced the result** — a green "Real AI Vision Result (GPT-5)" badge or a
grey "Demo / Rule-Based Result" badge — so nothing is misrepresented as AI
output when it isn't.

**Recurring issue detection and risk scoring** are deterministic, transparent
calculations over stored records (grouping + weighted counts) — not a
trained ML model. This is stated explicitly in the UI copy ("Score = safety
issues + incidents + recurrence, weighted").

## GenAI Approach

Two different things are both called "AI" in this app, and the UI is
deliberate about which is which:

1. **Construction AI Assistant** (chat box) — retrieves relevant records
   from state already loaded from Supabase and matches the question against
   those records to compose an answer. This is a retrieval + template-answer
   pattern, not an LLM call. Labeled "Data-Based Assistant."
2. **AI Insights** (Cost Analysis, Project Insights, Progress Insights
   sections) — sends a JSON summary of the real stored data to
   `/api/ai-insights`, which calls OpenAI `gpt-5-mini` for a genuine
   narrative analysis. If that call fails or no key is configured, the UI
   falls back to a deterministic bullet summary and labels it "Rule-Based
   Insight" instead of pretending it's AI-generated.

The photo analysis (when in real-vision mode) is also genuine LLM output.
Every AI-labeled result in the UI carries a badge stating whether it came
from a real model call or a rule-based fallback.

## Data Flow

1. User adds a project → (currently a single default project, editable)
2. User logs a site observation, safety incident, or material record
3. Optionally uploads a photo → analyzed by GPT-5 Vision (or the demo
   fallback) → logged to `ai_observations` → pre-fills the observation form
4. Record saved to Supabase (`site_data`, `incidents`, or `materials`)
5. Dashboard recomputes stats, recurring issues, and area risk scores from
   the fetched data on every load
6. User can search/filter site data, ask the AI Assistant questions, or
   export CSV reports

## Setup Instructions

### Environment Variables (names only — never commit actual values)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
```

`NEXT_PUBLIC_*` variables are safe for the browser (Supabase anon/publishable
key). `OPENAI_API_KEY` must only ever be set as a server-side env var — it is
read only inside `app/api/analyze-photo/route.ts`, which runs on the server.

### Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Database Setup

Run `supabase/migration.sql` in the Supabase SQL Editor (safe to re-run).

### Build / Deploy

```bash
npm run build
npm run start
```

Deploy on Vercel (or any Next.js host) with the three environment variables
above set in the project's environment settings — never in the repo.

## Demo Flow

1. Open the app — see the **Projects** page. Click **+ New Project** to
   create one (or open the existing default project)
2. On a project's dashboard, click **+ Site Data**, upload a construction
   photo, click **Analyze Photo** — see the labeled AI result (real or demo)
3. Save the record — dashboard stats update
4. Click **+ Incident**, **+ Material**, or **+ Cost Entry** to log data
5. Check **Cost Analysis** — budget summary, category breakdown, budget
   status badge, then click **Generate** under AI Cost Insight
6. Check **Recurring Issues** and **Areas Needing Attention** — computed live
7. Ask the **Construction AI Assistant**: "Which area needs the most
   attention?", "What is the current project cost?", or "Summarize the
   current project status."
8. Click **Back to Projects**, create a second project (e.g. "Bridge
   Construction"), add a site record or cost entry there, and confirm it
   never shows up under the first project
9. Add a **Daily Progress Report** — watch the Overall Progress KPI update
10. Download a CSV report from the **Reports** section

## Limitations / Future Improvements

- Full multi-**site**-per-project (buildings/floors within one project) is
  not built — the `sites` and `areas` tables exist as groundwork, but the
  UI currently manages one flat area list per project via free-text `area`
  fields. Multi-*project* support (the main ask here) is fully implemented.
- Area names are free-text on `site_data`/`incidents`/`materials` rather than
  foreign keys into the `areas` table, to stay backward-compatible with
  existing data.
- RLS is left open (matching the pre-existing demo setup) — lock this down
  with real policies before any production use.
- The AI Assistant is retrieval + template based, not an LLM call — it will
  not handle phrasing outside its recognized question patterns as gracefully
  as a true LLM would. The separate AI Insights panels (Cost/Project/
  Progress) *do* call a real LLM when configured.
- Photo analysis and AI Insights both require `OPENAI_API_KEY` to run in
  real mode; without it, every result honestly reports itself as a
  rule-based/demo result.
- Progress is a manually incremented, persisted estimate (+10% per report
  saved, capped at 100%) — not computed from actual task completion data.
- This project was built and validated without a live `npm install` /
  `npm run build` pass in the assistant's own sandbox (no network access
  there) — run `npm run build` in your own environment before the demo and
  address anything the assistant couldn't catch by static review.
