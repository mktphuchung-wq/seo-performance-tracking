# Performance SEO Project - SEO Team

A simple Vercel-ready Next.js App Router dashboard for SEO performance. Google Sheets is the only database: the spreadsheet must have a `content_urls` tab with exactly these columns:

```text
project | url | member_name
```

## Environment variables

- `NEXTAUTH_URL` and `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEET_ID`
- `MEMBER_EMAIL_MAP` JSON object mapping sheet `member_name` values to Google login emails, for example `{ "Jane Doe": "jane@example.com" }`
- `ADMIN_EMAILS` comma-separated admin emails
- `PROJECT_GSC_MAP` JSON object mapping project names to Search Console properties, for example `{ "Blog": "sc-domain:example.com" }`
- Optional `GSC_START_DATE` and `GSC_END_DATE` in `YYYY-MM-DD`; defaults to the last 28 days.

## Run locally

```bash
npm install
npm run dev
```
