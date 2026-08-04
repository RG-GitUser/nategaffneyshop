/**
 * Pre-build CSS sanity check.
 *
 * Exists because of a real shipped bug: an unclosed `@media (hover:hover)`
 * block swallowed the rest of the stylesheet. Every desktop browser and
 * the bundler tolerated it silently — the media condition is TRUE on
 * hover-capable machines, so all the trapped rules still applied there —
 * while every phone (no hover) dropped hundreds of rules and rendered
 * the site bare. Nothing in the toolchain complained.
 *
 * Checks, per stylesheet:
 *   1. Braces balance exactly.
 *   2. No suspiciously huge conditional block: if more than 40% of the
 *      file's rules sit inside one @media/@supports, something has
 *      probably swallowed rules that were meant to be global.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = new URL('../src/styles/', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1') // windows path from file URL

let failed = false

for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
  const text = readFileSync(join(dir, file), 'utf8')
  let depth = 0
  let line = 1
  let maxBlockRules = 0
  let blockStartLine = 0
  let rulesInBlock = 0
  let totalRules = 0
  let inCondBlock = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') line++
    if (ch === '{') {
      depth++
      totalRules++
      if (depth === 2 && inCondBlock) rulesInBlock++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && inCondBlock) {
        if (rulesInBlock > maxBlockRules) maxBlockRules = rulesInBlock
        inCondBlock = false
        rulesInBlock = 0
      }
      if (depth < 0) {
        console.error(`  ${file}: extra closing brace around line ${line}`)
        failed = true
        depth = 0
      }
    } else if (ch === '@' && depth === 0) {
      const ahead = text.slice(i, i + 10)
      if (ahead.startsWith('@media') || ahead.startsWith('@supports')) {
        inCondBlock = true
        blockStartLine = line
      }
    }
  }

  if (depth !== 0) {
    console.error(`  ${file}: ${depth} unclosed brace(s) — a conditional block is swallowing everything after it`)
    failed = true
  }
  if (totalRules > 20 && maxBlockRules > totalRules * 0.4) {
    console.error(
      `  ${file}: one @media/@supports block (near line ${blockStartLine}) contains ` +
        `${maxBlockRules} of ${totalRules} rules — almost certainly an unclosed block`,
    )
    failed = true
  }
}

if (failed) {
  console.error('\nCSS structure check failed — fix before building.\n')
  process.exit(1)
}
console.log('css structure ok')
