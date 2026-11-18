import { expect, it } from 'vitest'
import {
  decodeActionId,
  type DurableEvidence,
  type Material,
  type PendingCall,
} from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import { canonical } from '../src/testing/canonical.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

const CONSUMER = { owner: 'suite', work: 'work', position: 'at', purpose: 'action' }

const factsMaterial = (name: string): Material<ContentBlock> => ({
  kind: 'facts',
  schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
  value: { kind: 'string', value: name },
})

it('a preserved material closes once the checkpoint stops naming it, and is read back by its source', async () => {
  const s = await sqlScene('closed-materials')
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
    const preserve = (identity: string, value: Material<ContentBlock>, view = s.view) =>
      view.materials.preserve({
        ...s.access,
        execution: s.execution,
        identity,
        consumer: CONSUMER,
        value,
      })
    const result = sampleReceivedModelResult(s.access.tenant, 'closed-materials')
    if (result.delivery.producer !== 'model' || result.delivery.key.kind !== 'result')
      throw new Error('fixture: a Model result entry')
    const { reference } = result.delivery.key
    const pendingOn = (fixed: DurableEvidence): PendingCall => ({
      kind: 'model',
      purpose: 'main',
      action: ok(decodeActionId('action')),
      reference,
      consumption: result.consumption,
      position: result.consumer,
      fixed,
    })
    const hold = async (name: string, calls: readonly PendingCall[]) => {
      const loaded = await load()
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          authority,
          expected: loaded.revision,
          checkpoint: { ...loaded.checkpoint, calls },
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
        }),
      )
    }
    const open = (source: DurableEvidence) =>
      s.controls
        ?.select(
          `SELECT open FROM er_item WHERE family = 'material' AND item = '${canonical(source).replaceAll("'", "''")}'`,
        )
        .rows.map(row => Number(row[0]))

    const first = factsMaterial('first')
    const kept = ok(await preserve('a', first))
    const named = ok(await preserve('named', factsMaterial('named')))
    expect(open(kept)).toEqual([1])
    // The checkpoint names one of the two: the other closes with this move.
    await hold('names-one', [pendingOn(named)])
    expect(open(kept)).toEqual([0])
    expect(open(named)).toEqual([1])

    expect(ok(await s.view.materials.read({ ...s.access, source: kept }))).toEqual(first)
    expect(ok(await s.fresh().materials.read({ ...s.access, source: kept }))).toEqual(first)
    // The same identity again: the closed material answers, the same value or a refused other one.
    expect(ok(await preserve('a', first))).toEqual(kept)
    expect(ok(await preserve('a', first, s.fresh()))).toEqual(kept)
    expect(await preserve('a', factsMaterial('another'))).toMatchObject({
      failure: { kind: 'invalid' },
    })
    // Equal content stands in only while its material is open.
    const again = ok(await preserve('b', first))
    expect(again).not.toEqual(kept)
    expect(ok(await preserve('c', first))).toEqual(again)

    // A material the checkpoint names stays open across later moves.
    await hold('names-it-still', [pendingOn(named)])
    await hold('names-none', [])
    expect(open(named)).toEqual([0])
    expect(ok(await s.fresh().materials.read({ ...s.access, source: named }))).toEqual(
      factsMaterial('named'),
    )
  } finally {
    await s.close()
  }
})
