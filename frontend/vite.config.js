import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Business rules and seed data shared with the API (../shared)
const shared = fileURLToPath(new URL('../shared', import.meta.url));

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
  server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    // No manualChunks: three.js, React Three Fiber and GSAP are only reached through
    // lazy imports, so Rollup keeps them out of the entry. Forcing them into a named
    // chunk let shared helpers land there and pulled all of three.js into every page.
    rollupOptions: { input: 'index.html' },
  },
});
