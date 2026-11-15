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
    // Every API call goes to the backend on the same origin, so the httpOnly refresh cookies
    // work without CORS. Live updates (Socket.IO) take the WebSocket upgrade the same way; that
    // entry comes first, so it wins over the general one.
    proxy: {
      '/api/v1/socket': { target: backend, ws: true },
      '/api/v1': backend,
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
