import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import current from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import retained from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }

it('D068 public default3 and retained2 are complete exact frozen resources', () => {
  for (const [version, resource, suffix] of [
    [3, current, ''],
    [2, retained, '.v2'],
  ] as const) {
    const bytes = readFileSync(
      new URL(`../schema/asset-model${suffix}.schema.json`, import.meta.url),
    )
    const original = readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/asset-model/v${version}/asset-model.schema.json`,
        import.meta.url,
      ),
    )
    expect(bytes.equals(original)).toBe(true)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(original).digest('hex'),
    )
    expect(resource.$id).toContain(`/v${version}/asset-model.schema.json`)
    expect(Object.keys(resource.$defs)).toEqual(Object.keys(JSON.parse(original.toString()).$defs))
  }
})
