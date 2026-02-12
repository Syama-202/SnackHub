# 3D models

**Placeholder.** The rider scooter (`src/components/tracking/LaneScene.jsx`) is built from
three.js primitives in code, so nothing is downloaded yet. The landing hero uses photos, not 3D.

When real assets exist (doc 22.9a):

- `rider-scooter.glb`, 15,000 triangles or fewer
- compress with `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt`
- textures 1024 px maximum, WebP or KTX2, one shared atlas
- load with drei `useGLTF`, keep the poster and SVG fallbacks
- record each model's source and licence in `MODEL_CREDITS.md`
