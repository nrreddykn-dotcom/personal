# Fieldwork — Lead Capture (LeadDesk Mini)

A small lead-capture app: a public landing page with a validated intake
form, and a real, session-authenticated `/admin` dashboard to review and
triage leads.

- **Stack:** Next.js 14 (App Router, TypeScript), Prisma + PostgreSQL, Tailwind CSS, Zod, bcryptjs
- **Public:** `/` — lead form (name, email, budget range, message)
- **Admin:** `/admin` — search, status filter, status toggle (New / Contacted / Closed) — behind real login
- **Login:** `/login` — email + password, backed by hashed credentials and server-side sessions

---

## Data model

Three tables (`prisma/schema.prisma`):

**`Lead`** — one row per form submission.
`id, name, email, budgetRange, message, status (NEW | CONTACTED | CLOSED), createdAt, updatedAt`.
Indexed on `status` and `createdAt` since the admin view filters and sorts on both.

**`AdminUser`** — one row per admin account.
`id, email (unique), passwordHash, createdAt`.
There is no plaintext password anywhere, in the database or in code — only
a bcrypt hash (12 salt rounds). Accounts are created with a CLI script
(below), not a public sign-up form, since this is an internal tool.

**`Session`** — one row per active login.
`id, tokenHash (unique), adminId, expiresAt, createdAt`.
Sessions are opaque, server-side, and revocable — see the auth section below.

```
AdminUser 1 ──< Session      (an admin can have several active sessions)
Lead                          (independent — leads don't reference admins)
```

---

## Auth approach

This isn't the hardcoded-string Basic Auth from the first pass. It's a
standard session-cookie flow, built from primitives rather than a
dependency, so every step is inspectable:

1. **Passwords** are hashed with bcrypt (`lib/password.ts`) before they
   ever touch the database. Login compares the submitted password against
   the stored hash — the hash itself is never sufficient to log in.
2. **Sessions are opaque random tokens**, not JWTs. On login
   (`app/api/auth/login/route.ts`), the server generates a 256-bit random
   token, stores a **SHA-256 hash** of it in the `Session` table with a
   7-day expiry, and sends the raw token to the browser as an `httpOnly`,
   `secure`, `SameSite=Lax` cookie. The database never holds a usable
   token — even a DB leak doesn't hand out working sessions.
3. **Every admin request re-checks the session against the database**
   (`lib/auth.ts` → `requireAdminSession` for API routes,
   `getSessionAdmin` for the server-rendered `/admin` layout). Because
   sessions are looked up server-side rather than just decoded, revoking
   one is a single `DELETE` — no waiting for a JWT to expire.
4. **Logout deletes the session row**, not just the cookie
   (`app/api/auth/logout/route.ts`) — so a stolen cookie stops working
   the moment the real user logs out, not just when it happens to expire.
5. **`/admin` is a server component tree** (`app/admin/layout.tsx`): it
   checks the session on the server and redirects to `/login` before any
   admin markup or data is sent to the browser — there's no client-side
   flash of protected content.
6. **Login attempts are lightly throttled** per IP+email (in-memory, per
   server instance) to blunt naive brute-forcing. Noted as a known
   limitation below — swap for Upstash or similar for a real deployment
   with multiple server instances.

No admin credentials are hardcoded anywhere in the repo or `.env.example`.
The **only** way to create an admin account is the CLI script below, which
you run with credentials of your choosing.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and DIRECT_URL
npx prisma db push            # creates Lead, AdminUser, Session tables
npm run create-admin -- you@example.com "a strong password"
npm run dev
```

Visit `http://localhost:3000` for the form, and `http://localhost:3000/admin`
for the dashboard — you'll be redirected to `/login` and prompted for the
credentials you just created.

You need a Postgres database even for local dev — the free Supabase
project below works for this too, or run Postgres locally:
`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres`.

---

## 2. Get a free database (Supabase)

1. [supabase.com](https://supabase.com) → New project (free tier).
2. **Project Settings → Database → Connection string**: copy the pooled
   URI (port 6543) into `DATABASE_URL`, and the direct one (port 5432)
   into `DIRECT_URL`.
3. `npx prisma db push` once, pointed at this database.

*(Any Postgres works — Neon, Railway, RDS, etc.)*

---

## 3. Push to GitHub

```bash
git init && git add . && git commit -m "LeadDesk Mini: real auth"
gh repo create leaddesk-mini --public --source=. --push
```

Without the `gh` CLI: create an empty repo at
[github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/<your-username>/leaddesk-mini.git
git branch -M main
git push -u origin main
```

---

## 4. Deploy to Vercel (free)

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. Add environment variables: `DATABASE_URL`, `DIRECT_URL`.
3. Deploy. `postinstall` runs `prisma generate` automatically.
4. **Create your admin account against the live database** — run this
   locally with your production `DATABASE_URL`/`DIRECT_URL` in `.env`:
   ```bash
   npm run create-admin -- you@example.com "a strong password"
   ```
5. Visit `https://<your-app>.vercel.app` (form) and `/admin` (dashboard,
   will prompt for the login you just created) — from a fresh/incognito
   browser window, this should work with zero local state, since
   everything (the account, the session, the leads) lives in Postgres.

---

## Verifying it from a clean browser

1. Open an incognito window, go to the deployed `/` URL, submit a test lead.
2. Go to the deployed `/admin` URL — you'll land on `/login`.
3. Sign in with the credentials from `create-admin`.
4. Confirm the test lead appears, search for it, and change its status —
   refresh the page to confirm the change persisted (it's read from
   Postgres on every load, not cached client state).
5. Click **Sign out**, then try loading `/admin` directly again — you
   should be bounced back to `/login`, confirming the session was
   actually revoked server-side rather than just hidden client-side.

---

## Known limitations / next hardening steps

- **Rate limiting** on login and the public form is in-memory and
  per-instance — fine for a single small deployment, not sufficient
  against a determined attacker on a multi-instance deploy. Swap in
  Upstash Ratelimit or Vercel's built-in protection for real traffic.
- **No password reset flow** — resetting is currently "re-run
  `create-admin` with the same email," which overwrites the password.
  Fine for one or two admins; add an email-based reset flow for more.
- **No audit log** of who changed a lead's status — worth adding
  (`updatedBy` on `Lead`) if more than one admin will use this.
- **No email notifications** on new leads — the `POST` handler in
  `app/api/leads/route.ts` is the place to wire in Resend or similar.
