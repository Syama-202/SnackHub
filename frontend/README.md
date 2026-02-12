# SnackHub frontend (Phase 1: the app on a mock API)

The customer, seller and rider apps, plus the admin console as a separate build, running
entirely in the browser against an MSW mock API shaped like the real `/api/v1` endpoints
(doc sections 10.7, 10.9 and 11). Everything shown is demo data.

## Run

```bash
npm install
npm run dev            # http://localhost:5173  (customer, /seller, /rider, /design)
                       # http://localhost:5173/admin.html  (admin, shares the mock data in dev)
npm run dev:admin      # admin on its own host, http://localhost:5174 (separate mock data)
npm run build          # dist/ (public) and dist-admin/ (admin), built separately
```

Demo admin authenticator code: `246810`. "Reset demo" in the banner restores the seed data.

## Demo scripts

- **Customer, simulated:** Shop, ADD (one-tap demo Google sign-in), cart, checkout with UPI
  (`success@razorpay` or `failure@razorpay`), "confirming" until the simulated webhook,
  then live tracking. The code unlocks at about 500 m; the rider lane stays at the bottom
  of every page while the order is active.
- **Seller and rider by hand:** open `/seller` and `/rider` in two tabs. Seller: "Simulate
  an incoming order", Accept. Rider: accept the 20 second offer. Seller: Start packing,
  Mark packed. Rider: tick the seal check, Picked up, "Simulate drive", enter the code
  inside 150 m (three wrong tries lock it).
- **Admin:** `/admin.html`, Google step, code. "Expire my MFA" then save the policy to see
  the step-up. Approvals, complaint review, policy preview of the three worked penalty cases.

## Stack and structure

React 19, Redux Toolkit and Tailwind CSS v4, laid out like the legacy `frontend/` folder.

| Area | Path |
| --- | --- |
| Pages (one file per screen), by role | `src/pages/customer/`, `src/pages/seller/`, `src/pages/rider/`, `src/pages/auth/`, `src/pages/common/` |
| UI primitives (Button, Icon, Modal, ...) and media | `src/components/ui/` (`index.jsx`, `SnackImage`, `SnackArt`, `LoopVideo`, `Toast`) |
| Layout, cart, product, payment | `src/components/layout/`, `src/components/cart/`, `src/components/product/`, `src/components/payment/` |
| Landing sections and live tracking | `src/components/landing/`, `src/components/tracking/` |
| Redux store and slices | `src/store/store.js`, `src/store/slices/*Slice.js` (auth, toast, ui, products, cart, profile, orders, notifications, seller, rider, admin) |
| API client | `src/services/api.js` (`apiFetch`, in-memory access token, silent refresh) |
| Hooks | `src/hooks/` (`uiHooks.js` for motion, visibility and polling; `useCatalog.js`; `useTracking.js`) |
| Helpers and fixed lists | `src/utils/assets.js` (image URLs), `src/constants/catalog.js` (categories, moods, regions), `src/assets/assetIndex.json` (ready images) |
| Design tokens and utilities (22.1 to 22.3) | `src/styles/index.css` (`@theme` tokens and animations, `@utility glass`, `bg-hero`, `lift`, `shine`, `reveal`, `reveal-mask`, `split-words`, `parallax`) |
| Business rules as pure functions | `../shared/domain/` via the `@shared` alias, also used by the API (promise 8.3, penalty 8.4, states 10.1, triage 10.7) |
| Mock API and simulator | `src/mocks/` (demo data from `../shared/seed/seed.js`, the same data `npm run seed` loads into MySQL) |
| Admin console (separate build and store) | `src/admin/` (`pages/`, `store/`) |

All server data goes through `createAsyncThunk` thunks in the slices (shared error handling in
`src/store/apiThunk.js`). Components read with `useSelector` and write with `dispatch`; live
screens refresh with the `usePolling` hook until Socket.io arrives in Phase 3.

## Decisions applied

- Brand SnackHub, tokens from 22.1, Fraunces for headings and Plus Jakarta Sans for text; promise wording
  "Estimated delivery in 25 to 30 minutes, subject to serviceability and preparation time."
- Redux holds all client and server state; the cart lives on the server and the cart slice
  mirrors it with an optimistic update and rollback.
- CSS and IntersectionObserver first (rise and un-blur reveals, word-by-word headlines,
  image masks, scroll-timeline parallax), Motion for layout and page transitions, GSAP
  ScrollTrigger only on the landing page (the turning hero plate and the scroll showcase),
  no Lenis. Every animation has a reduced-motion end state.
- The rider lane is the only 3D: it lazy-loads, caps DPR, pauses offscreen or when the tab is
  hidden, and falls back to the SVG lane without WebGL or with reduced motion.
- Order payloads never contain the delivery code; it comes only from `/orders/:id/otp`.

## Media (doc 6.2, 22.8, 25)

`assets/manifest.json` lists every image, video and 3D model the UI needs: one catalogue
image and one cut-out per snack slug, plus the hero, region, mood, story and video assets,
each with its prompt, target size and status (needed, generated, processed, ready).

```bash
npm run assets:manifest   # regenerate after the catalogue changes (keeps status and files)
npm run assets:process    # cut, resize and mark ready every image listed in assets/crops.json
npm run assets:check      # files marked ready: present, under budget, no duplicate images
```

Generated images go in `assets/raw/` (not committed). Each entry in `assets/crops.json` names
the asset id, the source file and the box to cut; `assets:process` writes 400, 800 and 1200 px
WebP files to `public/assets/` and marks the asset ready. `SnackImage`, `AssetImage` and
`LoopVideo` pick them up and fall back to the drawings until then, so there is never a broken
image. Today 11 of 54 snacks and the landing scenes have AI images; the rest still need one.

## Tests

Testing is manual (doc 27.2). The test plan and results live in `docs/manual-tests.md` and
`docs/test-results.md` on the developer's machine; they are ignored by git and not published.

## Not done yet

- AI images for the other 43 snacks, the cut-outs, the videos and the rider GLB from doc
  section 25 still need to be made; the manifest lists all of them with their prompts.
- Manual test results to record (keyboard path, no-WebGL, three-wrong-codes lock, tablet width).
- Largest contentful paint is 2.7 s without the mock (target 2.5 s).

Dev only: `localStorage['snackhub.motion'] = 'force'` previews full motion on a machine
with reduced motion turned on.
