import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { assertMessagesSchemaTransition } from './schema-transition.ts'
import current from '@omne-harness-lite/messages/schema' with { type: 'json' }
import retainedV6 from '@omne-harness-lite/messages/schema/v6' with { type: 'json' }
import previous from '@omne-harness-lite/messages/schema/v3' with { type: 'json' }
import retained from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }

it('MS9 current transition and retained6/3/2 preserve their complete resource shapes', () => {
  for (const [version, resource, path] of [
    [9, current, '../schema/messages.schema.json'],
    [6, retainedV6, '../schema/v6/messages.schema.json'],
    [3, previous, '../schema/v3/messages.schema.json'],
    [2, retained, '../schema/messages.v2.schema.json'],
  ] as const) {
    const bytes = readFileSync(new URL(path, import.meta.url))
    const original = readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/messages/v${version === 9 ? 8 : version}/messages.schema.json`,
        import.meta.url,
      ),
    )
    if (version === 9) assertMessagesSchemaTransition(bytes, original)
    else {
      expect(bytes.equals(original)).toBe(true)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        createHash('sha256').update(original).digest('hex'),
      )
      expect(Object.keys(resource.$defs)).toEqual(
        Object.keys(JSON.parse(original.toString()).$defs),
      )
    }
    expect(resource.$id).toContain(`/v${version}/messages.schema.json`)
  }
})
