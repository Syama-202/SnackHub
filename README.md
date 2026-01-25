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

## Where things are

| Area | Path |
| --- | --- |
| Tokens, glass, motion (22.1 to 22.3) | `src/styles/index.css`, `/design` page |
| Business rules as pure functions | `src/domain/` (promise 8.3, penalty 8.4, states 10.1, triage 10.7) |
| Mock API, seed, simulator | `src/mocks/` |
| Landing (22.9c) and R3F hero | `src/features/landing/` |
| Rider lane, 3D and SVG (22.5) | `src/features/tracking/` |
| Seller, rider, admin | `src/features/seller`, `src/features/rider`, `src/admin` |

## Decisions applied

- Brand SnackHub, tokens from 22.1, Baloo 2 + Nunito Sans; promise wording
  "Estimated delivery in 25 to 30 minutes, subject to serviceability and preparation time."
- Redux for auth and UI only; TanStack Query for server state; server cart with optimistic UI.
- CSS and IntersectionObserver first, Motion for layout, GSAP ScrollTrigger only on the
  landing story, no Lenis. Every animation has a reduced-motion end state.
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
