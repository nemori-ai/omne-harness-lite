import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import {
  environmentNeedAdoption,
  environmentNeedSchema,
} from '@omne-harness/execution-environment-contract'

function validate(value: unknown) {
  return environmentNeedSchema['~standard'].validate(value)
}

it('accepts a declaration and keeps an unregistered facility key, because facility keys are open', () => {
  const value = {
    facilities: ['command', 'terminal', 'gpu'],
    isolation: ['process'],
    layers: ['host_machine', 'session_sandbox'],
  }
  expect(validate(value)).toEqual({ value })
})

it('refuses an unknown key', () => {
  const result = validate({ facilities: [], isolation: [], layers: [], policy: 'always-allow' })
  expect(result).toMatchObject({ issues: [{ path: ['policy'] }] })
})

it('refuses a non-string element and an unknown binding layer', () => {
  expect(validate({ facilities: [1], isolation: [], layers: [] })).toMatchObject({
    issues: [{ path: ['facilities', 0] }],
  })
  expect(validate({ facilities: [], isolation: [], layers: ['cloud'] })).toMatchObject({
    issues: [{ path: ['layers', 0] }],
  })
})

it('names the JSON Schema document by the digest of its bytes', async () => {
  const bytes = await readFile(new URL('../schema/environment-need.schema.json', import.meta.url))
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  expect(environmentNeedAdoption.digest).toBe(digest)
})
