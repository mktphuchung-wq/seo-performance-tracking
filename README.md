# Performance SEO Project - SEO Team

A simple Vercel-ready Next.js App Router dashboard for SEO teams. Google Sheets is the only database, Google OAuth authorizes members, and the Google Search Console API provides URL performance data.

## Required Google Sheet format

Use exactly one tab named `content_urls` with exactly these required columns:

```text
project | url | member_name
```

The app reads the sheet only; Slack or another workflow can populate it.

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
GOOGLE_SHEET_ID=...
GOOGLE_SHEET_TAB=content_urls
ADMIN_EMAILS=admin@company.com,leader@company.com
MEMBER_EMAIL_MAP={"Hưng":"hung@company.com","Linh":"linh@company.com"}
PROJECT_GSC_MAP={"Tartan Vibes Clothing":"sc-domain:tartanvibesclothing.com"}
ALL_TIME_START_DATE=2024-01-01
CACHE_TTL_SECONDS=21600
```

Invalid JSON in `MEMBER_EMAIL_MAP` or `PROJECT_GSC_MAP` is surfaced as a clear setup warning instead of crashing the UI.

## How member authorization works

The logged-in Google email is matched against `MEMBER_EMAIL_MAP` values. The matching key is treated as the member's `member_name`, and normal members only see sheet rows with that same `member_name`. Admin emails in `ADMIN_EMAILS` can see every sheet row.

## How project-to-GSC mapping works

Because the sheet only has `project`, `url`, and `member_name`, `PROJECT_GSC_MAP` maps each project to a Search Console property. If a project is missing from the map, the row remains visible with a warning and GSC queries are skipped for that URL.

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

## Vercel deployment

1. Import the repository into Vercel.
2. Add every variable from `.env.example` to the Vercel project settings.
3. Set `NEXTAUTH_URL` to your production URL.
4. Add the production OAuth redirect URI in Google Cloud.
5. Deploy.

## GSC permission troubleshooting

- The signed-in Google account must have access to the Search Console property from `PROJECT_GSC_MAP`.
- Use the exact property string, for example `sc-domain:example.com` or a URL-prefix property.
- Missing permissions or unmapped projects are shown as warnings in the dashboard.

## Vercel env troubleshooting

- Redeploy after changing env vars.
- JSON env vars must be one-line valid JSON objects.
- `NEXTAUTH_SECRET` must be set in production.
