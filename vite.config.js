import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // lets you open the site on your phone over local wifi
    // In development, forward API calls to the local server so cookies are
    // same-origin and VITE_API_URL can stay empty. In production the two
    // are separate hosts and VITE_API_URL points at the real API.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false, // keep the Origin so the API's CORS check is real
      },
      '/uploads': { target: 'http://localhost:8080' },
    },
  },
  build: {
    // Real static pages rather than client-side routes, so /privacy/ and
    // /terms/ are directly linkable with no host rewrite rules. Stripe and
    // other services need policy URLs that resolve on their own.
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        privacy: resolve(root, 'privacy/index.html'),
        terms: resolve(root, 'terms/index.html'),
        admin: resolve(root, 'admin/index.html'),
      },
    },
  },
})
