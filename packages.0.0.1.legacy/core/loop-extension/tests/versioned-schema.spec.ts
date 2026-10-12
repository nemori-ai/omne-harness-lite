import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import expectations from './fixtures/retained-schema-expectations.json' with { type: 'json' }
import current from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import retained from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }

it('D068 public default3 and retained2 are complete exact frozen resources', () => {
  for (const [version, resource, suffix] of [
    [3, current, '.v3'],
    [2, retained, '.v2'],
  ] as const) {
    const bytes = readFileSync(
      new URL(`../schema/loop-extension${suffix}.schema.json`, import.meta.url),
    )
    const expected = expectations[String(version) as '2' | '3']
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256)
    expect(resource.$id).toContain(`/v${version}/loop-extension.schema.json`)
    expect(Object.keys(resource.$defs)).toEqual(expected.definitions)
  }
})
