import { adoptedSchemaBytes } from './adopted-schema-input.ts'
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
    const original = adoptedSchemaBytes('asset-model', version)
    expect(bytes.equals(original)).toBe(true)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(original).digest('hex'),
    )
    expect(resource.$id).toContain(`/v${version}/asset-model.schema.json`)
    expect(Object.keys(resource.$defs)).toEqual(Object.keys(JSON.parse(original.toString()).$defs))
  }
})

it('D068 retained body closure includes the complete exact private TD2 resource', () => {
  const copy = readFileSync(
    new URL('../schema/resources/tool-definition.v2.schema.json', import.meta.url),
  )
  const frozen = adoptedSchemaBytes('tool-definition', 2)
  expect(copy.equals(frozen)).toBe(true)
  expect(createHash('sha256').update(copy).digest('hex')).toBe(
    '21f6ff19640da3905b4697404b8d7c527a4f0a6ec4c870b3f0affdc558c469ae',
  )
  expect(JSON.parse(copy.toString()).$id).toContain('/v2/tool-definition.schema.json')
})
