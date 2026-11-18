// @module-tag source-text
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('a version directory is deleted only in the recovery scan (the negative-sweep of the model)', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/packages.ts', import.meta.url)), 'utf8')
  const start = source.indexOf('function packageRecovery(')
  const end = source.indexOf('\nasync function categoryOf(')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const recovery = source.slice(start, end)
  const elsewhere = source.slice(0, start) + source.slice(end)
  expect(recovery).toContain('await rm(join(root, namespace, name, dir)')
  expect(elsewhere).not.toMatch(/\brm\(\s*(final|join\(root, namespace)/)
  const removals = [...elsewhere.matchAll(/\brm\(\s*(.+?),\s*\{ recursive/g)].map(match => match[1])
  expect(new Set(removals)).toEqual(new Set(['staging', 'join(root, STAGING, name)']))
})
