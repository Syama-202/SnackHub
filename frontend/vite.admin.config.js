import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Business rules and seed data shared with the API (../shared)
const shared = fileURLToPath(new URL('../shared', import.meta.url));
// The backend in development (npm run dev:backend)
const backend = process.env.SNACKHUB_BACKEND_URL || 'http://127.0.0.1:4000';

// Admin console: its own build and its own host (doc 16.3, 15.0).
export default defineConfig({
  resolve: { alias: { '@shared': shared } },
  // Its own dependency cache, so running it beside the customer app (5180) does not
  // invalidate that server's optimised deps ("Outdated Optimize Dep" 504s)
  cacheDir: 'node_modules/.vite-admin',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'admin-entry',
      configureServer(server) {
        // every page address (/, /verification, /enrol?token=...) is the admin console; files,
        // Vite's own paths and the API pass through untouched
        server.middlewares.use((req, _res, next) => {
          const path = (req.url ?? '/').split('?')[0];
          const page = req.method === 'GET' && (path === '/index.html' || !/^\/(api|@|src|node_modules|assets)\b/.test(path)) && !/\.\w+$/.test(path.replace('/index.html', ''));
          if (page) req.url = `/admin.html${req.url.slice(path.length)}`;
          next();
        });
      },
    },
  ],
  // the host header stays localhost:5181, which is on the backend's ADMIN_HOSTS list, and the
  // admin refresh cookie works because the API is on the same origin
  server: { port: 5181, strictPort: true, fs: { allow: ['..'] }, proxy: Object.fromEntries(['admin', 'auth', 'me', 'files'].map((p) => [`/api/v1/${p}`, backend])) },
  build: { outDir: 'dist-admin', rollupOptions: { input: 'admin.html' } },
});
