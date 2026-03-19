import { defineConfig } from 'vite';
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
    // Requests the mock passes on (Google sign-in, refresh, logout, /me, the catalog reads
    // and a real admin's sign-in and approvals) go to the real backend on the same origin,
    // so the httpOnly refresh cookies work without CORS.
    proxy: Object.fromEntries(['auth', 'me', 'cities', 'sellers', 'products', 'search', 'admin'].map((p) => [`/api/v1/${p}`, backend])),
  },
  build: {
    outDir: 'dist',
    // No manualChunks: three.js, React Three Fiber and GSAP are only reached through
    // lazy imports, so Rollup keeps them out of the entry. Forcing them into a named
    // chunk let shared helpers land there and pulled all of three.js into every page.
    rollupOptions: { input: 'index.html' },
  },
});
