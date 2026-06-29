# Performance SEO Project - SEO Team

A Vercel-ready Next.js App Router dashboard for SEO teams. The current architecture uses Google Sheets as the source of truth for URL ownership, Neon/Postgres as the cache and reporting database, Google OAuth for authorization, and the Google Search Console API for URL performance data.

## Current data architecture

The active Neon/Postgres schema is documented in `migrations/001_simple_cache_schema.sql`. New environments should run that migration as the current schema baseline.

Current tables and views:

- `content_urls` — canonical URL inventory synced from the Google Sheet, including project, URL, member ownership, member email, GSC property, active status, and source timestamps.
- `seo_performance_cache` — URL-level GSC cache for each date range, including current/previous metrics, deltas, growth status, opportunity status, and recommendations.
- `member_performance_cache` — member-level rollups derived from the URL cache, including URL counts, totals, growth distribution, and support signals.
- `refresh_runs` — audit table for cache refresh attempts, totals, failures, date ranges, and status.
- `sync_runs` — audit table for Google Sheet sync attempts, row counts, deactivations, failures, and status.
- `dashboard_url_performance` — dashboard-facing view over `seo_performance_cache` for URL reporting.
- `dashboard_member_performance` — dashboard-facing view over `member_performance_cache` for member reporting.

Older migrations, including `migrations/001_canonical_schema.sql` and `migrations/20260627_neon_content_url_id.sql`, remain in the repository only for legacy/backward-compatibility support of databases that were created before the simple cache architecture. They are not the canonical schema for new deployments.

## Required Google Sheet format

Use exactly one tab named `content_urls` with exactly these required columns:

```text
project | url | member_name
```

The app reads the sheet as the source URL/member inventory. Admin sync actions import those rows into the `content_urls` table and record the outcome in `sync_runs`.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and sign in with Google.

## Environment variables

```text
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_SHEET_ID=1NacfG23BnkKY0ZMktfhDxpZ7cnNGdQRf_UrwQ5kfOIQ
GOOGLE_SHEET_TAB=content_urls
ADMIN_EMAILS=admin@company.com,leader@company.com
MEMBER_EMAIL_MAP={"Hưng":"hung@company.com","Linh":"linh@company.com"}
PROJECT_GSC_MAP={"Tartan Vibes Clothing":"sc-domain:tartanvibesclothing.com"}
ALL_TIME_START_DATE=2024-01-01
CACHE_TTL_SECONDS=21600
DATABASE_URL=postgres://USER:PASSWORD@HOST/DB?sslmode=require
```

Invalid JSON in `MEMBER_EMAIL_MAP` or `PROJECT_GSC_MAP` is surfaced as a clear setup warning instead of crashing the UI.

## How member authorization works

The logged-in Google email is matched against `MEMBER_EMAIL_MAP` values. The matching key is treated as the member's `member_name`, and normal members only see sheet/database rows with that same `member_name`. Admin emails in `ADMIN_EMAILS` can see every row.

## How project-to-GSC mapping works

Because the sheet only has `project`, `url`, and `member_name`, `PROJECT_GSC_MAP` maps each project to a Search Console property. During sync, mapped values are stored on `content_urls.gsc_property`. If a project is missing from the map, the row remains visible with a warning and GSC refreshes skip that URL.

## Google Cloud setup

1. Create or choose a Google Cloud project.
2. Configure an OAuth consent screen.
3. Create OAuth Client ID credentials for a web app.
4. Enable these APIs:
   - Google Sheets API
   - Google Search Console API
5. Add OAuth redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://YOUR_DOMAIN/api/auth/callback/google`

The OAuth scopes are `openid`, `email`, `profile`, `https://www.googleapis.com/auth/spreadsheets.readonly`, and `https://www.googleapis.com/auth/webmasters.readonly`.

## Deploy the current database schema to Neon

Use `migrations/001_simple_cache_schema.sql` as the current schema baseline for Neon/Postgres.

> **Important:** This migration intentionally drops and recreates the current cache tables and dashboard views. Use it for new environments, reset workflows, or deployments where replacing cached SEO data is acceptable. Back up data first if you need to preserve an existing cache.

### Neon SQL Editor

1. Open the Neon Console and select the target branch/database.
2. Open **SQL Editor**.
3. Paste the complete contents of `migrations/001_simple_cache_schema.sql`.
4. Run it once as a single script.
5. Visit `/api/health/db` in the deployed app. It should return `ok: true` with empty `missingTables`, `missingViews`, and `missingColumns` arrays.
6. Visit `/api/health/cache` to inspect cache row counts and recent `refresh_runs` / `sync_runs` records.

### psql

```bash
psql "$DATABASE_URL" -f migrations/001_simple_cache_schema.sql
curl -f https://YOUR_APP_HOST/api/health/db
curl -f https://YOUR_APP_HOST/api/health/cache
```

## Refreshing cached GSC performance

Admins should use the dashboard **Refresh GSC Performance** action, which posts to `POST /api/refresh/cache`. The refresh reads active rows from `content_urls`, queries Search Console for the selected date range and comparison period, replaces the relevant rows in `seo_performance_cache`, rebuilds `member_performance_cache`, and records the attempt in `refresh_runs`.

The old queued refresh endpoints are not part of the current architecture. `POST /api/refresh/start` and `POST /api/refresh/process` are retained only as removed-endpoint responses and should not be used by operators or integrations.

## Vercel deployment

1. Import the repository into Vercel.
2. Add every variable from `.env.example` to the Vercel project settings, including `DATABASE_URL`.
3. Set `NEXTAUTH_URL` to your production URL.
4. Add the production OAuth redirect URI in Google Cloud.
5. Deploy.
6. Run `migrations/001_simple_cache_schema.sql` against the production Neon database if the current schema is not already installed.
7. Confirm `/api/health/db` and `/api/health/cache` are healthy.

## GSC permission troubleshooting

- The signed-in Google account must have access to the Search Console property from `PROJECT_GSC_MAP`.
- Use the exact property string, for example `sc-domain:example.com` or a URL-prefix property.
- Missing permissions or unmapped projects are shown as warnings in the dashboard.

## Vercel env troubleshooting

Required Vercel environment variables for Google OAuth, sheet sync, database cache, and authorization:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEET_ID` (`1NacfG23BnkKY0ZMktfhDxpZ7cnNGdQRf_UrwQ5kfOIQ`)
- `GOOGLE_SHEET_TAB` (`content_urls`)
- `ADMIN_EMAILS`
- `MEMBER_EMAIL_MAP`
- `PROJECT_GSC_MAP`
- `DATABASE_URL`

Redeploy after changing env vars. JSON env vars must be one-line valid JSON objects. `NEXTAUTH_SECRET` must be set in production.

## Legacy migrations

The repository keeps earlier Neon migrations for compatibility with older production databases:

- `migrations/001_canonical_schema.sql` — legacy queued-refresh/snapshot schema that created `refresh_jobs`, `refresh_job_items`, URL/member snapshot tables, compatibility daily/query snapshot tables, and latest-performance views.
- `migrations/20260627_neon_content_url_id.sql` — legacy alignment patch for older queued-refresh databases that needed `content_url_id` and refresh job/item compatibility columns.

Do not use those files as the canonical schema for new deployments. Use `migrations/001_simple_cache_schema.sql` unless you are explicitly repairing an older database that still depends on the legacy queued-refresh/snapshot model.
