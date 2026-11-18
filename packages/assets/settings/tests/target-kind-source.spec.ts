// @module-tag source-text
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))

function directories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(path, entry.name))
}

function sourceRoots(): string[] {
  const members = directories(join(repo, 'packages')).flatMap(directories)
  const apps = directories(join(repo, 'apps'))
  return [...members, ...apps].map(member => join(member, 'src')).filter(existsSync)
}

it('no production source names policyId: the kind of a target is its discriminant', () => {
  const roots = sourceRoots()
  expect(roots.length).toBeGreaterThan(50)
  const named = roots
    .flatMap(root =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(ts|tsx|mjs)$/.test(entry.name))
        .map(entry => join(entry.parentPath, entry.name)),
    )
    .filter(path => /\bpolicyId\b/.test(readFileSync(path, 'utf8')))
    .map(path => relative(repo, path))
  expect(named).toEqual([])
})
