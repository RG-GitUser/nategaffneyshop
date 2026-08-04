import { useEffect, useState } from 'react'
import { Sun, Moon } from './Icons.jsx'

const STORAGE_KEY = 'ng-theme'

/**
 * Dark is the default — the warm brown ground is the site's primary look.
 * The inline script in index.html sets data-theme before first paint so
 * there's no flash of the wrong theme on load — this component just reads
 * what that script decided and takes over.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    // Keeps the mobile browser chrome in step with the page.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#1D150C' : '#EBE5D8')
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // private mode / storage disabled — the toggle still works for this visit
    }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      className="themetoggle"
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span className="themetoggle__icon" aria-hidden="true">
        {theme === 'dark' ? <Sun width={18} height={18} /> : <Moon width={18} height={18} />}
      </span>
    </button>
  )
}
