// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('only the tenant-assets row opens a local assets: two would each recover and sweep the other', () => {
  const src = fileURLToPath(new URL('../../../src/', import.meta.url))
  const opening = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => join(entry.parentPath, entry.name))
    .filter(path => /\bcreateAssetsLocal\(/.test(readFileSync(path, 'utf8')))
    .map(path => relative(src, path))
  expect(opening).toEqual(['rows/tenant-assets/host.ts'])
})
