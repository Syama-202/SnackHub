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

```bash
npm run redis:up
```

Starts SnackHub's own Redis in Docker on `127.0.0.1:6380` (6380, so it never meets another
project's Redis on 6379), with its data kept on disk. The backend uses it for rate limits and
live updates; without it everything still works, each process on its own.

## Accounts, sign-up and verification

Each public role has its own sign-up and sign-in page, and a token from one portal never opens
another. One account (one email) can hold several roles; staff use the admin console only.

| Who | Sign up | Sign in | After that |
| --- | --- | --- | --- |
| Customer | `/customer/signup` | `/customer/signin` (password, or Google) | Orders snacks |
| Seller | `/seller/signup` | `/seller/signin` (password + authenticator, always) | `/seller/onboarding`, then the console once approved |
| Delivery partner | `/rider/signup` | `/rider/signin` (password, authenticator optional) | `/rider/onboarding`, then the rider app once approved |
| Admin or reviewer | no sign-up (`npm run create-admin`) | the admin console (Google + authenticator, always) | Verification queue |

`/join` shows all four. A new account must confirm its email before it can sign in.

**Emails in development.** The backend sends mail with nodemailer. Without SMTP settings, in
development every message is saved as an `.eml` file in `backend/storage/mail` (git-ignored):
open the newest one in any mail app (or a text editor) to click the confirmation or reset link.
Text messages for mobile verification are saved there too. To send for real, set `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` in `backend/.env` (see `backend/.env.example`);
production needs them, and real texts need `SMS_PROVIDER=twilio` with the Twilio keys.

**Passwords and sessions.** Passwords are hashed with Argon2id and checked against a list of
common passwords (and Have I Been Pwned with `PASSWORD_BREACH_CHECK=true`). Five wrong
passwords lock the account for 15 minutes, and sign-in, sign-up and code entry are rate-limited.
Reset links work once and expire in 30 minutes; a reset signs out every device. Answers never
say whether an email has an account. `/account/security` lists sessions (sign out one or all),
changes the password, turns the authenticator on, makes new recovery codes and verifies a
mobile number.

**Two-step sign-in.** Admins, reviewers and sellers must use an authenticator app
(`MFA_REQUIRED_ROLES`); customers and riders may. After the right password comes a challenge
that lasts five minutes, works once and only on that device; the session opens only after the
code. A code works once, five wrong codes lock the factor for 15 minutes, and ten single-use
recovery codes (stored hashed, shown once) cover a lost phone. Secrets are encrypted with
`MFA_KEY`.

**Seller and rider verification.** The onboarding pages save as you go. Sellers give the
business, pickup point and hours, and the settlement account; riders give their details,
address and vehicle. The documents asked for depend on the answers: a company also needs GST
and business registration, and a bicycle rider never needs a licence, RC, insurance or PUC.
Admins change these rules per business type, vehicle and state in the console
(**Requirements**). Uploads are checked by their bytes (PDF, JPEG, PNG or WebP, up to 5 MB),
scanned by ClamAV when `CLAMAV_HOST` is set, and stored in `backend/storage/private` under random
names, outside every public folder; they open only through five-minute signed links, and every
view is logged. Document numbers and bank accounts are stored encrypted and shown masked.

Applications move `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED`, with `ACTION_REQUIRED`,
`REJECTED` and `SUSPENDED`; the server allows only those moves. Nothing is approved
automatically: a reviewer approves each document and ticks the checks, and approving, rejecting
and suspending ask for a fresh authenticator code. Every step is kept in an append-only history
and the audit log, and the applicant gets an email. Until approved, a seller cannot publish
snacks and a rider cannot go online. A daily job reminds people 30, 7 and 1 days before a
document expires; once a required one has expired, the shop disappears from listings and the
rider is taken offline until the renewal is approved.

## Google sign-in

Customers can also sign in with Google (doc 16.1). Google's button gives the browser an ID
token; the backend checks it with your **Web client ID** and then issues SnackHub's own tokens.
No client secret is used anywhere. Until a client ID is set, the button is hidden.

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
   - **Authorised JavaScript origins**: `http://localhost:5180` and `http://localhost:5181`
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

Open http://localhost:5180/customer/signin and click Google's button. The first sign-in
creates a customer account in MySQL (`identity.users`); an existing account with the same
verified email is linked instead. Restart both after changing an env file.

How the session works: the access token lasts 15 minutes and lives only in memory. The
refresh token is an `httpOnly`, `SameSite=Strict` cookie, stored in MySQL only as a hash,
one per device, and replaced on every use. If an old one is ever used again, every session
from that sign-in ends. Google signs in to the customer portal only; sellers and riders use
their own portals, and staff the admin console.

## Admin console sign-in

Staff sign in with Google and then a code from an authenticator app (doc 16.3). Admins can do
everything; reviewers (the verification team) see only the verification queue and expiring
documents. There is no staff sign-up; the server owner makes them from the command line:

```bash
npm run create-admin -- --email you@gmail.com --name "Your name"
```

Add `--role reviewer` for a reviewer.
It prints a one-time link (valid 15 minutes). Open it, scan the QR code with Google
Authenticator, Microsoft Authenticator or any TOTP app, type the first code, and save the ten
recovery codes it shows once. Then run `npm run dev:admin`, open http://localhost:5181,
continue with Google and enter the code from the app. Lost phone: run the same command with
`--reset-mfa`. Admins can also reset a customer's, seller's or rider's authenticator from
**Accounts** after checking who they are.
In Windows PowerShell, npm drops the flags, so write them as plain words:
`npm run create-admin -- you@gmail.com "Your name"` (add `reset-mfa` for a lost phone).

Rules the backend enforces: admin routes answer 404 off the admin host; the Google step gives
only a half-session; a code works once; five wrong codes lock the account for 15 minutes and
alert the other admins; staff tokens last 10 minutes and a session at most 8 hours; decisions,
suspensions, requirement changes and revealing a document number need a code from the last 5
minutes (the console asks again). "Use the demo admin instead" keeps the in-browser demo (code
`246810`); the verification queue needs a real staff sign-in.

## Ordering

With real accounts the whole order runs on MySQL. An approved seller adds snacks in the
console (**Products**: add, edit, stock adjustments with a reason, list or hide), and the
shop appears to customers in range. The customer fills the cart (one shop per cart), checks
out with pay on delivery, and follows the order. The seller has 2 minutes to accept, then
packs; an approved, online rider nearby gets a 20-second offer, collects the sealed package
and rides. The customer's 4-digit delivery code shows only once the rider is within 500 m,
and the rider can enter it only inside 150 m; three wrong codes lock it and alert an admin.
The rider records the cash collected and the pay for the delivery is written. Every change
goes through `canTransition()`, and each step puts a message in the person's inbox
(**Notifications**, never containing the code). Sellers and riders have their own inbox behind
the bell in the console, showing only their portal's messages; a new shop sees a "Get your
shop ready" card on its board (add a snack, stock it, list it, open the shop) until it can
take orders.

- Prices, fees and the delivery promise are recomputed on the server at checkout; stock is
  held all-or-nothing, and one Idempotency-Key makes one order however often it is sent.
- Nobody reaches another person's order, shop board or delivery: ids are always checked
  against the account in the token.
- The seeded demo shops and riders take no real orders; the one-tap demo account keeps the
  simulated shop and rider in the browser, and pays on delivery only.
- Online payment: PhonePe Standard Checkout, sandbox only (the code has no production
  address). With PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET set (backend/.env.example),
  checkout offers "Pay online": the order waits as PENDING_PAYMENT with its stock held and the
  customer pays on PhonePe's page (any UPI app, UPI QR or card; no PIN or card number reaches
  SnackHub). The order goes to the shop only when PhonePe's order-status API says paid for
  the exact amount, asked after the return from the pay page, after a webhook (checked
  against the dashboard credentials, de-duplicated), and by a timer for lost ones. Failed or
  abandoned payments cancel the order and return the stock; money for an order that will not
  be delivered (cancelled, rejected, paid late, wrong amount) is refunded automatically, never
  more than was paid. Cash on delivery is recorded the same way, and every charge and refund
  is a row in the append-only ledger. Without keys, checkout offers pay on delivery only.
- Riders share their phone's location while online, and the customer, the rider and the
  admin console follow it on a real map (MapLibre with free OpenFreeMap tiles from
  OpenStreetMap data, no key): shop, drop point and the rider's last GPS fix, with a straight
  dashed line for the leg left (direct distance, not a road route). Only the one-tap demo
  has a "Simulate drive" button; to test a real rider account on a computer, set a location
  in Chrome DevTools > More tools > Sensors and change it as the rider "moves".
- Shops span 28 demo cities. Guests pick a city or share their location from "Deliver to"
  (kept in this browser); signed-in customers order to any saved address.
- Cash in hand: a rider's pay-on-delivery cash is what they recorded at the door minus what
  they handed in. Staff record deposits on the admin Cash in hand page (never more than the
  rider holds, with a recent second factor; append only, a mistake is reversed). At the
  policy's cash limit (Rs 2,000 by default) a rider gets no new pay-on-delivery offers until
  they deposit; prepaid orders still reach them. The rider sees it on the Earnings page.
- Seller payouts: a shop is owed the food value of its delivered orders, less SnackHub's
  commission (10% by default) and applied fines, once each order's 24-hour complaint window
  has passed; a fine reversed after it was deducted is given back on the next statement.
  Admins draft a statement on the Seller payouts page, make the bank transfer, then record its
  reference (or cancel, which frees the orders). Each order and fine can be on one statement
  only, enforced by MySQL. Sellers see what is due, when the next order becomes payable, and
  their statements on the Payouts tab. No money moves through SnackHub: it records transfers.
- Shared catalogue: one entry per snack (name, kind, pack size, spice, picture) that any shop
  sells at its own price. Sellers add snacks with **Add a snack**: search the catalogue, see
  what shops in their city charge, set their price, MRP, prep time and description. The
  entry's name and details are the same at every shop and cannot be changed from a shop; a
  shop can still add a recipe of its own. Admins keep the entries on the Catalogue page: an
  edit reaches every shop's copy (prices stay the shops'), a retired entry leaves the picker,
  and a shop's own recipe can be linked to an entry. A shop sells each entry once, enforced by
  MySQL. On a snack, customers see the other open shops near them that sell it, cheapest first
  (`/catalogue/:id/offers`).
- Push notifications: customers, sellers and riders can turn on alerts for a device on their
  Notifications page. Every new inbox message is then also shown on that phone or computer
  (Web Push, even when SnackHub is closed), and tapping it opens the order, the board or the
  payouts. Alerts follow the portal (a seller's phone gets shop messages only) and the sign-in:
  signing out of that device, "sign out other devices" or a password reset stops them. The
  server sends only to the browsers' own push services. To switch it on, run
  `npx web-push generate-vapid-keys` and put the two keys in `backend/.env` as
  `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, then restart the API. Push needs https (or
  localhost); on iPhone, SnackHub must first be added to the home screen.
- Error monitoring: crashes in the API (every 500), the background jobs and both websites are
  kept in MySQL, one row per cause with a count, first and last seen, the route or page, the
  latest stack and request id, and the release (`RELEASE`, and `VITE_RELEASE` for the sites).
  Emails, phone numbers, codes, tokens, long ids and query strings are removed before anything
  is stored, and a database error keeps MySQL's message without the SQL or its values. Admins
  read them on the Errors page and mark each resolved or ignored; a new error, or a resolved
  one that comes back, emails the admins (at most once an hour each). Browsers report through
  `POST /client-errors`, limited per address, once per error per page load.
- Favourites are saved to the customer's account (the heart on every snack, and a Favourites
  page), and "Order again" on a finished order refills the cart at today's prices, naming
  anything sold out or off the menu.
- CI (.github/workflows/ci.yml): on every push to main and every pull request, the backend
  tests run against MySQL 8.4 and Redis service containers, and both frontend builds run.
- Opening hours: a seller sets each day's hours in India time (up to two windows, such as
  7 to 11 am and 4 to 10 pm), holidays, and optionally the pincodes they deliver to on top of
  their radius. Closed shops stay visible with when they open next, but their snacks leave
  the lists and search, and nothing can be added or ordered until they open. A shop that
  lists pincodes takes orders only for addresses with one of them.
- Saved addresses (up to 10): home, hostel, college, office or a named place, with flat,
  floor, landmark and instructions for the rider, and one default that checkout picks first.
  The pin is set by place search (OpenStreetMap Nominatim through the API, one request a
  second, set GEOCODER_URL for production), the phone's location, or dragging it on the map.
  Each order keeps its own copy of the address, and a database trigger stops it changing,
  so editing or deleting a saved address never moves an order. Riders see the area before
  pickup and the door, floor and instructions after.
- Problems after delivery: the customer reports within 2 hours (food, with 1 to 3 photos) or
  24 hours (anything else), once per kind. The order's own timeline is attached as evidence
  and the shared triage rules decide: a confident, small, safe case is resolved at once with
  app credit (used on the next pay-on-delivery order, returned if that order is cancelled);
  the rest wait in the admin console's **Complaints**, where an admin adds credit or fines
  with a fresh code. Unsafe food hides the shop at once. Photos are private and open only
  through five-minute links.
- A rider can dispute a lateness cut within 48 hours with a reason; an admin gives it back or
  keeps it. **Delivery policy** changes become a new version for later orders only.
- The clocks (shop timeout, offer expiry, finding a rider) run every 5 seconds in the API
  (`RUN_JOBS`), or once per `npm run jobs`.

## Live updates and rate limits

Every page that follows something live listens on Socket.IO (`/api/v1/socket`, same origin
through the dev proxy). A new order reaches the seller's board and the admin's live board,
an offer reaches the rider, and a status change, the rider moving or a new message reaches the
customer, all within a fraction of a second. The socket carries hints only, `{ id, topic,
orderId }`; the page then reads the change over the normal REST route, so no order details,
address or delivery code ever travel on it.

- A connection needs the same signed access token as the API, an active account and role,
  two-step sign-in where the role needs it, and the admin host for the staff rooms. Rooms come
  from the token alone (one per person and portal, plus `ops` and `complaints` for staff with
  those permissions); a request to join any other room is ignored, and a client that keeps
  sending is dropped. A socket closes when its token expires or the account is suspended.
- The app reconnects by itself (after a refresh of the token when the server closed it), and
  ignores an event it has already seen. While the socket is down every page polls at its
  usual pace; while it is up, polling slows to a 30-second safety net. Demo sessions have no
  socket and keep polling the mock.
- Every route has a rate limit, counted in Redis so all API processes share it: per address
  for public reads, sign-in and sign-up, per account for everything behind a token, with the
  tightest limits on sign-in, codes, checkout, cancelling and admin decisions, and a cap on all
  `/api/v1` requests per address (`RATE_LIMIT_IP_PER_MIN`, 600 a minute). Sign-in also counts
  per email, so a new IP address does not reset the tries on an account. Keys are hashed, so no
  email or address is stored. A refused request gets `429 RATE_LIMITED` with `Retry-After`,
  the same seconds in `error.details.retryAfter`, and `RateLimit-*` headers.
- If Redis goes away, even before the API starts, requests never wait on it and nothing
  crashes: each process keeps counting on its own and live updates reach the sockets on that
  process, until Redis is back. Production refuses to
  start without `REDIS_URL`.

## How the code is organised

```
backend/
  src/
    config/        env.js (settings checked at start), database.js (schemas, users, pool options)
    db/            connection.js, ddl.js, migrations/, seeds/demo.js
    models/        one file per table, named after it, by module: identity/user.js, catalog/product.js, ...
    controllers/   request handlers, one file per area: auth, security, adminAuth, onboarding, cart,
                   orders, shop, delivery, addresses, notifications, complaints, operations,
                   verification, adminUsers, files, me, catalog, health
    routes/        URL to controller, one file per area (zod-checked input); index.js mounts them all
    middleware/    auth (roles, permissions, fresh MFA), rate limits, uploads, logging, errors
    utils/         passwords, keys, tokens, sessions, secondFactor, storage, fileCheck, mailer,
                   redis, rateLimit (shared counters), realtime (live hints), ...
    jobs/          outboxRelay.js (emails, texts, inbox), orderTimers.js, documentExpiry.js
    app.js, server.js, socket.js (Socket.IO on the API server)
  scripts/         migrate.js, seed.js, local-db-init.js, create-admin.js, jobs.js
  storage/         private uploads and development emails (git-ignored)
  tests/
frontend/
  src/
    pages/         customer/, seller/ (Console, Onboarding, Approved, ...), rider/ (Console, Onboarding, Approved, ...),
                   auth/ (Join, SignUp, SignIn, VerifyEmail, ForgotPassword, ResetPassword), common/ (Security, ...)
    components/    ui/ (primitives, Carousel, SnackImage), layout/ (Navbar, Footer, Customer, Console),
                   cart/ (Drawer, Prompts), product/ (Card, Modal), payment/, tracking/,
                   auth/ (Shell, Fields, Mfa, RecoveryCodes), onboarding/ (Wizard, Stepper, DocumentCard, StatusPanel),
                   landing/ (one file per section: Hero, Regions, Bestsellers, Delivery, Moods, Stories, ...)
    routes/        Guards.jsx (sign-in and role checks)
    store/         index.jsx, apiThunk.jsx, slices/ (auth.jsx, cart.jsx, order.jsx, ...)
    services/      api.jsx, realtime.jsx (the live-update socket)
    hooks/         index.jsx (motion, visibility, polling with live topics, useRealtime), useCatalog.jsx, useTracking.jsx
    utils/  constants/  assets/ (ready.json)  styles/  mocks/  admin/ (App.jsx, store.jsx, pages/)
shared/            domain/ (business rules: permissions, verification, documents, eligibility, passwords, ...), seed/ (demo data)
```

## API docs

With the API running, open http://localhost:4000/api/docs for Swagger UI, or fetch the OpenAPI
3.1 document from `/api/v1/openapi.json`. It is built from the routers themselves: every route,
its zod schemas (body, query and path), whether it needs a sign-in, which permission, the admin
host or a recent second factor, and its rate limits. So it cannot drift from the code, and a
test fails if a write route has no body schema (apart from a short reviewed list that takes
none). Summaries come from the route lists at the top of each controller. The docs are on by
default outside production; set `API_DOCS=true` or `false` to choose.

## Deploying

Free hosting, as planned in doc 15.0. Every account below is yours to create; nothing here
needs a secret in the repository. Put each service in or near Singapore.

| Part | Where | In the repository |
| --- | --- | --- |
| Customer, seller and rider site | Netlify, base directory `frontend` | `frontend/netlify.toml` |
| Admin console | A second Netlify site, base directory `frontend/deploy/admin` | `frontend/deploy/admin/netlify.toml` |
| API with the background jobs and live updates | Render, free web service from `backend/Dockerfile` | `render.yaml` |
| MySQL 8 | Aiven, free plan | `npm run db:hosted` |
| Redis | Upstash free (or Render Key Value) | |
| Seller and rider documents, complaint photos | Cloudflare R2, a private bucket | `STORAGE_DRIVER=s3` |
| Keeping the free API awake | GitHub Actions, every 10 minutes | `.github/workflows/keepalive.yml` |

1. **Database.** Create an Aiven for MySQL service (free plan). In `backend/`, create
   `.env.production` (git ignores it) with `DB_HOST`, `DB_PORT`, `DB_SSL=true`, `DB_SSL_CA`
   (the CA certificate from the Aiven console), `DB_ADMIN_USER=avnadmin`, and new strong
   values for `DB_MIGRATOR_USER=sh_migrator`, `DB_MIGRATOR_PASSWORD` and `DB_MODULE_PASSWORD`.
   Then run `npm run db:hosted` (it asks for the avnadmin password, hidden), `npm run
   migrate:hosted` and `npm run seed:hosted`. The setup checks that triggers are allowed and
   says what to change if not.
2. **Redis and the bucket.** Create an Upstash Redis database (copy its `rediss://` URL) and a
   private R2 bucket with an API token limited to that bucket (copy the endpoint, bucket name,
   access key id and secret).
3. **API.** On Render, New > Blueprint, pick this repository: `render.yaml` creates
   `snackhub-api` and asks for each value. If Render gives the service another address, use it
   in both `netlify.toml` files. Make an MFA key with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Copy the
   `PROXY_SIGNING_SECRET` Render generated. `https://<api>.onrender.com/health` should answer.
4. **Sites.** On Netlify, add two sites from this repository: base directory `frontend` for the
   shop, `frontend/deploy/admin` for the console. In each, add the environment variable
   `PROXY_SIGNING_SECRET` with the value from Render and the Runtime scope, and
   `VITE_GOOGLE_CLIENT_ID` if Google sign-in is used. Then set Render's `APP_URL` (the shop),
   `ADMIN_CONSOLE_URL` (the console, with a trailing `/`) and `CORS_ORIGINS` (both, comma
   separated) to the two Netlify addresses.
5. **First admin.** Add to `.env.production` the same `MFA_KEY` as on Render (the admin's
   authenticator secret is encrypted with it, so a different key locks them out), the
   `JWT_SECRET` and the `CORS_ORIGINS`, then run `npm run create-admin:hosted` from `backend/`.
6. **Awake.** In GitHub, Settings > Secrets and variables > Actions > Variables, add `API_URL`
   with the Render address. GitHub runs scheduled jobs late at busy times and pauses them after
   60 days without a commit, so add a second free pinger too (for example an UptimeRobot HTTP
   monitor on `https://<api>.onrender.com/health` every 5 minutes, which also emails you when
   the API is down). Check Render's terms allow it.
7. **Before applying to PhonePe.** Replace the demo business details in
   `frontend/src/constants/business.jsx` (name, address, support and grievance contacts). They
   appear on the Terms, Privacy, Cancellations and refunds, and Contact pages, which PhonePe
   checks against your registration.

The database pools: `render.yaml` sets `DB_POOL_MAX=3`, so the six module pools use at most 18
connections. Check the plan's limit with `SHOW VARIABLES LIKE 'max_connections'` in the Aiven
console's query editor, and keep `6 × DB_POOL_MAX` well under it.

The demo: the hosted sites show the real API's data (the seeded demo shops are labelled). The
one-tap demo accounts still work there: choosing one loads the in-browser mock for that browser
only, until the demo session signs out. A build with `VITE_USE_MOCKS=true` starts the mock on
every page (a demo-only site); development starts it unless `VITE_USE_MOCKS=false`.

How the pieces trust each other: each Netlify site proxies `/api/*` to Render and signs every
proxied request (Netlify's signed proxy redirects, HS256 with `PROXY_SIGNING_SECRET`). The API
reads the signature to know the site: admin routes answer only requests the admin site signed,
and the rate limits count each visitor's own address. In production the API refuses calls that
did not come through a site, except the PhonePe webhook (point it straight at
`https://<api>.onrender.com/api/v1/webhooks/phonepe`) and the health checks. Live updates
connect straight to Render (`VITE_SOCKET_URL`), because Netlify cannot carry sockets; staff
updates there need the admin console's own page address and a staff sign-in with a second factor.

Free-plan limits to expect: the API takes about a minute to wake after a quiet spell, Netlify's
free credits stop the sites when used up, and Aiven's free MySQL is small (about 1 GB disk) and
may be powered off when unused. Check each provider's current limits.

## Everyday commands

From the repository root:

| Command | Does |
| --- | --- |
| `npm run dev` | Everything in one terminal, in order: Redis (when Docker is running), the API, then both sites once the API answers. Use this to avoid `ECONNREFUSED 127.0.0.1:4000`, which means a site is running without the API |
| `npm run dev:frontend` | Frontend on http://localhost:5180 (accounts, onboarding and the catalog from the backend; the demo parts from the mock) |
| `npm run dev:admin` | Admin console on http://localhost:5181 |
| `npm run dev:backend` | Backend on http://localhost:4000 (`/health`, `/ready`, live updates on `/api/v1/socket`), with the email relay and the expiry job |
| `npm run redis:up` / `npm run redis:down` | Start or stop SnackHub's Redis (Docker, 127.0.0.1:6380) |
| `npm run create-admin -- --email you@gmail.com` | Make an admin (or `--role reviewer`) and print a one-time enrolment link |
| `npm run jobs` | One pass of the expiry job and the email relay, for a scheduler when `RUN_JOBS=false` |
| `npm run migrate` / `npm run migrate:down` | Apply every migration / undo all of them |
| `npm run seed` | Reload the demo data (same result every time) |
| `npm test` | Backend tests against MySQL (and Redis, when it runs): accounts, MFA, roles and permissions, onboarding and uploads, verification, expiry, constraints, catalog, orders, complaints, live updates, rate limits |
| `npm run build` | Production build of the frontend and the admin console |

## Database rules worth knowing

- Money is stored as integer paise; latitude and longitude as plain DECIMAL columns.
- Stock can never go below zero, and two buyers racing for the last units get exactly one winner.
- The same Idempotency-Key from one customer can never create two orders.
- Each payment webhook event is processed once; the payment ledger can only be added to.
- Foreign keys stay inside a module; references to another module's rows are plain ids.
- A shop lists each catalogue entry at most once (a unique key on shop and entry).

## Status

- Phase 1, the frontend on a mock API: done.
- Phase 2, the backend: the database (migrations, seed, constraint tests) is done; the catalog
  (`/cities`, `/sellers`, `/products`, `/search`) is served from MySQL; and accounts for every
  role work end to end: sign-up, email verification, password and Google sign-in, two-step
  sign-in, password reset, sessions (`/api/v1/auth/*`), seller and rider onboarding with
  documents (`/seller/onboarding`, `/rider/onboarding`), the verification console
  (`/admin/verification`, `/admin/documents`, `/admin/requirements`, `/admin/users`,
  `/admin/audit`), the customer order flow, complaints, credit, fines, rider pay disputes, the
  delivery policy and the live operations board (see "Ordering" above), with live updates over
  Socket.IO and shared rate limits in Redis (see "Live updates and rate limits"). Online payment runs
  through PhonePe's sandbox once its test keys are set; there is no live payment. Passkeys are not built yet.
- The demo catalogue has 201 snacks (one shared catalogue entry each) in 28 cities, most of them from the Telugu states, Tamil
  Nadu, Karnataka, Kerala and Maharashtra (`shared/seed/regional.js`).
- Every shop is a shop, a street stall (a cart, bandi or kadai) or a home kitchen (`catalog.sellers.kind`):
  24 demo street stalls and 8 demo home kitchens, all fictional, with badges and filters on the site.
- 34 of 201 snacks have their own AI image so far; the rest show a drawing until theirs is made
  (`npm --prefix frontend run assets:generate` makes more each day on the free Hugging Face quota).
