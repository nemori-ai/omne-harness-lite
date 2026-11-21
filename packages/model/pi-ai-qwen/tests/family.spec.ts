import { describe, expect, it } from 'vitest'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createQwenFamily, QWEN_OWNER } from '@omne-harness/pi-ai-qwen'
import { CONFIG, FAMILY, RECORD, supplierOf } from './support/qwen.ts'

const live = () => new AbortController().signal

describe('createQwenFamily', () => {
  it('refuses a configuration that no binding could use', () => {
    expect(() =>
      createQwenFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '-1' } }),
    ).toThrow(RangeError)
    expect(() =>
      createQwenFamily({ ...CONFIG, margin: { ...CONFIG.margin, percent: '1.5' } }),
    ).toThrow(RangeError)
  })

  it('cannot be composed with a second family of the same owner', () => {
    expect(() => composeFamilies([FAMILY, createQwenFamily(CONFIG)])).toThrow(RangeError)
  })
})

describe('acquire', () => {
  it('gives one chat-completions binding for exactly its supplier and adoption, taking WAV speech and no image', async () => {
    const supplier = supplierOf()
    const acquired = await composeFamilies([FAMILY]).acquire(supplier, live())
    if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
    const binding = acquired.ok
    expect(binding.supplier).toEqual(supplier)
    expect(binding.adoption).toEqual(recordAdoption(QWEN_OWNER, RECORD))
    expect(binding.endpoint).toBe('chat-completions')
    expect(binding.replayFormat).toBe('qwen-reasoning-text-v1')
    const speech = { storage: 's', key: 'k', mediaType: 'audio/wav', bytes: '9', digest: 'd' }
    expect(binding.mediaLimits(speech)).toEqual({
      mediaTypes: ['audio/wav'],
      maxBytes: 10_485_760,
      image: null,
    })
    expect(binding.mediaLimits({ ...speech, mediaType: 'audio/mpeg' })).toEqual(
      binding.mediaLimits(speech),
    )
    expect(binding.mediaLimits({ ...speech, mediaType: 'image/png' })).toBeNull()
    expect(binding.mediaLimits({ ...speech, mediaType: 'application/pdf' })).toBeNull()
    expect(binding.counting).toBe(binding.meter.basis)
    expect(binding.counting.tokenization).toEqual({
      kind: 'local',
      definition: openAiTokenizerResources().definition,
    })
    await binding.release()
    await expect(binding.release()).resolves.toBeUndefined()
  })

  it('an adoption that no record has is not installed; no name or prefix matches it', async () => {
    const contributions = composeFamilies([FAMILY])
    const supplier = supplierOf()
    for (const adoption of [
      { ...supplier.adoption, name: 'qwen/qwen3.8-omni' },
      { ...supplier.adoption, revision: '2' },
      { ...supplier.adoption, digest: '0'.repeat(64) },
    ])
      expect(await contributions.acquire({ ...supplier, adoption }, live())).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: QWEN_OWNER,
          diagnostic: 'adoption-not-installed',
        },
      })
  })

  it('a tokenizer definition other than the record names is unavailable', async () => {
    const resources = openAiTokenizerResources()
    const family = createQwenFamily({
      ...CONFIG,
      tokenizer: {
        ...resources,
        definition: {
          ...resources.definition,
          configuration: { ...resources.definition.configuration, revision: '2' },
        },
      },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(), live())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: QWEN_OWNER,
        diagnostic: 'tokenizer-definition-mismatch',
      },
    })
  })

  it('an executor that cannot acquire the tokenizer reports unavailable, never another encoding', async () => {
    const family = createQwenFamily({
      ...CONFIG,
      executor: {
        acquire: () => ({ failure: { kind: 'unavailable', diagnostic: 'provider-down' } }),
      },
    })
    expect(await composeFamilies([family]).acquire(supplierOf(), live())).toEqual({
      failure: { kind: 'unavailable', dependency: QWEN_OWNER, diagnostic: 'tokenizer-unavailable' },
    })
  })

  it('an acquire that is cancelled before it starts is unavailable', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await composeFamilies([FAMILY]).acquire(supplierOf(), controller.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: QWEN_OWNER, diagnostic: 'cancelled' },
    })
  })

  it('releases an acquired tokenizer when the binding constructor rejects its decoder limits', async () => {
    let releases = 0
    const family = createQwenFamily({
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
    await expect(composeFamilies([family]).acquire(supplierOf(), live())).rejects.toThrow(
      RangeError,
    )
    expect(releases).toBe(1)
  })

  it('propagates a tokenizer cleanup failure from binding release', async () => {
    const family = createQwenFamily({
      ...CONFIG,
      executor: {
        acquire(definition, signal) {
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
    const acquired = await composeFamilies([family]).acquire(supplierOf(), live())
    if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
    await expect(acquired.ok.release()).rejects.toThrow('tokenizer-unavailable')
  })
})
