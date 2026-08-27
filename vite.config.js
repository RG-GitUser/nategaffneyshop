import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * The extra pages are real directories (coaching/index.html, privacy/…).
 * In production nginx serves them for the naked path too (try_files $uri/),
 * but Vite's dev server falls back to the landing page for any path it
 * doesn't recognise — so /coaching without the trailing slash would quietly
 * render the wrong page. Redirect to the slashed form instead, in both
 * `vite` (dev) and `vite preview`.
 */
function pageTrailingSlash() {
  const pages = ['/privacy', '/terms', '/coaching', '/followup', '/admin', '/invoice', '/about', '/page', '/audit', '/book']
  const redirect = (req, res, next) => {
    const [path, query] = req.url.split('?')
    if (!pages.includes(path)) return next()
    res.statusCode = 301
    res.setHeader('Location', `${path}/${query ? `?${query}` : ''}`)
    res.end()
  }
  return {
    name: 'page-trailing-slash',
    // Braces matter: configureServer treats a returned value as a post
    // hook, and `.use()` returns the (callable) middleware stack.
    configureServer(server) {
      server.middlewares.use(redirect)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect)
    },
  }
}

export default defineConfig({
  plugins: [react(), pageTrailingSlash()],
  server: {
    // PORT lets a launcher assign one when 5173 is taken by another
    // project's dev server; the API allows any localhost port in dev.
    port: Number(process.env.PORT) || 5173,
    host: true, // lets you open the site on your phone over local wifi
    // In development, forward API calls to the local server so cookies are
    // same-origin and VITE_API_URL can stay empty. In production the two
    // are separate hosts and VITE_API_URL points at the real API.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false, // keep the Origin so the API's CORS check is real
        // Without this, an API that simply isn't running surfaces as a bare
        // 500 on every request — which reads as a server bug rather than
        // "you haven't started the server".
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
            }
            res.end(
              JSON.stringify({
                error:
                  'Local API is not running. Start it with:  cd server && npm run dev:local',
                detail: err.code,
              }),
            )
          })
        },
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
        coaching: resolve(root, 'coaching/index.html'),
        followup: resolve(root, 'followup/index.html'),
        admin: resolve(root, 'admin/index.html'),
        invoice: resolve(root, 'invoice/index.html'),
        about: resolve(root, 'about/index.html'),
        page: resolve(root, 'page/index.html'),
        audit: resolve(root, 'audit/index.html'),
        book: resolve(root, 'book/index.html'),
      },
    },
  },
})
