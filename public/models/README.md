# 3D models

**Placeholder.** The hero snack box (`src/features/landing/scene/HeroScene.jsx`) and the
rider scooter (`src/features/tracking/LaneScene.jsx`) are built from three.js primitives in
code, so nothing is downloaded yet.

When real assets exist (doc 22.9a):

- `snack-box.glb` and `rider-scooter.glb`, 15,000 triangles or fewer in total
- compress with `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt`
- textures 1024 px maximum, WebP or KTX2, one shared atlas
- load with drei `useGLTF`, keep the poster and SVG fallbacks
- record each model's source and licence in `MODEL_CREDITS.md`
