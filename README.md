# SnackHub

Delivery for Indian regional snacks from verified local shops: "Estimated delivery in 25 to 30
minutes, subject to serviceability and preparation time." Four roles (customer, seller,
rider, admin), each with its own screens. All shops, people, prices and pictures in this
repository are demo data.

## What is in here

| Folder | What it is |
| --- | --- |
| `frontend/` | React 19 + Redux Toolkit + Tailwind CSS v4 app (customer, seller, rider) and the admin console as a separate build. Runs today on a mock API in the browser. See [frontend/README.md](frontend/README.md) |
| `backend/` | Express modular monolith on MySQL 8: Identity, Catalog, Order, Dispatch, Payment and Notify, each with its own schema and database user |
| `shared/` | Business rules used by both the frontend and the backend (delivery promise, rider pay, order states, complaint triage) and the demo seed data |
| `infra/` | Docker Compose for the full local stack (MySQL, Redis, RabbitMQ, Elasticsearch, MinIO, Mailpit), for later phases |
| `scripts/` | Repository setup helpers |

## First run

Needs Node.js 20.6 or newer and MySQL 8 running on this machine (port 3306).

```bash
npm run setup
```

Creates `infra/.env` and `backend/.env` with random local passwords. Nothing is printed and an
existing file is never overwritten.

```bash
npm run db:local
```

Asks once for your MySQL root password (shown as `*`, never stored), then creates the six
module schemas, one user per module that can only reach its own schema, and the migrator user.

```bash
npm --prefix backend install
npm --prefix frontend install
npm run migrate
npm run seed
```

Creates every table, then loads the demo data. Both are safe to run again.

## Google sign-in

Customers sign in with Google (doc 16.1). Google's button gives the browser an ID token; the
backend checks it with your **Web client ID** and then issues SnackHub's own tokens. No client
secret is used anywhere. Until a client ID is set, the sign-in page uses a demo customer.

**1. Create the client in Google Cloud** (free):

1. Open https://console.cloud.google.com and create a project, for example `SnackHub`.
2. Go to **APIs & Services → OAuth consent screen** (newer consoles call it **Google Auth
   Platform**: fill in **Branding**, then **Audience**):
   - App name `SnackHub`, your email as the support and developer contact.
   - User type / audience **External**, publishing status **Testing**.
   - Under **Test users**, add the Gmail addresses that may sign in while you build.
   - Scopes: nothing to add. Sign-in uses only `openid`, `email` and `profile`.
3. Go to **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) and choose
   **Create credentials → OAuth client ID**:
   - Application type **Web application**, name `SnackHub web (local)`.
   - **Authorised JavaScript origins**: `http://localhost:5173` and `http://localhost:5175`
     (add your Netlify address when you deploy). No trailing slash, no path.
   - **Authorised redirect URIs**: leave empty. The popup sign-in does not use one.
4. Click **Create** and copy the **Client ID**. It ends in `.apps.googleusercontent.com`.
   You do not need the client secret; do not put it anywhere in this project.

**2. Put the client ID in two files** (both are ignored by git):

```bash
npm run setup
```

This adds `JWT_SECRET` (random), an empty `GOOGLE_CLIENT_ID=` line and `COOKIE_SECURE=false`
to `backend/.env` without touching the keys already there. Then:

- `backend/.env`: set `GOOGLE_CLIENT_ID=` to your client ID.
- `frontend/.env.local` (copy `frontend/.env.example`): set `VITE_GOOGLE_CLIENT_ID=` to the
  same client ID.

**3. Run both and sign in:**

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Open http://localhost:5173/signin, keep **Customer** selected and click Google's button. The
first sign-in creates a customer account in MySQL (`identity.users`). Restart both after
changing an env file.

How the session works: the access token lasts 15 minutes and lives only in memory. The
refresh token is an `httpOnly`, `SameSite=Strict` cookie, stored in MySQL only as a hash,
one per device, and replaced on every use. If an old one is ever used again, every session
from that sign-in ends. Seller, rider and admin accounts never come from Google: sellers and
riders are approved applications, and admins sign in on the admin console with a second factor.

## How the code is organised

```
backend/
  src/
    config/        env.js (settings checked at start), database.js (schemas, users, pool options)
    db/            connection.js, ddl.js, migrations/, seeds/demo.js
    models/        one file per table, named after it, by module: identity/user.js, catalog/product.js, ...
    controllers/   request handlers, one file per area: health, auth, me, catalog
    routes/        URL to controller, one file per area (zod-checked input); index.js mounts them all
    middleware/    request id and logging, 404, error envelope
    utils/         logger.js, AppError.js
    app.js, server.js
  scripts/         migrate.js, seed.js, local-db-init.js
  tests/
frontend/
  src/
    pages/         customer/, seller/ (Console, Orders, Products, Shop), rider/ (Console, Today, Earnings), auth/, common/
    components/    ui/ (primitives, Carousel, SnackImage), layout/ (Navbar, Footer, Customer, Console),
                   cart/ (Drawer, Prompts), product/ (Card, Modal), payment/, tracking/,
                   landing/ (one file per section: Hero, Regions, Bestsellers, Delivery, Moods, Stories, ...)
    routes/        Guards.jsx (sign-in and role checks)
    store/         index.jsx, apiThunk.jsx, slices/ (auth.jsx, cart.jsx, order.jsx, ...)
    services/      api.jsx
    hooks/         index.jsx (motion, visibility, polling), useCatalog.jsx, useTracking.jsx
    utils/  constants/  assets/ (ready.json)  styles/  mocks/  admin/ (App.jsx, store.jsx, pages/)
shared/            domain/ (business rules), seed/ (demo data)
```

## Everyday commands

From the repository root:

| Command | Does |
| --- | --- |
| `npm run dev:frontend` | Frontend on http://localhost:5173 (catalog and sign-in from the backend when it runs, the rest from the mock) |
| `npm run dev:backend` | Backend on http://localhost:4000 (`/health`, `/ready`) |
| `npm run migrate` / `npm run migrate:down` | Apply every migration / undo all of them |
| `npm run seed` | Reload the demo data (same result every time) |
| `npm test` | Backend tests: platform, seed data, models, and database constraints against MySQL |
| `npm run build` | Production build of the frontend and the admin console |

## Database rules worth knowing

- Money is stored as integer paise; latitude and longitude as plain DECIMAL columns.
- Stock can never go below zero, and two buyers racing for the last units get exactly one winner.
- The same Idempotency-Key from one customer can never create two orders.
- Each payment webhook event is processed once; the payment ledger can only be added to.
- Foreign keys stay inside a module; references to another module's rows are plain ids.

## Status

- Phase 1, the frontend on a mock API: done.
- Phase 2, the backend: the database (migrations, seed, constraint tests) is done, Google
  sign-in with sessions (`/api/v1/auth/google`, `/refresh`, `/logout`, `/me`) works, and the
  catalog (`/cities`, `/sellers`, `/sellers/:id`, `/products`, `/search`) is served from MySQL.
  With the backend running, the frontend shows the catalog from MySQL; cart, orders and the
  seller, rider and admin screens still use the mock. Seller and rider applications, admin
  approvals and admin MFA come next, then cart and checkout.
- 19 of 54 snacks have their own AI image so far; the rest show a drawing until theirs is made
  (`npm --prefix frontend run assets:generate` makes more each day on the free Hugging Face quota).
