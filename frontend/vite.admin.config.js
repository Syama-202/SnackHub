import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Business rules and seed data shared with the API (../shared)
const shared = fileURLToPath(new URL('../shared', import.meta.url));

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
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') req.url = '/admin.html';
          next();
        });
      },
    },
  ],
  server: { port: 5181, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist-admin', rollupOptions: { input: 'admin.html' } },
});
