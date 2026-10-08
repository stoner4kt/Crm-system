# TradePro CRM — Cloudflare Deployment Guide (Pages + Worker)

This guide puts the whole app on Cloudflare using **two pieces**:

| Piece | What it runs | Ends up at |
| --- | --- | --- |
| **Cloudflare Worker** | The API (Express backend in `server/`) | `https://tradepro-crm-api.<your-subdomain>.workers.dev` |
| **Cloudflare Pages** | The dashboard (React app in `client/`) | `https://tradepro-dashboard.pages.dev` |

The dashboard talks to the API through a proxy rule, so the browser only ever
talks to your Pages domain. Secrets stay on the Worker — nothing gets shipped
to the browser.

Work through the parts **top to bottom, in order**:

1. [Part 1 — Set up Supabase (database + login)](#part-1--set-up-supabase-database--login)
2. [Part 2 — Set up Resend (email)](#part-2--set-up-resend-email)
3. [Part 3 — Deploy the API to a Cloudflare Worker](#part-3--deploy-the-api-to-a-cloudflare-worker)
4. [Part 4 — Deploy the dashboard to Cloudflare Pages](#part-4--deploy-the-dashboard-to-cloudflare-pages)
5. [Part 5 — Verify everything works](#part-5--verify-everything-works)
6. [Part 6 — (Optional) ReviewFlow combined dashboard](#part-6--optional-reviewflow-combined-dashboard)
7. [Troubleshooting](#troubleshooting)
8. [Everything at a glance](#everything-at-a-glance)

---

## What you need before you start

| Thing | Where to get it | What it is for |
| --- | --- | --- |
| Cloudflare account | https://dash.cloudflare.com | hosts the Worker and Pages site |
| Supabase project | https://supabase.com | database, login system (Supabase Auth) |
| Resend account | https://resend.com | sends professional emails |
| Node.js **20** on your computer | https://nodejs.org | running the builds |
| The repo on your computer | `git clone https://github.com/stoner4kt/Crm-system.git` | the code you will deploy |

Clone and install once:

```bash
git clone https://github.com/stoner4kt/Crm-system.git
cd Crm-system
npm install
```

You will also want a scratchpad (a text file) to collect the keys you generate.

---

## Part 1 — Set up Supabase (database + login)

### Step 1.1 Create the project

1. Go to https://supabase.com → **Dashboard** → **New project**.
2. Pick your organisation, a project name (e.g. `crm-data`), and a region near
   your customers.
3. Set a strong database password and save it somewhere safe.
4. Click **Create new project** and wait for it to finish (about 2 minutes).

### Step 1.2 Run the database tables (migrations)

The SQL tables already exist in this repo. You just run them in Supabase:

1. In the Supabase dashboard click **SQL Editor** in the left menu.
2. Click **New query**.
3. Open the repo file `supabase/migrations/0001_init.sql`, copy **all** of it,
   paste it into the editor, click **Run**.
4. Repeat with `supabase/migrations/0002_lead_conversion.sql`.

Both files must run, in that order. They create every table (`profiles`,
`clients`, `leads`, `projects`, `settings`, `email_captures`, `email_logs`),
the Row Level Security rules, the trigger that mirrors `auth.users` into
`profiles`, and the two functions the API calls (`convert_lead_to_client` and
`get_dashboard_stats`).

### Step 1.3 Copy your API keys

1. Click **Project Settings** (gear icon, bottom-left).
2. Click **API** in the left menu.
3. Copy these three values into your scratchpad:

| Name in the dashboard | Env var it becomes | Example |
| --- | --- | --- |
| **Project URL** | `SUPABASE_URL` | `https://abcdefgh.supabase.co` |
| **anon / public** key | `SUPABASE_ANON_KEY` | `eyJhbGciOi...` |
| **service_role / secret** key | `SUPABASE_SERVICE_KEY` | `eyJhbGciOi...` |

> The **service_role** key is the powerful one. It never goes into the frontend
> and never goes into git. You will add it as a Worker secret in Part 3.

### Step 1.4 You are done with Supabase for now

Your users log in through **Supabase Auth** — you don't run your own password
system. The dashboard becomes the place where you create your first user (in
Part 5).

---

## Part 2 — Set up Resend (email)

### Step 2.1 Create an API key

1. Go to https://resend.com and sign in.
2. Click **API Keys** in the left menu → **Create API Key**.
3. Name it `crm-production`, choose **Full access**, and copy the key into your
   scratchpad. It starts with `re_`.

### Step 2.2 Verify a sending domain

So emails can come from *your* business, not from a shared address:

1. Click **Domains** → **Add Domain**.
2. Type your own domain (for example `acmeplumbing.com`).
3. Resend shows **3 DNS records** (SPF, DKIM, and a tracking domain).
4. Add those records to your DNS provider. If your domain is on Cloudflare,
   add them there.
5. Wait for the domain to show **Verified** (usually a few minutes, sometimes
   a few hours).

### Step 2.3 Note your sender address

After verification, you can send from addresses on your domain, for example:

```
hello@acmeplumbing.com
```

Without a verified domain, Resend only lets you send from the shared
`onboarding@resend.dev` — fine for testing, not for production.

---

## Part 3 — Deploy the API to a Cloudflare Worker

The API is the `server/` folder. Its Worker config file (`wrangler.jsonc`) is
already in the repo — you only add your keys to it.

### Step 3.1 Log in to Cloudflare from your terminal

```bash
cd server
npx wrangler login
```

A browser tab opens — click **Allow** to let the CLI deploy for you. Check it
worked:

```bash
npx wrangler whoami
```

You should see your email address and Account ID.

### Step 3.2 Add the non-secret values to `wrangler.jsonc`

Open `server/wrangler.jsonc` and edit the `vars` section so it looks like this
(replace the placeholder URL and key with yours):

```jsonc
"vars": {
  "NODE_ENV": "production",
  "PORT": "3000",
  "CORS_ORIGIN": "*",
  "LOG_LEVEL": "info",
  "SUPABASE_URL": "https://abcdefgh.supabase.co",
  "SUPABASE_ANON_KEY": "eyJhbGciOi...",
  "SUPABASE_EMAIL_REDIRECT": "https://tradepro-dashboard.pages.dev/login",
  "REVIEWFLOW_URL": "",
  "REVIEWFLOW_AUTO_SEND": "true"
}
```

(`SUPABASE_EMAIL_REDIRECT` points at the dashboard you will create in Part 4.
If your Pages project ends up with a different name, update this later.)

Leave `"CORS_ORIGIN": "*"` for now. You will replace it with your real
dashboard address in Part 4, Step 4.4.

### Step 3.3 Add the secrets

Secrets are stored separately by Cloudflare (encrypted) so they never appear
in git or in the config file. Run each line — Cloudflare will ask you to type
the value, then press Enter:

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY --name=tradepro-crm-api
npx wrangler secret put RESEND_API_KEY        --name=tradepro-crm-api
npx wrangler secret put JWT_SECRET            --name=tradepro-crm-api
npx wrangler secret put CAPTURE_SECRET        --name=tradepro-crm-api
npx wrangler secret put REVIEWFLOW_SECRET     --name=tradepro-crm-api
```

What goes in each one:

| Secret | Value to type |
| --- | --- |
| `SUPABASE_SERVICE_KEY` | the **service_role** key from Step 1.3 |
| `RESEND_API_KEY` | the `re_...` key from Step 2.1 |
| `JWT_SECRET` | any long random string, e.g. run `openssl rand -hex 32` |
| `CAPTURE_SECRET` | any random string (protects your public email form) |
| `REVIEWFLOW_SECRET` | leave blank (press Enter twice to skip) unless you use Part 6 |

> The `--name=tradepro-crm-api` must match the `"name"` field in
> `wrangler.jsonc`. If you renamed the Worker, use your name instead.

### Step 3.4 Build and deploy the API

```bash
npm run build          # type-checks the code and creates server/dist
npm run deploy:worker  # runs: wrangler deploy --config wrangler.jsonc
```

When it finishes, Cloudflare prints your Worker URL. Write it in your
scratchpad:

```
https://tradepro-crm-api.<your-subdomain>.workers.dev
```

### Step 3.5 Test the API

```bash
curl https://tradepro-crm-api.<your-subdomain>.workers.dev/api/health
```

You should get exactly this JSON:

```json
{"ok":true,"service":"tradepro-crm","version":"1.0.0","store":"supabase","email":"resend"}
```

Read the two flags:

- `"store":"supabase"` → the Worker can see your Supabase keys. If it says
  `"local"`, go back to Step 3.2 (vars) and Step 3.3 (`SUPABASE_SERVICE_KEY`).
- `"email":"resend"` → the Worker can see your Resend key. If it says
  `"console"`, re-run `wrangler secret put RESEND_API_KEY`.

---

## Part 4 — Deploy the dashboard to Cloudflare Pages

The dashboard is the `client/` folder. Cloudflare Pages builds it for you every
time you push to GitHub.

### Step 4.1 Create the Pages project

1. Go to the Cloudflare dashboard → **Workers & Pages** in the left menu.
2. Click **Create** → **Pages** → **Connect to Git**.
3. Choose GitHub, then the `Crm-system` repository.
4. Under **Set up builds and deployments**, select the branch you want to
   deploy (for example `main`) and click **Begin setup**.

### Step 4.2 Use these exact build settings

| Setting | Value |
| --- | --- |
| **Framework preset** | Vite |
| **Build command** | `npm --prefix client install && npm --prefix client run build` |
| **Build output directory** | `client/dist` |
| **Root directory** | *(leave empty)* |
| **Node version** | 20 |

Then click **Save and Deploy**.

> Cloudflare runs the build command from the repo root, so
> `npm --prefix client ...` tells it to work inside the `client/` folder. The
> finished site lands in `client/dist`, which is exactly the folder Pages
> publishes to its CDN.

### Step 4.3 Make the dashboard routes and the API proxy work

Your dashboard uses URLs like `/projects` and `/leads`. Without a rewrite rule,
refreshing on one of those URLs returns a 404. The dashboard also calls the API
at `/api/...`, which must be forwarded to your Worker.

Do this once, in the repo:

1. Create the folder `client/public/`.
2. Inside it create a file named `_redirects` (no file extension) with exactly
   this content — replace the worker URL with yours:

   ```text
   /api/*  https://tradepro-crm-api.<your-subdomain>.workers.dev/api/:splat  200
   /*      /index.html  200
   ```

3. Commit and push:

   ```bash
   git add client/public/_redirects
   git commit -m "Add Pages redirects for SPA routing and API proxy"
   git push
   ```

Pushing triggers a new Pages build automatically.

> Here is what the two rules do:
> - Rule 1 forwards every `/api/...` request to your Worker and returns the
>   response. The browser never makes a cross-origin call, so you avoid CORS
>   errors entirely for the dashboard's normal usage.
> - Rule 2 sends every other URL to `index.html` so React Router can handle
>   `/projects`, `/leads`, etc.

### Step 4.4 Get your dashboard URL and lock down CORS

1. In **Workers & Pages** → your Pages project → **Deployments**, open the
   production URL. It looks like `https://tradepro-dashboard.pages.dev`.
   Write it in your scratchpad.
2. Edit `server/wrangler.jsonc` and set `CORS_ORIGIN` to that exact address:

   ```jsonc
   "CORS_ORIGIN": "https://tradepro-dashboard.pages.dev",
   ```

3. Redeploy the Worker:

   ```bash
   cd server
   npm run deploy:worker
   ```

> Locking CORS to your dashboard address stops other websites from calling your
> API. If you use a custom domain later, set it to that instead.

---

## Part 5 — Verify everything works

1. Open `https://tradepro-dashboard.pages.dev` in your browser.
2. Click **Sign up** / **Register** and create your account (your email and a
   password). Supabase Auth creates the user, and the trigger adds their row to
   `profiles`.
3. Log in. The dashboard should load your leads, projects, clients, and stats
   — all pulled from the Worker API through the `/api/*` proxy.
4. (Recommended) Make the public email-capture form route to **your** account:

   - On the Worker, add a new var `CAPTURE_OWNER_EMAIL` = the email you just
     registered with.
   - Add it under `vars` in `server/wrangler.jsonc`, then redeploy:
     ```bash
     cd server
     npm run deploy:worker
     ```
   - Now when someone submits your website form
     (`POST /api/capture/public`), the lead lands in **your** dashboard and a
     welcome email is sent through Resend.

Re-check the health endpoint after all the wiring is done:

```bash
curl https://tradepro-crm-api.<your-subdomain>.workers.dev/api/health
# {"ok":true,"service":"tradepro-crm","version":"1.0.0","store":"supabase","email":"resend"}
```

---

## Part 6 — (Optional) ReviewFlow combined dashboard

ReviewFlow is a second Supabase project that sends review-request emails. The
CRM repo already contains the dashboard UI and the server bridge for it. To
turn it on:

1. In `server/wrangler.jsonc`, set the URL of your ReviewFlow project:

   ```jsonc
   "REVIEWFLOW_URL": "https://<reviewflow-project-ref>.supabase.co",
   ```

2. Set the matching secret (must be non-empty to enable the feature):

   ```bash
   cd server
   npx wrangler secret put REVIEWFLOW_SECRET --name=tradepro-crm-api
   ```

3. Redeploy the Worker:

   ```bash
   npm run deploy:worker
   ```

4. In Cloudflare Pages → your project → **Settings** → **Environment
   variables** → **Production**, add:

   | Name | Value |
   | --- | --- |
   | `VITE_ENABLE_REVIEWS_INTEGRATION` | `true` |

   This is a **build-time** variable (Vite inlines it into the bundle), so
   re-deploy the Pages project afterwards (via the dashboard's **Retry
   deployment** button or a new push).

5. The ReviewFlow Supabase project must expose these edge functions:
   `integration-capture`, `integration-send-review`, `integration-lookup`, and
   an `INTEGRATION_SECRET` env var **equal to** the `REVIEWFLOW_SECRET` you set
   on the Worker.

The Projects page then shows a review-status badge and a **Send Review
Request** button, and completing a project can automatically send the review.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/api/health` shows `"store":"local"` | The Worker can't find Supabase keys. Re-run `npx wrangler secret put SUPABASE_SERVICE_KEY --name=tradepro-crm-api` and confirm `SUPABASE_URL`/`SUPABASE_ANON_KEY` are in `vars`. |
| `/api/health` shows `"email":"console"` | `RESEND_API_KEY` secret is missing. Re-run `npx wrangler secret put RESEND_API_KEY --name=tradepro-crm-api`. |
| Login says "Invalid credentials" even with the right password | The user's `profiles` row is missing. Re-run `0001_init.sql` (the trigger backfills it) or delete the user in Supabase → Authentication and register again. |
| Refreshing `/projects` on the dashboard 404s | The `_redirects` file wasn't deployed. Confirm `client/public/_redirects` exists (`/*  /index.html  200`), then push again. |
| Every `/api` call from the dashboard 404s | The proxy rule's target is wrong or out of date. Check the Worker URL in `client/public/_redirects` and re-push. |
| CORS error "No 'Access-Control-Allow-Origin'" in the console | Set `CORS_ORIGIN` in `wrangler.jsonc` to your exact Pages URL and redeploy the Worker (Step 4.4). |
| Emails never arrive | The domain isn't verified in Resend, or `RESEND_FROM_EMAIL` is still `onboarding@resend.dev`. Verify the domain and use a sender on it. |
| Pages build fails with "vite: not found" | The build command must install first. Use exactly: `npm --prefix client install && npm --prefix client run build`. |
| Deploy fails on a `cloudflare:node` type error | Run `npm install` at the repo root first, then `cd server && npm run typecheck:worker`. |
| Captures create a lead for nobody | Set `CAPTURE_OWNER_EMAIL` on the Worker (Part 5, step 4) to the account you registered with. |

---

## Everything at a glance

**Cloudflare Worker (the API)**
- Config file: `server/wrangler.jsonc` (already in the repo)
- Non-secret settings: edited under `vars` in that file
- Secrets: `npx wrangler secret put <NAME> --name=tradepro-crm-api`
- Deploy: `cd server && npm run deploy:worker`
- Smoke test: `GET /api/health` → `{"store":"supabase","email":"resend"}`

**Cloudflare Pages (the dashboard)**
- Framework preset: **Vite**
- Build command: `npm --prefix client install && npm --prefix client run build`
- Build output directory: `client/dist`
- Node version: **20**
- Routing: `client/public/_redirects` (`/* → /index.html`, `/api/* → Worker`)

**Supabase**
- Run both migrations: `0001_init.sql`, then `0002_lead_conversion.sql`
- Keys: Project URL + anon key → Worker `vars`; service_role key → Worker secret

**Resend**
- API key → Worker secret (`RESEND_API_KEY`)
- Verified domain → lets you send from `hello@yourdomain.com`

**Order of operations**
1. Supabase project + migrations (Part 1)
2. Resend key + domain (Part 2)
3. Worker API deployed and healthy (Part 3)
4. Pages dashboard deployed + wired to the API (Part 4)
5. Register your first user and verify the full loop (Part 5)