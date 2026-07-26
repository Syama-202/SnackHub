import { defineConfig } from 'vite';
import { vendorChunks } from './vite.chunks.js';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Business rules and seed data shared with the API (../shared)
const shared = fileURLToPath(new URL('../shared', import.meta.url));
// The backend in development (npm run dev:backend)
const backend = process.env.SNACKHUB_BACKEND_URL || 'http://127.0.0.1:4000';

// Public build: customer, seller and rider apps. The admin console is a
// separate build (vite.admin.config.js) so no admin code ships here (doc 16.3).
export default defineConfig({
  resolve: { alias: { '@shared': shared } },
  plugins: [
    react(),
    tailwindcss(),
    {
      // Dev convenience: /admin.html/* deep links reload into the admin entry, so it shares the mock data
      name: 'admin-dev-fallback',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/admin.html/')) req.url = '/admin.html';
          next();
        });
      },
    },
  ],
  server: {
    // 5180, not Vite's usual 5173, so SnackHub never collides with other local projects
    port: 5180,
    strictPort: true,
    fs: { allow: ['..'] },
    // Requests the mock passes on go to the real backend on the same origin, so the httpOnly
    // refresh cookies work without CORS: every real account (sign-in, cart, orders, the seller
    // and rider consoles, a real admin), and the catalog reads. Demo sessions stay in the mock.
    // Live updates (Socket.IO) take the WebSocket upgrade through the same origin.
    proxy: {
      ...Object.fromEntries(['auth', 'me', 'cities', 'sellers', 'products', 'catalogue', 'client-errors', 'search', 'admin', 'files', 'seller', 'rider', 'cart', 'orders'].map((p) => [`/api/v1/${p}`, backend])),
      '/api/v1/socket': { target: backend, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    // hashed build files go in static/ (cached for a year); public/assets keeps the photos,
    // whose names stay the same when they change
    assetsDir: 'static',
    // vendor split only (vite.chunks.js); MapLibre and GSAP stay in their lazy chunks
    rollupOptions: { input: 'index.html', output: { manualChunks: vendorChunks } },
    // MapLibre is one 1 MB chunk (290 kB gzipped), loaded only when a map is on screen
    chunkSizeWarningLimit: 1100,
  },
});
