import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { memberPath } from './module-graph.ts'

// The names that an external actor gave to Tool constructs are built from parts, so that this
// file does not name them either.
const REMOVED_TYPES = [['Stop', 'Reason'].join('')]
const REMOVED_TASK_KINDS = [['wait', 'card'].join('-')]

const sources = (): readonly string[] => {
  const directory = memberPath('src')
  return readdirSync(directory)
    .filter(name => name.endsWith('.ts'))
    .map(name => readFileSync(join(directory, name), 'utf8'))
}

it('keeps the replaced public type names, and none of the removed ones, in the sources', () => {
  const exported = new Set(
    sources().flatMap(text => [...text.matchAll(/^export type (\w+)/gmu)].map(match => match[1])),
  )
  for (const name of ['InterruptionCause', 'BackgroundSource', 'ToolControl', 'ResourceScope'])
    expect(exported.has(name)).toBe(true)
  for (const name of REMOVED_TYPES) expect(exported.has(name)).toBe(false)
})

it('names the wait task by the registration, not by the removed name', () => {
  const kinds = sources().flatMap(text =>
    [...text.matchAll(/kind: '(wait-[a-z-]+)'/gu)].map(match => match[1]),
  )
  expect(kinds).toEqual(['wait-registration'])
  for (const name of REMOVED_TASK_KINDS) expect(kinds).not.toContain(name)
})
