import type { Context } from '@deepseek-ai/cordis'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { createTiktokenExecutor } from '@omne-harness/tokenizer-tiktoken'
import {
  ModelTokenizersService,
  modelTokenizersKey,
  type ModelTokenizers,
} from '@omne-harness/tokenizer-tiktoken/cordis'
import { defineRow, type RowHandle } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'
import { modelTokenizersConfig } from './config.ts'

class SharedTokenizers extends ModelTokenizersService {
  readonly acquire: ModelTokenizers['acquire']
  readonly snapshot: ModelTokenizers['snapshot']

  constructor(ctx: Context, executor: ModelTokenizers) {
    super(ctx)
    this.acquire = (definition, signal) => executor.acquire(definition, signal)
    this.snapshot = () => executor.snapshot()
  }
}

async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
  const limits = modelTokenizersConfig.parse(raw)
  const initializing = createTiktokenExecutor({
    resources: [openAiTokenizerResources()],
    limits,
  })
  ctx.effect(() => async () => {
    const result = await initializing
    if ('failure' in result) return
    const closed = await result.ok.close()
    if ('failure' in closed) throw new Error('model-tokenizers: worker cleanup failed')
  })
  const created = await initializing
  if ('failure' in created)
    throw new Error(`model-tokenizers: initialization failed (${created.failure.kind})`)
  const executor = created.ok
  const close = () => executor.close()
  ctx.fiber.assertActive()
  new SharedTokenizers(ctx, executor)
  return {
    async stop(deadline) {
      const timer = monotonicClock.after(deadline - monotonicClock.now())
      try {
        const result = await Promise.race([
          close().then(outcome =>
            'failure' in outcome
              ? ({ kind: 'failed', detail: 'tokenizer workers did not close' } as const)
              : ({ kind: 'settled' } as const),
          ),
          timer.promise.then(
            () => ({ kind: 'incomplete', detail: 'tokenizer workers are still closing' }) as const,
          ),
        ])
        return result
      } finally {
        timer.cancel()
      }
    },
  }
}

export const modelTokenizersRow = defineRow({
  row: 'model-tokenizers',
  implementation: 'real',
  manifest: { provides: [modelTokenizersKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: modelTokenizersConfig,
  body,
})
