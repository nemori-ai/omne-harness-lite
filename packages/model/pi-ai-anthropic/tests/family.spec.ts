// `createAnthropicFamily` and `acquire` through `composeFamilies` (#465 C2): one acquire gives one
// compatible binding; an unknown model, a mismatched adoption, a wrong route, a tokenizer that
// does not match the records and a cancelled acquire fail as a whole.
import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  createAnthropicFamily,
  ANTHROPIC_OWNER,
  ANTHROPIC_RECORDS,
  anthropicTokenizerResources,
  type AnthropicRecord,
} from '@omne-harness/pi-ai-anthropic'
import { CONFIG, FAMILY, recordNamed, supplierOf } from './support/anthropic.ts'

const RECORDS: readonly AnthropicRecord[] = ANTHROPIC_RECORDS
const SONNET = recordNamed('anthropic/claude-sonnet-5')
const live = () => new AbortController().signal

describe('createAnthropicFamily', () => {
  it('refuses a configuration that no binding could use', () => {
    expect(() =>
      createAnthropicFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '-1' } }),
    ).toThrow(RangeError)
    expect(() =>
      createAnthropicFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '1.5' } }),
    ).toThrow(RangeError)
  })

  it('cannot be composed with a second family of the same owner', () => {
    expect(() => composeFamilies([FAMILY, createAnthropicFamily(CONFIG)])).toThrow(RangeError)
  })
})

describe('acquire', () => {
  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s gives one binding for exactly its supplier and adoption',
    async (_name, record) => {
      const supplier = supplierOf(record)
      const acquired = await composeFamilies([FAMILY]).acquire(supplier, live())
      if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
      const binding = acquired.ok
      expect(binding.supplier).toEqual(supplier)
      expect(binding.adoption).toEqual(recordAdoption(ANTHROPIC_OWNER, record))
      expect(binding.counting).toBe(binding.meter.basis)
      expect(binding.counting.supplier.adoption).toEqual(supplier.adoption)
      expect(binding.counting.tokenization).toEqual({
        kind: 'local',
        definition: record.meter.tokenizer,
      })
      await binding.release()
      await expect(binding.release()).resolves.toBeUndefined()
    },
  )

  it('an adoption that no record has is not installed; no name or prefix matches it', async () => {
    const contributions = composeFamilies([FAMILY])
    const supplier = supplierOf(SONNET)
    for (const adoption of [
      { ...supplier.adoption, name: 'anthropic/claude-sonnet-5-mini' },
      { ...supplier.adoption, revision: '2' },
      { ...supplier.adoption, digest: '0'.repeat(64) },
    ])
      expect(await contributions.acquire({ ...supplier, adoption }, live())).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: ANTHROPIC_OWNER,
          diagnostic: 'adoption-not-installed',
        },
      })
  })

  it('a supplier whose model differs from the record is invalid', async () => {
    const supplier = { ...supplierOf(SONNET), model: 'anthropic/claude-opus-5' }
    expect(await composeFamilies([FAMILY]).acquire(supplier, live())).toEqual({
      failure: { kind: 'invalid', field: 'supplier.model', reason: 'route-mismatch' },
    })
  })

  it('a tokenizer definition other than the records name is unavailable', async () => {
    const resources = anthropicTokenizerResources()
    const family = createAnthropicFamily({
      ...CONFIG,
      tokenizer: {
        ...resources,
        definition: {
          ...resources.definition,
          configuration: { ...resources.definition.configuration, revision: '2' },
        },
      },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(SONNET), live())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: ANTHROPIC_OWNER,
        diagnostic: 'tokenizer-definition-mismatch',
      },
    })
  })

  it('resources that fail the tokenizer checks are unavailable, never another encoding', async () => {
    const family = createAnthropicFamily({
      ...CONFIG,
      tokenizer: { ...anthropicTokenizerResources(), specialTokens: { '<EOT>': 0 } },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(SONNET), live())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: ANTHROPIC_OWNER,
        diagnostic: 'tokenizer-unavailable',
      },
    })
  })

  it('an acquire that is cancelled before it starts calls nothing and is unavailable', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await composeFamilies([FAMILY]).acquire(supplierOf(SONNET), controller.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic: 'cancelled' },
    })
  })

  it('an acquire that is cancelled while the family works gives no binding', async () => {
    // The table reads `aborted` once before it calls the family; the family reads it again.
    let reads = 0
    const signal: AbortSignal = Object.create(AbortSignal.prototype, {
      aborted: { get: () => reads++ > 0 },
    })
    expect(await composeFamilies([FAMILY]).acquire(supplierOf(SONNET), signal)).toEqual({
      failure: { kind: 'unavailable', dependency: ANTHROPIC_OWNER, diagnostic: 'cancelled' },
    })
  })
})
