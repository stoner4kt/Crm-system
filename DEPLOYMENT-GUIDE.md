# TradePro CRM — Cloudflare Deployment Guide

This guide walks you through deploying the full TradePro CRM on Cloudflare:

- **API + dashboard**: one Cloudflare Worker (via `wrangler.jsonc`), which also
  serves the built React dashboard from `client/dist`.
- **Database + Auth**: Supabase (tables, RLS, triggers, and the two RPC
  functions used by the API).
- **Email**: Resend.
- **Optional ReviewFlow integration** (combined dashboard).

> The Worker uses the `nodejs_compat` flag and the `cloudflare:node`
> `httpServerHandler` bridge, so the same Express app that runs locally also
> runs inside the Worker. No code changes are required between local and
> Cloudflare.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [One-time project setup](#2-one-time-project-setup)
3. [Supabase — database, auth, and email capture](#3-supabase--database-auth-and-email-capture)
4. [Resend — transactional email](#4-resend--transactional-email)
5. [Local build & verification](#5-local-build--verification)
6. [Cloudflare Workers — deploy the API](#6-cloudflare-workers--deploy-the-api)
7. [Cloudflare Pages — deploy the dashboard (recommended)](#7-cloudflare-pages--deploy-the-dashboard-recommended)
8. [Secrets & environment variables](#8-secrets--environment-variables)
9. [Custom domain](#9-custom-domain)
10. [ReviewFlow integration (combined dashboard)](#10-reviewflow-integration-combined-dashboard)
11. [Optional: provision a shared login for two Supabase projects](#11-optional-provision-a-shared-login-for-two-supabase-projects)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

- [Node.js](https://nodejs.org/) **18+** (20+ recommended) and npm.
- A [Cloudflare](https://dash.cloudflare.com/) account.
- A [Supabase](https://supabase.com/) project (free tier is fine).
- A [Resend](https://resend.com/) account and API key.
- The repository cloned locally:

  ```bash
  git clone https://github.com/stoner4kt/Crm-system.git
  cd Crm-system
  ```

- Install dependencies:

  ```bash
  npm install                       # installs server + client workspaces
  ```

---

## 2. One-time project setup

### 2.1. Log in to Cloudflare

```bash
npx wrangler login
```

This opens the browser and gives the CLI permission to deploy Workers. Verify
you are authenticated:

```bash
npx wrangler whoami
```

### 2.2. Directory layout (what you will deploy)

| Folder | Purpose | Deploys to |
| --- | --- | --- |
| `server/` | Express + TypeScript API + `wrangler.jsonc` (the Worker) | Cloudflare Workers |
| `client/` | React + Vite dashboard (SPA) | Cloudflare Pages (recommended) or the Worker |

---

## 3. Supabase — database, auth, and email capture

### 3.1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users, and set a strong database password.
3. Note the **Project URL** (e.g. `https://abcdefgh.supabase.co`).

### 3.2. Run the migrations

There are two ways:

**A. Via Supabase CLI**

```bash
cd supabase
supabase db push
```

**B. Via the Supabase Dashboard SQL editor**

Open **SQL Editor** and paste the contents of:

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_lead_conversion.sql`

in order, then **Run**. This creates the `profiles`, `clients`, `leads`,
`projects`, `settings`, `email_captures`, and `email_logs` tables with Row
Level Security (RLS), the auth-triggers that mirror `auth.users` into
`profiles`, and the two RPC functions `convert_lead_to_client` and
`get_dashboard_stats`.

> You must run **both** files. `0002` depends on the schema in `0001`.

### 3.3. Grab the API keys

**Project Settings → API**:

- **Project URL** (`SUPABASE_URL`)
- **anon / public key** (`SUPABASE_ANON_KEY`)
- **service_role / secret key** (`SUPABASE_SERVICE_KEY`) — keep this secret!

> The server (the Worker) uses the **service role** key so RLS stays enabled
> while the backend can still do admin auth operations.

### 3.4. Email capture ownership (optional but recommended)

The public capture endpoint
(`POST /api/capture/public` on your Worker URL) needs to know which CRM user
"owns" an incoming lead. Set `CAPTURE_OWNER_EMAIL` to the email of the first
registered user, or have the form post a `businessEmail` field. See the
`server/.env.example` comments.

---

## 4. Resend — transactional email

1. Create an account at <https://resend.com>.
2. **API Keys** → **Create API key** (use `re_...`).
3. Verify a domain (**Domains** tab); wait for DNS verification.
4. Update the sender `from` address to your verified domain, e.g.:

   ```
   RESEND_FROM_EMAIL="Acme Plumbing <hello@yourdomain.com>"
   RESEND_REPLY_TO="sales@yourdomain.com"
   ```

> If you skip Resend, the server logs email to the console instead (useful for
> testing) — the app still works.

---

## 5. Local build & verification

Do this before touching Cloudflare so you know the code is healthy.

```bash
npm install

# Type checks
cd server && npm run typecheck          # app
npm run typecheck:worker                # Cloudflare Worker entry
cd ../client && npm run build           # SPA production build

# Tests
cd ../server && npm test                # 32 tests, should all pass
```

Expected result: typechecks pass, the client build succeeds
(`client/dist`), and `npm test` reports **32 passing** tests.

> The Worker entry is `server/src/worker.ts`. It is intentionally excluded
> from the main server `typecheck` (see `server/tsconfig.json`); the
> `typecheck:worker` script checks it against the Cloudflare Workers types.

---

## 6. Cloudflare Workers — deploy the API

### 6.1. Configure `wrangler.jsonc`

The file already exists at `server/wrangler.jsonc` and is set up for the
Worker (`name: tradepro-crm-api`, `main: src/worker.ts`,
`compatibility_date: 2025-08-16`, and the flags below). Review it:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tradepro-crm-api",
  "main": "src/worker.ts",
  "compatibility_date": "2025-08-16",
  "compatibility_flags": ["nodejs_compat", "nodejs_compat_populate_process_env"],
  "vars": { ... },
  "observability": { "enabled": true }
}
```

You can leave the file as-is. Put **non-secret** vars in `vars` and **secret**
vars via `wrangler secret put` (step 6.3) so they are never committed.

### 6.2. Add non-secret vars

Edit `vars` in `server/wrangler.jsonc` to add the non-secret configuration:

```jsonc
"vars": {
  "NODE_ENV": "production",
  "PORT": "3000",
  "CORS_ORIGIN": "*",
  "LOG_LEVEL": "info",
  "SUPABASE_URL": "https://abcdefgh.supabase.co",
  "SUPABASE_ANON_KEY": "<anon-key>",
  "SUPABASE_EMAIL_REDIRECT": "https://tradepro-dashboard.pages.dev/login",
  "REVIEWFLOW_URL": "",        // optional; see section 10
  "REVIEWFLOW_AUTO_SEND": "true"
}
```

> `SUPABASE_URL` and `SUPABASE_ANON_KEY` are public by design. The service-key
> and other secrets go in step 6.3.

### 6.3. Add secrets (never in git)

```bash
cd server
npx wrangler secret put SUPABASE_SERVICE_KEY --name=tradepro-crm-api
npx wrangler secret put RESEND_API_KEY        --name=tradepro-crm-api
npx wrangler secret put JWT_SECRET            --name=tradepro-crm-api
npx wrangler secret put CAPTURE_SECRET        --name=tradepro-crm-api
npx wrangler secret put REVIEWFLOW_SECRET     --name=tradepro-crm-api   # if using ReviewFlow
npx wrangler secret put PUBLIC_BASE_URL       --name=tradepro-crm-api   # optional
```

Each command prompts for the value on stdin (paste then Enter). The
`--name` flag can be omitted when inside the `server/` directory (it reads
`wrangler.jsonc`).

### 6.4. Build & deploy

```bash
cd server
npm run build            # typechecks server code first (tsc)
npm run deploy:worker    # npx wrangler deploy --config wrangler.jsonc
```

You will get a URL like `https://tradepro-crm-api.<your-subdomain>.workers.dev`.

### 6.5. Smoke test the deployed API

```bash
curl https://tradepro-crm-api.<your-subdomain>.workers.dev/api/health
```

Expected output:

```json
{"ok":true,"service":"tradepro-crm","version":"1.0.0","store":"supabase","email":"resend"}
```

- `store: "supabase"` → the Worker sees your `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- `email: "resend"` → it sees `RESEND_API_KEY`.

> If `store` shows `local`, a secret/var is missing. Go back to §6.2/§6.3.

### 6.6. Optional: also serve the dashboard from the Worker

The Express app serves `client/dist` automatically when `NODE_ENV=production`
and `../client/dist` exists relative to the Worker's working directory.
You must upload the SPA as a Worker asset so `../client/dist` resolves:

```bash
cd client && npm run build
cd ../server && npx wrangler deploy --config wrangler.jsonc --assets ../client/dist
```

This is an alternative to hosting the dashboard separately (next section).
The recommended approach is Cloudflare Pages for the dashboard + a Worker for
the API, which gives you a clean single deployment for the SPA and simpler
routing (see below).

---

## 7. Cloudflare Pages — deploy the dashboard (recommended)

Hosting the React SPA on **Cloudflare Pages** and the API on a **Worker** is
the cleanest split: the SPA is static and edge-cached, and the API stays on
the Worker.

### 7.1. Create the Pages project

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick the `stoner4kt/Crm-system` repo and the branch you deploy (e.g. `main`).

### 7.2. Build settings (exact)

| Setting | Value |
| --- | --- |
| **Framework preset** | `Vite` |
| **Build command** | `npm --prefix client install && npm --prefix client run build -- --base=/ --out-dir=dist` |
| **Build output directory** | `client/dist` |
| **Root directory** | (leave empty — build from repo root) |
| **Node version** | `20` (or `22`) |

Alternate build command if you prefer a root-level build:

```bash
cd client
npm install
npm run build
```

You can also run the install separately in a `pre` step; the one-liner above
works because Pages runs each build from the repo root on a fresh machine.

### 7.3. Environment variables for the SPA build

Set these in **Settings → Environment variables → Production**:

| Name | Value | When |
| --- | --- | --- |
| `VITE_ENABLE_REVIEWS_INTEGRATION` | `true` | Only when using ReviewFlow (§10). Leave unset otherwise. |

> Keep `VITE_*` variables **build-time** (they get inlined at build). Do not
> use runtime "secret" variables for the SPA — anything `VITE_`-prefixed is
> bundled into the JS bundle and is public.

### 7.4. Redirects / SPA routing

Because the dashboard uses client-side routing (`/`, `/leads`, `/projects`, …),
add a `_redirects` file so deep links work. The client has no `public/` dir by
default — create `client/public/_redirects` (kept out of builds, Pages picks it
up from `client/dist/_redirects`):

```text
/*  /index.html  200
```

Build will copy `client/public/*` into `dist` automatically. If you do not
want a `public/` dir, add the same rule in **Settings → Redirects** in the
Pages dashboard instead.

### 7.5. Deploy & get the URL

Deploy the branch. After the first successful build you get
`https://<project-name>.pages.dev`. Open it — you should see the dashboard's
login page.

### 7.6. Point the SPA at the Worker API

The SPA calls `/api/*` via a relative fetch (see `client/src/lib/api.ts`). On
Pages, `/api` doesn't exist, so add a proxy rule. Add to
`client/public/_redirects`:

```text
/*  /index.html  200
/api/*  https://tradepro-crm-api.<your-subdomain>.workers.dev/api/:splat  200
```

or use **Pages → Functions** (`/api/*` worker) to proxy:

```ts
// functions/api/[[path]].ts (Cloudflare Pages Function)
export const onRequest = async ({ request }) => {
  const url = new URL(request.url);
  url.hostname = 'tradepro-crm-api.<your-subdomain>.workers.dev';
  return fetch(new Request(url.toString(), request));
};
```

Then in `vite.config.ts` the dev proxy remains unchanged; in production the
SPA talks to the Worker via the redirect/function.

> Important: the API must accept CORS from your Pages domain. Set
> `CORS_ORIGIN` to your Pages URL (e.g. `https://tradepro-dashboard.pages.dev`)
> instead of `*` when you need credentials. The dashboard sends
> `Authorization: Bearer <token>` — a Preflight `OPTIONS` must pass (CORS
> middleware handles it, but the origin must be allowed).

### 7.7. Deployment order (first launch)

Deploy **the Worker first** (so the API is reachable), then Pages. Once both
are up:

1. Open the dashboard URL.
2. Register the first user (the profile trigger creates the `profiles` row).
3. Set `CAPTURE_OWNER_EMAIL` = that user's email on the Worker (via
   `wrangler secret put CAPTURE_OWNER_EMAIL` or `vars`) so website captures
   route to them.

---

## 8. Secrets & environment variables

Summary of every variable the server reads (from `server/src/utils/config.ts`
and the auth service):

| Variable | Required? | Where to set (Worker) | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | yes (prod) | `vars` | Distinguishes Supabase mode |
| `SUPABASE_ANON_KEY` | yes (prod) | `vars` | Public key (also used by client) |
| `SUPABASE_SERVICE_KEY` | yes (prod) | `secret put` | Backend data + admin auth |
| `RESEND_API_KEY` | no | `secret put` | Enables real email |
| `RESEND_FROM_EMAIL` | no | `vars` | Sender address |
| `RESEND_REPLY_TO` | no | `vars` | Reply-to |
| `JWT_SECRET` | yes (prod) | `secret put` | Signs local JWTs (fallback auth) |
| `JWT_EXPIRES_IN` | no | `vars` | Token TTL, default `7d` |
| `CORS_ORIGIN` | no | `vars` | CORS allowlist, default `*` |
| `LOG_LEVEL` | no | `vars` | `info`/`debug`/... |
| `PORT` | no | `vars` | Basement port for the Worker bridge, `3000` |
| `NODE_ENV` | yes (prod) | `vars` | Must be `production` to serve SPA from Worker |
| `CAPTURE_SECRET` | no | `secret` / `vars` | Optional capture auth |
| `REQUIRE_CAPTURE_SECRET` | no | `vars` | `1` to enforce capture secret |
| `CAPTURE_OWNER_EMAIL` | no | `vars` | Default owner of anonymous captures |
| `PUBLIC_BASE_URL` | no | `secret` / `vars` | Base URL for auth redirects / emails |
| `SUPABASE_EMAIL_REDIRECT` | no | `vars` | Post-signup redirect (needs full URL) |
| `REVIEWFLOW_URL` | no | `vars` | Enables ReviewFlow when combined with secret |
| `REVIEWFLOW_SECRET` | no | `secret put` | Shared secret with ReviewFlow edge fns |
| `REVIEWFLOW_AUTO_SEND` | no | `vars` | Auto-send review on completed project |

Client build-time variables (Pages):

| Variable | Purpose |
| --- | --- |
| `VITE_ENABLE_REVIEWS_INTEGRATION` | Show review UI when `"true"` |

---

## 9. Custom domain

### 9.1. For the Worker/Pages projects

1. **Workers & Pages → your project → Settings → Domains → Add**. 
2. Follow the DNS records Cloudflare shows you (or point a subdomain via CNAME).

### 9.2. Storing a custom domain in the SPA redirect base

If you use a custom domain, update the `_redirects` proxy (§7.6) to point at
it, and set `SUPABASE_EMAIL_REDIRECT` and `PUBLIC_BASE_URL` to the final URL so
the "confirm email" link and capture ownership use the right host.

---

## 10. ReviewFlow integration (combined dashboard)

The CRM can talk to a second Supabase project ("ReviewFlow") that runs
edge functions for review capture/send. The CRM itself hosts the *client UI
and proxy* — ReviewFlow only handles review email flow.

### 10.1. Server side (Worker)

Set on the Worker:

```
vars:
  REVIEWFLOW_URL=https://<reviewflow-project-ref>.supabase.co
  REVIEWFLOW_AUTO_SEND=true         # optional

secret put:
  REVIEWFLOW_SECRET=<shared-integration-secret>
```

`REVIEWFLOW_URL` + `REVIEWFLOW_SECRET` both present → the integration is
enabled. The proxy endpoints are:

- `GET  /api/integration/reviews/status?email=...`
- `POST /api/integration/reviews/send  {email, externalId}`

These fire `reviewflowEnabled()`-gated calls to
`{REVIEWFLOW_URL}/functions/v1/integration-*` and 404 when disabled.

### 10.2. Client side (Pages)

Add `VITE_ENABLE_REVIEWS_INTEGRATION=true` to the **build-time** environment
variables (§7.3) and rebuild. The Projects page then shows the
review-status badge and a **Send Review Request** button (guarded, so the page
works normally without it).

### 10.3. Edge functions in the ReviewFlow project

The ReviewFlow Supabase project must publish these edge functions (names are
part of the documented contract):

- `integration-capture` — fire-and-forget lead/new-client creation.
- `integration-send-review` — sends the review email (Resend).
- `integration-lookup` — returns review status for the dashboard badge.

They must accept the `x-integration-secret` header and verify it against an
`INTEGRATION_SECRET` environment variable set on **that** project, matching the
`REVIEWFLOW_SECRET` you set on the CRM Worker.

### 10.4. Combined login (optional)

See the provision script in the next section to create one user in **both**
Supabase projects so a customer signs into the CRM and ReviewFlow with the
same email/password.

---

## 11. Optional: provision a shared login for two Supabase projects

The repo includes `server/scripts/provision-user.ts` to create the same user
in both the CRM project and the ReviewFlow project:

```bash
cd server
PROVISION_EMAIL=owner@yourcompany.com \
PROVISION_PASSWORD='s3cure-password' \
SUPABASE_URL=https://crm-project.supabase.co \
SUPABASE_SERVICE_KEY=svc_key_crm \
REVIEWFLOW_SUPABASE_URL=https://reviewflow-project.supabase.co \
REVIEWFLOW_SUPABASE_SERVICE_KEY=svc_key_reviewflow \
npm run provision:user
```

It calls `auth.admin.createUser()` with `email_confirm: true` on each project
and skips ones where the user already exists. Secrets come from env vars only —
nothing is stored in git.

---

## 12. Troubleshooting

### `/api/health` returns `store: local`

`SUPABASE_URL` or `SUPABASE_SERVICE_KEY` is missing/unreadable in the Worker.
Re-run:
```bash
npx wrangler secret put SUPABASE_SERVICE_KEY --name=tradepro-crm-api
```
and confirm `vars` contain both `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### 500 on login after deploy

The `profiles` row is created **in the migrations**, and the auth trigger
mirrors new users. If you ran the migrations *after* registering the user, the
trigger won't backfill. Either re-run the SQL or delete the user in
**Supabase → Authentication** and register again.

### CORS "No 'Access-Control-Allow-Origin'" in the dashboard console

Set `CORS_ORIGIN` on the Worker to your exact Pages domain (with scheme), then
redeploy. It must also be a `vars` value, not a secret, because it's read as a
string at request time (it is — it's a plain `vars` string).

### Build fails in Pages with "vite not found"

The Pages build runs from the repo root. Use the exact build command from
§7.2 (`npm --prefix client install && npm --prefix client run build -- ...`).
It installs the client deps and outputs to `client/dist`.

### Deep-link to `/projects` returns 404 on Pages

The `_redirects` file (`/*  /index.html  200`) was not published. Confirm
`client/public/_redirects` exists and shows up in `client/dist/_redirects`
after a build, or add the rule under **Settings → Redirects**.

### Worker deploy fails on `cloudflare:node` type

The type is provided by `@cloudflare/workers-types` (installed). Make sure
`node_modules` is fresh (`npm install` at the repo root) and you run
`npm run typecheck:worker` from `server/` — this catches it before deploy.

### Emails never arrive (Resend)

- Confirm the domain is verified in Resend (DNS records).
- Set `RESEND_FROM_EMAIL` to a sender on your verified domain (not
  the default `onboarding@resend.dev` for production sends).
- Check the Worker logs (Workers & Pages → project → Logs) for the
  `Resend not configured` message, which means `RESEND_API_KEY` is missing.

### Worker Logs

With `observability.enabled: true`, logs appear under
**Workers & Pages → your worker → Logs**. `LOG_LEVEL=info` gives you
startup + request logs; set `LOG_LEVEL=debug` for capture-email payloads.

---

## Recap — the exact Cloudflare build settings

**Workers (API):**

- Config: `server/wrangler.jsonc` (committed)
- Deploy: `cd server && npm run deploy:worker`
- Flags: `nodejs_compat`, `nodejs_compat_populate_process_env`
- Secrets: `wrangler secret put` from §6.3
- Vars: edit `vars` in `wrangler.jsonc` (§6.2)

**Pages (dashboard):**

- Framework preset: **Vite**
- Build command:
  `npm --prefix client install && npm --prefix client run build -- --base=/ --out-dir=dist`
- Output directory: `client/dist`
- Build-time env: `VITE_ENABLE_REVIEWS_INTEGRATION=true` (only if using ReviewFlow)
- Redirects: `/*  /index.html  200` and ` /api/*` proxy to the Worker (§7.6)

**Order of operations:**

1. Supabase project + migrations (§3)
2. Resend key + domain (§4)
3. Local checks (§5)
4. Deploy Worker (§6) → get API URL
5. Deploy Pages dashboard (§7) → wire `/api` proxy → get dashboard URL
6. Custom domain (§9) + ReviewFlow (§§10–11)

You now have a service-business CRM on Cloudflare: leads, projects, clients,
email capture, Supabase Auth, and Resend email — all in one dashboard.