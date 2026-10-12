import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import identities from './fixtures/public-schema-identities.json' with { type: 'json' }

export function assertAdoptedSchemaBytes(specifier: string, bytes: Uint8Array): void {
  const expected = Object.entries(identities).find(([name]) => name === specifier)?.[1]
  if (expected === undefined)
    throw new Error(`missing independent schema expectation: ${specifier}`)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256)
  const resource = JSON.parse(Buffer.from(bytes).toString())
  expect(resource.$id).toBe(expected.id)
  expect(Object.keys(resource.$defs)).toEqual(expected.definitions)
}

export function assertAdoptedPublicSchema(specifier: string): void {
  assertAdoptedSchemaBytes(specifier, readFileSync(new URL(import.meta.resolve(specifier))))
}
