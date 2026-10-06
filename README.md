# TradePro CRM

A CRM microservice for **service-based businesses** — plumbers, electricians, roofing
contractors, HVAC techs, landscapers. Track leads, convert them into clients and
projects automatically, capture emails from your website, and send professional
customer emails — all from one dashboard.

## What's inside

```
├── server/       Express + TypeScript API (the microservice)
├── client/       React + Vite + Tailwind dashboard
└── supabase/     SQL migrations (schema + RLS + triggers)
```

### Server
| Concern | Tech |
| --- | --- |
| API | Express + TypeScript, Zod validation |
| Data layer | Repository pattern — `SupabaseStore` (production) with a `LocalStore` in-memory fallback (dev/tests). Both implement one `Store` interface and are injected into route factories. |
| Auth | **Supabase Auth** when configured; **JWT fallback** (bcrypt hashed local users) otherwise |
| Email | **Resend** professional HTML templates with a console-mail fallback |
| Tests | Vitest + Supertest, integration tests against the local store |

### Client
React 18 + Vite + Tailwind dashboard with pages for:
- **Dashboard** — KPI cards (leads, won, active/completed projects, clients, emails sent) plus recent-leads / recent-projects / activity feeds
- **Leads** — pipeline with status filter chips, inline status flow, welcome-email action, and **one-click won-→ client + project conversion**
- **Clients** — searchable card grid with add/edit/delete
- **Projects** — status boards, quick status advancement, client update emails
- **Activity ledger** — every website form capture and sent email
- **Settings** — business profile, email defaults, change password

## Quick start (no external services)

```bash
npm install
npm run dev
```

- API → http://localhost:4000
- Dashboard → http://localhost:5173 (Vite proxies `/api` to the API)

Without any env vars the API uses the in-memory `LocalStore` and a JWT auth
fallback with bcrypt password hashing. Emails are logged to the console instead
of sent.

## Going full production (Supabase + Resend)

1. **Supabase** — create a project, then run the migrations:
   ```bash
   supabase db push    # or paste supabase/migrations/*.sql into the SQL editor
   ```
   Grab the **Project URL**, **anon key** and **service-role key** from
   Project Settings → API.

2. **Resend** — create an API key at https://resend.com/api-keys and verify a
   domain so emails send from you@yourdomain.com.

3. Configure the server:
   ```bash
   cp server/.env.example server/.env
   ```
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=<anon>
   SUPABASE_SERVICE_KEY=<service-role>
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL="Acme Plumbing <hello@yourdomain.com>"
   ```
   With `SUPABASE_*` present the server uses `SupabaseStore` + Supabase Auth;
   with `RESEND_API_KEY` it sends real email through Resend. Remove them to drop
   back to the local fallbacks.

4. Build and run:
   ```bash
   npm run build
   npm start
   ```
   The Express server also serves the built client from `client/dist`, so a
   single process runs the whole app.

## Website email capture

Embed this endpoint in your marketing site's contact form to turn every visitor
into a lead:

```http
POST /api/capture/public
Content-Type: application/json

{
  "email": "visitor@example.com",
  "fullName": "Wendy Visitor",
  "phone": "(555) 010-2030",
  "message": "Need a new roof estimate",
  "businessEmail": "you@yourdomain.com"
}
```

- `businessEmail` routes the capture to the matching CRM user (optional — first
  user is the default owner).
- A lead is created automatically and a **professional welcome email** is sent
  via Resend.
- To protect the endpoint behind a shared secret, set `REQUIRE_CAPTURE_SECRET=1`
  and `CAPTURE_SECRET=...` in `server/.env`, and pass it as an
  `x-capture-secret` header.

## Email templates

The `emailService` renders responsive, branded HTML emails:
- `lead_welcome` — thanks-for-reaching-out with your business branding
- `quote_status` — sent automatically when a lead's status changes (won/lost/change)
- `project_update` — status updates sent to clients from the Projects page

## Lead conversion

Mark a lead as **won** and the server automatically:
1. Creates/updates a **client** record (deduped by `(user_id, email)`).
2. Creates a **project** ("Alice Smith — water heater replacement job") linked
   to the lead.
3. Records the email activity in the ledger.

The same logic exists as a PostgreSQL function (`convert_lead_to_client`) in the
Supabase migrations for server-side use.

## Testing

```bash
npm test               # Vitest + Supertest, 32 tests
npm run typecheck      # tsc in server + client
```

## Architecture notes

- **Store DI** — `createApp()` builds one `Store` (`LocalStore` or `SupabaseStore`)
  and one `AuthService`, then injects both into every route factory. No singletons.
- **Repository pattern** — `server/src/store/Store.ts` defines the interface;
  `LocalStore` and `SupabaseStore` implement it. Swap the data layer with env vars.
- **Auth** — `authService` validates Supabase JWTs when Supabase is configured,
  otherwise signs/verifies local JWTs against `users`.
- **RLS** — every table in Supabase enforces Row Level Security so users can only
  touch their own rows.