import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, join, sep } from 'node:path'

const root = new URL('../src/', import.meta.url)
const paths = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
  .map(entry =>
    relative(fileURLToPath(root), join(entry.parentPath, entry.name)).split(sep).join('/'),
  )
  .filter(path => !path.startsWith('testing') && path !== 'release-digests.ts')
  .sort()
const hash = createHash('sha256')
for (const path of paths) {
  const name = Buffer.from(`src/${path}`, 'utf8')
  const bytes = readFileSync(new URL(path, root))
  hash.update(`${name.length}:`).update(name).update(`${bytes.length}:`).update(bytes)
}
const digest = `sha256:${hash.digest('hex')}`
const content = ['INITIALIZATION', 'SESSION']
  .map(name => `export const ${name}_RELEASE_DIGEST =\n  '${digest}'\n`)
  .join('')
if (process.argv[2] === '--write') writeFileSync(new URL('release-digests.ts', root), content)
else if (process.argv.length > 2)
  throw new Error('usage: node docs/recompute-release.mjs [--write]')
console.log(JSON.stringify({ files: paths.map(path => `src/${path}`), digest }, null, 2))
