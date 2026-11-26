import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publisher, signBundle } from '../tests/support/page-bundle.ts'

const builtPage = fileURLToPath(new URL('../dist/test/page/', import.meta.url))
const ENTRY = /<script type="module" crossorigin src="([^"]+)"><\/script>/

export const bundleKey = publisher()
export const BROKEN_FLAG = 'break-this-page'
export const CANDIDATE_WROTE = 'candidate-wrote'

type Kind = 'good' | 'broken' | 'breaks-when-flagged'

const starts = (kind: Kind, mark: string, entry: string): string => {
  const marked = `document.documentElement.dataset.pageBundle = ${JSON.stringify(mark)}\n`
  const page = `import(${JSON.stringify(entry)})\n`
  if (kind === 'good') return marked + page
  if (kind === 'broken')
    return `localStorage.setItem(${JSON.stringify(CANDIDATE_WROTE)}, '1')\nthrow new Error('this bundle cannot start')\n`
  return `${marked}if (localStorage.getItem(${JSON.stringify(BROKEN_FLAG)}) !== null) throw new Error('this bundle cannot start here')\n${page}`
}

/** The built page as a signed bundle with an entry of its own: it marks the document, then starts the page or does not. */
export function pageBundle(kind: Kind, mark: string, signed = true): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-page-bundle-')))
  cpSync(builtPage, directory, { recursive: true })
  const html = readFileSync(join(directory, 'index.html'), 'utf8')
  const entry = ENTRY.exec(html)?.[1]
  if (entry === undefined) throw new Error('the built page has no module entry')
  writeFileSync(join(directory, 'bundle-entry.js'), starts(kind, mark, entry))
  writeFileSync(join(directory, 'index.html'), html.replace(entry, '/bundle-entry.js'))
  return signBundle(directory, signed ? bundleKey : undefined)
}
