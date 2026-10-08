import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function findRepository() {
  let current = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current)
    if (parent === current) throw new Error('Workspace root not found')
    current = parent
  }
  return current
}
export const repository = findRepository()
// Helpers use declared public import exports. They never import another member's src.
export async function sdk(member, entry = '.') {
  const manifest = JSON.parse(await readFile(resolve(repository, member, 'package.json'), 'utf8'))
  const declared = manifest.exports[entry]
  const target = typeof declared === 'string' ? declared : declared?.import
  if (!target) throw new Error(`No public import entry: ${manifest.name}${entry}`)
  return import(pathToFileURL(resolve(repository, member, target)).href)
}
