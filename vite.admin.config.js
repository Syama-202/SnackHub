import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Admin console: its own build and its own host (doc 16.3, 15.0).
export default defineConfig({
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
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist-admin', rollupOptions: { input: 'admin.html' } },
});
