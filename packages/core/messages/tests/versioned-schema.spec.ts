import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import current from '@omne-harness-lite/messages/schema' with { type: 'json' }
import retainedV6 from '@omne-harness-lite/messages/schema/v6' with { type: 'json' }
import previous from '@omne-harness-lite/messages/schema/v3' with { type: 'json' }
import retained from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }

it('D110 public default7 and retained6/3/2 are complete exact frozen resources', () => {
  for (const [version, resource, path] of [
    [7, current, '../schema/messages.schema.json'],
    [6, retainedV6, '../schema/v6/messages.schema.json'],
    [3, previous, '../schema/v3/messages.schema.json'],
    [2, retained, '../schema/messages.v2.schema.json'],
  ] as const) {
    const bytes = readFileSync(new URL(path, import.meta.url))
    const original = readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/messages/v${version}/messages.schema.json`,
        import.meta.url,
      ),
    )
    expect(bytes.equals(original)).toBe(true)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(original).digest('hex'),
    )
    expect(resource.$id).toContain(`/v${version}/messages.schema.json`)
    expect(Object.keys(resource.$defs)).toEqual(Object.keys(JSON.parse(original.toString()).$defs))
  }
})
