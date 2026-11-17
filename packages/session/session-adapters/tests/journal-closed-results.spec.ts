import { expect, it } from 'vitest'
import { decodeConsumptionId, type ProducedResult } from '@omne-harness/agent-contract'
import { sqlScene } from './fixtures/sql-scene.ts'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { compactionFixtureTask } from './fixtures/compaction.ts'

it('retires a completed result from current work and recognizes its original value after a cold rebuild', async () => {
  const s = await sqlScene('closed-result-original')
  try {
    ok(await s.view.journal.open(s.openInput))
    const consumption = ok(decodeConsumptionId('closed-compaction'))
    const result: ProducedResult = {
      producer: { kind: 'compaction', task: compactionFixtureTask },
      version: '1',
      delivery: null,
      source: evidence('result'),
    }
    const input = {
      ...s.access,
      execution: s.execution,
      operation: operation('complete-result'),
      result,
      consumption,
      transfer: {
        kind: 'processed' as const,
        result,
        consumption,
        completion: evidence('processed'),
      },
      release: { kind: 'confirmed' as const, receipt: evidence('provider-release') },
    }
    const original = ok(await s.view.journal.recordResult(input))
    expect(
      ok(await s.fresh().journal.load({ ...s.access, execution: s.execution })).results,
    ).toEqual([])
    const recognized = ok(
      await s.fresh().journal.recordResult({ ...input, operation: operation('recognize-result') }),
    )
    expect(recognized.revision).toEqual(original.revision)
    expect(
      await s.fresh().journal.recordResult({
        ...input,
        operation: operation('conflicting-result'),
        transfer: { ...input.transfer, completion: evidence('different-completion') },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
  } finally {
    await s.close()
  }
})
