import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import inputs from './fixtures/adopted-schema-inputs.json' with { type: 'json' }

/** Verification input only. Expected identity and bytes do not come from the candidate. */
export function adoptedSchemaBytes(topic: string, version: number): Buffer {
  const expected = Object.entries(inputs).find(([name]) => name === `${topic}/v${version}`)?.[1]
  if (expected === undefined)
    throw new Error(`unknown adopted verification resource: ${topic}/v${version}`)
  const bytes = readFileSync(new URL(expected.path, import.meta.url))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256)
  expect(JSON.parse(bytes.toString()).$id).toBe(expected.id)
  return bytes
}
