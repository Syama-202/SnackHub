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

## How the code is organised

```
backend/
  src/
    config/        env.js (settings checked at start), database.js (schemas, users, pool options)
    db/            connection.js, ddl.js, migrations/, seeds/demo.js
    models/        one file per table, named after it, by module: identity/user.js, catalog/product.js, ...
    controllers/   request handlers, one file per area, e.g. health.js
    routes/        URL to controller, one file per area, e.g. health.js; index.js mounts them all
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
    store/         index.js, apiThunk.js, slices/ (auth.js, cart.js, order.js, ...)
    services/      api.js
    hooks/         index.js (motion, visibility, polling), useCatalog.js, useTracking.js
    utils/  constants/  assets/ (ready.json)  styles/  mocks/  admin/ (App.jsx, store.js, pages/)
shared/            domain/ (business rules), seed/ (demo data)
```

## Everyday commands

From the repository root:

| Command | Does |
| --- | --- |
| `npm run dev:frontend` | Frontend on http://localhost:5173 (mock API) |
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
- Phase 2, the backend: the database (migrations, seed, constraint tests) is done; the module
  APIs come next.
- 11 of 54 snacks have their own AI image so far; the rest show a drawing until theirs is made.
