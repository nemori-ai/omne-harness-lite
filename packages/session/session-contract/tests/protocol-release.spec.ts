import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, join, sep } from 'node:path'
import { expect, it } from 'vitest'
import { INITIALIZATION_RELEASE_DIGEST, SESSION_RELEASE_DIGEST } from '../src/release-digests.ts'

const root = new URL('../src/', import.meta.url)
const files = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
  .map(entry =>
    relative(fileURLToPath(root), join(entry.parentPath, entry.name)).split(sep).join('/'),
  )
  .filter(name => !name.startsWith('testing') && name !== 'release-digests.ts')
  .sort()

function digest(paths: readonly string[]): string {
  const hash = createHash('sha256')
  for (const path of paths) {
    const name = Buffer.from(`src/${path}`, 'utf8')
    const content = readFileSync(new URL(path, root))
    hash.update(`${name.length}:`).update(name).update(`${content.length}:`).update(content)
  }
  return `sha256:${hash.digest('hex')}`
}

it('binds the initialization protocol to its complete release source set', () => {
  expect(INITIALIZATION_RELEASE_DIGEST).toBe(digest(files))
})

it('binds the interpreter to every production source file and its relative path', () => {
  expect(SESSION_RELEASE_DIGEST).toBe(digest(files))
})

it('keeps the excluded digest file free of runtime behavior', () => {
  const text = readFileSync(new URL('release-digests.ts', root), 'utf8')
  expect(
    text
      .replace(
        /export const (?:INITIALIZATION|SESSION)_RELEASE_DIGEST\s*=\s*'sha256:[0-9a-f]{64}'\s*/gu,
        '',
      )
      .trim(),
  ).toBe('')
})
