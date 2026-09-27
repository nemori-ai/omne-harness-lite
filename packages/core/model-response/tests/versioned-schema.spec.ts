import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import current from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import previous from '@omne-harness-lite/model-response/schema/v3' with { type: 'json' }
import retained from '@omne-harness-lite/model-response/schema/v2' with { type: 'json' }

it('D070 public default4 and retained3/2 are complete exact frozen resources', () => {
  for (const [version, resource, path] of [
    [4, current, '../schema/model-response.schema.json'],
    [3, previous, '../schema/v3/model-response.schema.json'],
    [2, retained, '../schema/model-response.v2.schema.json'],
  ] as const) {
    const bytes = readFileSync(new URL(path, import.meta.url))
    const original = readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/model-response/v${version}/model-response.schema.json`,
        import.meta.url,
      ),
    )
    expect(bytes.equals(original)).toBe(true)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(original).digest('hex'),
    )
    expect(resource.$id).toContain(`/v${version}/model-response.schema.json`)
    expect(Object.keys(resource.$defs)).toEqual(Object.keys(JSON.parse(original.toString()).$defs))
  }
})
