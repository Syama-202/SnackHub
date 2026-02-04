# SnackHub web (Phase 1: frontend on a mock API)

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
| Pages (one file per screen) | `src/pages/`, `src/pages/seller/`, `src/pages/rider/` |
| Shared components | `src/components/`, `src/components/landing/`, `src/components/tracking/` |
| Redux store and slices | `src/store/store.js`, `src/store/slices/*Slice.js` (auth, toast, ui, products, cart, profile, orders, notifications, seller, rider, admin) |
| API client | `src/lib/api.js` (`apiFetch`, in-memory access token, silent refresh) |
| Design tokens and utilities (22.1 to 22.3) | `src/index.css` (`@theme` tokens and animations, `@utility glass`, `bg-hero`, `lift`, `shine`, `reveal`) |
| Business rules as pure functions | `src/domain/` (promise 8.3, penalty 8.4, states 10.1, triage 10.7) |
| Mock API, seed, simulator | `src/mocks/` |
| Admin console (separate build and store) | `src/admin/` |

All server data goes through `createAsyncThunk` thunks in the slices (shared error handling in
`src/store/apiThunk.js`). Components read with `useSelector` and write with `dispatch`; live
screens refresh with the `usePolling` hook until Socket.io arrives in Phase 3.

## Decisions applied

- Brand SnackHub, tokens from 22.1, Baloo 2 + Nunito Sans; promise wording
  "Estimated delivery in 25 to 30 minutes, subject to serviceability and preparation time."
- Redux holds all client and server state; the cart lives on the server and the cart slice
  mirrors it with an optimistic update and rollback.
- CSS and IntersectionObserver first, Motion for layout and page transitions, GSAP
  ScrollTrigger only on the landing story, no Lenis. Every animation has a reduced-motion end state.
- Hero and lane 3D lazy-load, cap DPR, pause offscreen or when the tab is hidden, and fall
  back to a poster or the SVG lane without WebGL or with reduced motion.
- Order payloads never contain the delivery code; it comes only from `/orders/:id/otp`.

## Not done yet (placeholders)

- Snack pictures are SVG illustrations and the 3D models are primitives in code; the AI
  images, videos and compressed GLBs from doc section 25 still need to be made
  (`public/models/README.md`).
- Phase 1 gate items still open: Playwright UI tests per screen, Lighthouse numbers, and a
  screen-reader pass. Real Socket.io, Razorpay checkout.js and Google Identity Services
  arrive in Phase 3.

Dev only: `localStorage['snackhub.motion'] = 'force'` previews full motion on a machine
with reduced motion turned on.
