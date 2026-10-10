import { expect, test, vi } from 'vitest'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import { createAssemblyManifestStore } from '../src/index.ts'
import { database, input } from './support.ts'

test('both persisted projection reads use the supplied evaluator and reject changed invalid data', async () => {
  await database(async storage => {
    const owner = createAssetEvaluator()
    const judgeEffectiveAssembly = vi.fn(owner.judgeEffectiveAssembly)
    const evaluator = { ...owner, judgeEffectiveAssembly }
    const store = createAssemblyManifestStore(storage, { evaluator })
    try {
      expect(await store.append('session', 0, input(1, 'given'))).toHaveProperty('seq', 1)
      const first = await store.readEvaluation('session')
      expect(first).toHaveProperty('evaluationRef', 'given_a')
      expect(await store.readEvaluation('session')).toEqual(first)
      expect(await store.readGiven('session', 1)).toHaveProperty('record.seq', 1)
      expect(judgeEffectiveAssembly).toHaveBeenCalledTimes(3)
      const invalid = input(2, 'given', 'given_bad')
      expect(
        await store.append('session', 1, {
          ...invalid,
          content: {
            ...invalid.content,
            evaluation: { ...invalid.content.evaluation, unexpected: true },
          },
        }),
      ).toHaveProperty('seq', 2)
      expect(await store.readEvaluation('session')).toEqual({
        failure: 'unavailable',
        reason: 'invalid_evaluation_content',
      })
      expect(await store.readGiven('session', 2)).toEqual({
        failure: 'unavailable',
        reason: 'invalid_evaluation_content',
      })
      expect(judgeEffectiveAssembly).toHaveBeenCalledTimes(5)
    } finally {
      await store.close()
    }
  })
})
