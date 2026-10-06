import { assertContentSchemaTransition } from './schema-transition.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import current from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import retained from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }

it('D068 current default3 has only the adopted delta; retained2 stays byte-exact', () => {
  for (const [version, resource, suffix] of [
    [3, current, ''],
    [2, retained, '.v2'],
  ] as const) {
    const bytes = readFileSync(
      new URL(`../schema/content-blocks${suffix}.schema.json`, import.meta.url),
    )
    const original = readFileSync(
      new URL(
        `../../../../.meta_harness/design/spec/data/content-blocks/v${version}/content-blocks.schema.json`,
        import.meta.url,
      ),
    )
    if (version === 3) assertContentSchemaTransition(bytes, original)
    else {
      expect(bytes.equals(original)).toBe(true)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        createHash('sha256').update(original).digest('hex'),
      )
    }
    expect(resource.$id).toContain(`/v${version}/content-blocks.schema.json`)
    expect(Object.keys(resource.$defs).sort()).toEqual(
      [
        ...Object.keys(JSON.parse(original.toString()).$defs),
        ...(version === 3 ? ['AdmissionDenialCode', 'ActionDenialReason', 'ToolCallOutcome'] : []),
      ].sort(),
    )
  }
})
