import { expect, it } from 'vitest'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { modelTokenizersKey } from '@omne-harness/tokenizer-tiktoken/cordis'
import { LOCAL_TOKENIZERS } from '../../../src/local/operator-defaults.ts'
import { modelTokenizersRow } from '../../../src/rows/model-tokenizers/index.ts'
import { withLiveRows } from './support.ts'

it('owns one bounded executor and waits for its workers on application shutdown', async () => {
  const { value: tokenizers, run } = await withLiveRows(
    {
      rows: [
        {
          id: 'model-tokenizers',
          plugin: 'modelTokenizersRow',
          config: { ...LOCAL_TOKENIZERS, workers: 1, maxLeases: 2 },
        },
      ],
      plugins: { modelTokenizersRow },
      probe: [modelTokenizersKey],
    },
    async ctx => {
      const provider = ctx.get(modelTokenizersKey)
      if (provider === undefined) throw new Error('tokenizer provider was not injected')
      expect(provider).not.toHaveProperty('close')
      const signal = new AbortController().signal
      const definition = openAiTokenizerResources().definition
      const first = provider.acquire(definition, signal)
      const second = provider.acquire(definition, signal)
      if ('failure' in first || 'failure' in second) throw new Error('two leases must fit')
      try {
        expect(provider.acquire(definition, signal)).toHaveProperty('failure.kind', 'unavailable')
        expect(provider.snapshot()).toMatchObject({ workers: 1, leases: 2 })
        expect(await first.ok.tokenizer.count([{ kind: 'text', text: 'hello' }])).toEqual({
          ok: { tokens: '1' },
        })
      } finally {
        await first.ok.release()
        await second.ok.release()
      }
      expect(provider.snapshot().leases).toBe(0)
      return provider
    },
  )
  expect(run.result.exitCode).toBe(0)
  expect(tokenizers.snapshot()).toMatchObject({
    workers: 0,
    leases: 0,
    queuedJobs: 0,
    runningJobs: 0,
  })
}, 30_000)
