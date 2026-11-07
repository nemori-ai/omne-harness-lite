// `createOpenAiFamily` and `acquire` through `composeFamilies` (#465 C2): one acquire gives one
// compatible binding; an unknown model, a mismatched adoption, a wrong route, a tokenizer that
// does not match the records and a cancelled acquire fail as a whole.
import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  createOpenAiFamily,
  OPENAI_OWNER,
  OPENAI_RECORDS,
  openAiTokenizerResources,
  type OpenAiRecord,
} from '@omne-harness/pi-ai-openai'
import { CONFIG, FAMILY, recordNamed, supplierOf } from './support/openai.ts'

const RECORDS: readonly OpenAiRecord[] = OPENAI_RECORDS
const SOL = recordNamed('openai/gpt-5.6-sol')
const live = () => new AbortController().signal

describe('createOpenAiFamily', () => {
  it('refuses a configuration that no binding could use', () => {
    expect(() =>
      createOpenAiFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '-1' } }),
    ).toThrow(RangeError)
    expect(() =>
      createOpenAiFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '1.5' } }),
    ).toThrow(RangeError)
  })

  it('cannot be composed with a second family of the same owner', () => {
    expect(() => composeFamilies([FAMILY, createOpenAiFamily(CONFIG)])).toThrow(RangeError)
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
      expect(binding.adoption).toEqual(recordAdoption(OPENAI_OWNER, record))
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
    const supplier = supplierOf(SOL)
    for (const adoption of [
      { ...supplier.adoption, name: 'openai/gpt-5.6-sol-mini' },
      { ...supplier.adoption, revision: '2' },
      { ...supplier.adoption, digest: '0'.repeat(64) },
    ])
      expect(await contributions.acquire({ ...supplier, adoption }, live())).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: OPENAI_OWNER,
          diagnostic: 'adoption-not-installed',
        },
      })
  })

  it('a supplier whose model differs from the record is invalid', async () => {
    const supplier = { ...supplierOf(SOL), model: 'openai/gpt-5.6-terra' }
    expect(await composeFamilies([FAMILY]).acquire(supplier, live())).toEqual({
      failure: { kind: 'invalid', field: 'supplier.model', reason: 'route-mismatch' },
    })
  })

  it('a tokenizer definition other than the records name is unavailable', async () => {
    const resources = openAiTokenizerResources()
    const family = createOpenAiFamily({
      ...CONFIG,
      tokenizer: {
        ...resources,
        definition: {
          ...resources.definition,
          configuration: { ...resources.definition.configuration, revision: '2' },
        },
      },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(SOL), live())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: OPENAI_OWNER,
        diagnostic: 'tokenizer-definition-mismatch',
      },
    })
  })

  it('an executor that cannot acquire the tokenizer reports unavailable, never another encoding', async () => {
    const family = createOpenAiFamily({
      ...CONFIG,
      executor: {
        acquire: () => ({ failure: { kind: 'unavailable', diagnostic: 'provider-down' } }),
      },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(SOL), live())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: OPENAI_OWNER,
        diagnostic: 'tokenizer-unavailable',
      },
    })
  })

  it('an acquire that is cancelled before it starts calls nothing and is unavailable', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await composeFamilies([FAMILY]).acquire(supplierOf(SOL), controller.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic: 'cancelled' },
    })
  })

  it('an acquire that is cancelled while the family works gives no binding', async () => {
    // The table reads `aborted` once before it calls the family; the family reads it again.
    let reads = 0
    const signal: AbortSignal = Object.create(AbortSignal.prototype, {
      aborted: { get: () => reads++ > 0 },
    })
    expect(await composeFamilies([FAMILY]).acquire(supplierOf(SOL), signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OPENAI_OWNER, diagnostic: 'cancelled' },
    })
  })
})

it('forwards the signal and propagates tokenizer cleanup failure from binding release', async () => {
  const controller = new AbortController()
  const entered: AbortSignal[] = []
  const family = createOpenAiFamily({
    ...CONFIG,
    executor: {
      acquire(definition, signal) {
        entered.push(signal)
        const acquired = CONFIG.executor.acquire(definition, signal)
        if ('failure' in acquired) return acquired
        return {
          ok: {
            tokenizer: acquired.ok.tokenizer,
            async release() {
              await acquired.ok.release()
              return { failure: { kind: 'unavailable', diagnostic: 'cleanup-failed' } }
            },
          },
        }
      },
    },
  })
  const acquired = await composeFamilies([family]).acquire(supplierOf(SOL), controller.signal)
  if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
  expect(entered).toEqual([controller.signal])
  await expect(acquired.ok.release()).rejects.toThrow('tokenizer-unavailable')
})

it('releases an acquired tokenizer when the binding constructor rejects its decoder limits', async () => {
  let releases = 0
  const family = createOpenAiFamily({
    ...CONFIG,
    limits: { ...CONFIG.limits, maxReasoningText: 0 },
    executor: {
      acquire(definition, signal) {
        const acquired = CONFIG.executor.acquire(definition, signal)
        if ('failure' in acquired) return acquired
        return {
          ok: {
            tokenizer: acquired.ok.tokenizer,
            async release() {
              releases += 1
              return acquired.ok.release()
            },
          },
        }
      },
    },
  })
  await expect(
    composeFamilies([family]).acquire(supplierOf(SOL), new AbortController().signal),
  ).rejects.toThrow(RangeError)
  expect(releases).toBe(1)
})
