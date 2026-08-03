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
      },
    },
  },
})
