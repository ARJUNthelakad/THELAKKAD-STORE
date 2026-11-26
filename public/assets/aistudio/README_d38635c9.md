# Thelakkad Store — Vercel deployment

A Vite + React + TypeScript storefront (with checkout, auth, email verification, password reset, and an admin dashboard) deployed to Vercel, backed by a Postgres database via the Neon serverless driver.

## Stack

- Frontend: Vite + React 19 + React Router 8 + Tailwind 4, built to `dist/client`
- Backend: Vercel Serverless Functions in `api/*.ts`, using the Neon serverless driver (`@neondatabase/serverless`) through a small `src/db/index.ts` adapter that mimics the Cloudflare D1 `prepare().bind()` contract so the same route logic runs on Vercel.
- Auth: staff accounts with PBKDF2-SHA256 (120k iterations) + per-account salt, HttpOnly SameSite=Strict session cookie `xelqx_session` (7-day expiry).
- Email: Resend transactional API (`RESEND_API_KEY`, `MAIL_FROM`).
- DB: Postgres (Neon). Schema in `src/db/schema.ts`, driven by drizzle-orm (`drizzle-kit`).

## Local development (VS Code)

Requires Node 20 or newer. From the project folder:

```sh
npm install
cp .env.example .env.local    # then set DATABASE_URL (mail keys optional)
npm run dev                   # http://localhost:5173
```

`npm run dev` serves the storefront **and** the real `api/*.ts` handlers on the
same origin: `plugins/dev-api.ts` runs them through a Vite middleware using the
same adapter Vercel uses (`src/server/vercel.ts`), and Vite loads `.env.local`
into `process.env` for them. No Vercel CLI or Cloudflare tooling is needed.

### Neon setup

This project is linked to a Neon production branch. After authenticating with
the Neon CLI, `neon deploy` applies the services declared in `neon.ts` and
pulls their environment variables into `.env.local`. Keep that file private
and do not commit it. The app uses the pooled `DATABASE_URL` for requests;
Drizzle uses `DATABASE_URL_UNPOOLED` for schema changes.

Create or update the database tables from `src/db/schema.ts`:

```sh
npm run db:push        # drizzle-kit push: create/update tables from src/db/schema.ts
npm run db:generate    # optional: write SQL migrations instead
npm run db:migrate     # optional: apply generated migrations
```

The Neon AI Gateway is provisioned, but model calls require AI Gateway credits
on the Neon organization. Neon Auth is enabled on the branch; the storefront
continues to use its existing staff-auth routes and Postgres-backed sessions.

Then open <http://localhost:5173/admin>. With no staff rows in the database the
dashboard shows first-run setup, which creates the first admin account.

Mail is optional locally: without `RESEND_API_KEY`, verification and password
reset links are printed in the terminal running `npm run dev` and the dashboard
offers them as copyable links.

Useful per-route checks while the dev server runs:

```sh
curl http://localhost:5173/api/store
curl http://localhost:5173/api/auth/status
```

To run the exact Vercel runtime locally instead (Node functions, `vercel.json`
rewrites), build first and use the CLI:

```sh
npm run build
npx vercel dev        # needs `npx vercel login` once, port 3000
```

## Environment variables

Set these in the Vercel project settings (Settings → Environment Variables), not committed:

- `DATABASE_URL` — Postgres connection string (Neon). Set for Production, Preview, and Development.
- `RESEND_API_KEY` — Resend API key (Secret).
- `MAIL_FROM` — sender address, e.g. `XELQX <you@yourdomain.com>`.
- `NODE_ENV` — set automatically by Vercel.

Never prefix database or mail keys with `VITE_`; that would expose them to browser code.

## Database schema

Tables (defined in `src/db/schema.ts`), managed with drizzle-kit:

- `product_overrides` — live price/stock edits from the admin
- `custom_products` — products added in the admin, including descriptions, images, options, SKU and starting stock
- `orders` — placed orders (reference, totals, items as JSON, status, payment, coupon)
- `coupons` — discount codes (percent / flat / shipping), with `is_custom` flag
- `settings` — store name, support email, low-stock threshold
- `staff` — staff accounts, passwords hashed, email verification + password-reset tokens
- `sessions` — session tokens

Migrations:

```sh
bunx drizzle-kit generate        # generate migrations from src/db/schema.ts
bunx drizzle-kit migrate         # apply migrations to the connected DB
```

On first deploy, apply the schema (drizzle-kit migrate using the same `DATABASE_URL`) so the API routes have tables to talk to. For ad-hoc changes you can also connect any Postgres client with the `DATABASE_URL`.

In the admin dashboard, open **Products → Add product** to create a database-backed listing. Add 1–8 JPEG, PNG, or WebP photos (up to 4 MB each) and optionally 1–2 MP4 or WebM videos (up to 100 MB each). The first photo is the cover image; all media appears in the product detail gallery. Media is public so shoppers can view it. Files upload directly to the public-read `product-images` Neon Object Storage bucket through short-lived, size-limited upload forms, rather than passing large video bodies through the app server.

Provision the bucket with `neon buckets create product-images --access-level public_read` and pull its local credentials with `neon env pull`. The bucket's CORS rules must allow browser POSTs from the storefront origin. For Vercel deployments, configure the AWS storage variables as server-side environment variables; never expose or commit them.

## API routes

Public:

- `GET /api/store` — live product overrides, custom products, categories, coupons and settings (used at boot)
- `POST /api/orders` — place an order (returns reference + subtotal/discount/shipping/total + items)
- `GET /api/orders/:reference` — public order lookup (masked email)

Auth:

- `GET /api/auth/status` — session + whether setup is needed
- `POST /api/auth/setup` — first-admin creation (only when no staff exist)
- `POST /api/auth/login` — email + password login, sets session cookie
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verify` `{ token }` — email verification link
- `POST /api/auth/forgot` `{ email }` — password-reset link (generic response, same whether or not the address exists)
- `POST /api/auth/reset` `{ token, password }` — set new password (also marks email verified, since the link proves inbox control)
- `POST /api/auth/resend` `{ email }` — resend verification link

Admin (requires staff session; most require admin role):

- `GET /api/admin/staff`, `POST /api/admin/staff`, `DELETE /api/admin/staff/:id`, `POST /api/admin/staff/:id/verification`
- `POST /api/admin/password` — change own password (also rotates the session cookie)
- `GET /api/admin/orders`, `PATCH /api/admin/orders/:reference`
- `GET /api/admin/categories`, `POST /api/admin/categories`, `PUT /api/admin/categories/:key`, `DELETE /api/admin/categories/:key`
- `POST /api/admin/products/media-uploads` — issue short-lived upload forms for product media
- `POST /api/admin/products` — save a product and its uploaded media
- `POST /api/admin/products/media-cleanup` — remove partial uploads after a failed transfer
- `PUT /api/admin/products/:slug` — edit product details and media
- `PATCH /api/admin/products/:slug` — update inline price or stock
- `PATCH /api/admin/products/:slug/archive` — archive or restore a product without removing order history
- `DELETE /api/admin/products/:slug` — reset inline price and stock overrides
- `GET /api/admin/coupons`, `POST /api/admin/coupons`, `DELETE /api/admin/coupons/:code`
- `GET /api/admin/settings`, `PUT /api/admin/settings`
- `POST /api/admin/mail-test` — send a test mail (admin only) to confirm mail setup

Product categories are stored in the `categories` table and seeded with the storefront's default categories by the migration. Category deletion is rejected while any product uses the category. Product archiving hides an item from the storefront and checkout while retaining its catalog record and historical order lines.

All API routes are Vercel serverless functions. Admin routes gate on `sign in to continue`; most also require `admin` role.

## Deployment steps

1. Push this repo to a Git provider linked to your Vercel account, or link the local directory with `vc link`.
2. Connect a Postgres provider:
   - Install a Postgres integration from the Vercel Marketplace (Neon is the natural choice here). This provisions a database and injects `DATABASE_URL` into your project’s environment variables.
   - Or create a Neon project manually, copy its connection string, and add it as `DATABASE_URL` in Vercel Settings → Environment Variables for Production, Preview, and Development.
3. Add `RESEND_API_KEY` (Secret) and `MAIL_FROM` in Vercel Settings → Environment Variables.
4. Deploy (Vercel auto-detects Vite; build command is `bun run build`, output dir `dist/client`).
5. After the first deploy, apply the schema: connect with the same `DATABASE_URL` and run `bunx drizzle-kit migrate`, or run `vc dev` locally and run a one-off migration script pointed at that DB.
6. Visit the production/preview URL, open `/admin`, and run first-run setup to create the first admin account.

`vercel.json` rewrites all non-API paths to `index.html` for SPA deep linking; `/api/*` paths are served by functions first and are excluded from that rewrite.

## Mail sending

Staff verification and password-reset links are sent via Resend. Without `RESEND_API_KEY`, the functions log the link instead and the admin UI shows a copyable invite, so the flow is testable without mail configured. Until a sending domain is verified in Resend, the default `onboarding@resend.dev` sender only delivers to the address on the Resend account. The admin Settings page has a “Send test email” button that reports the provider’s own error when something is wrong (bad key, unverified domain), rather than failing silently.

## Quirks / limitations

- In-memory attempt maps for login lockout, password-reset throttle, and verification resend throttle live only inside a single function invocation on Vercel. On Workers those maps are shared across requests. If throttling matters in production, move them into Postgres rows (cheap to add later).
- Session cookies set by Vercel functions work for the same origin; the `Secure` flag is on whenever `VERCEL_URL` is set (production/previews), which is right for Vercel.
- The `@cloudflare/vite-plugin` and `wrangler` are still in `devDependencies` because the Worker source (`src/worker/index.ts`) is kept as the canonical source for route logic; they are not required for the Vercel build, which uses `api/*.ts` and `src/db/schema.ts`.
