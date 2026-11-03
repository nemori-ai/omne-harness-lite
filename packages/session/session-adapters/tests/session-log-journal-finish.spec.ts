// The terminal of an ordinary completion on the production session-log Journal, with the Session
// finish check of the same storage commit (Agent SPEC "条件终结"; session-contract PA-02). The
// Agent takes the initial input (I0), commits the main reply Ja, F1, F2 and prepareFinish before
// AD-02 interpreted its `input-taken` event: Session still holds the initial input as pending for
// this Run, so the check answers a conflict. tryFinish then answers FinishResult.changed, not
// Failure.changed, and writes nothing. Once AD-02 commits the interpretation (`run.batch-taken`
// through `commitLog`), the same tryFinish ends the execution, and the reply is in the Session
// history as `message.assistant`. On the node:sqlite double that runs the published participant
// modules, with the AD-02 plugin on a real Cordis root.
import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { JournalCommit } from '@omne-harness/agent-contract'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { admitted, applied, load, prepared } from './fixtures/main-reply.ts'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { cordisScene, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const count = (s: SqlScene, table: string): number =>
  Number(s.controls?.select(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? -1)
const kinds = (s: SqlScene): string[] =>
  (s.controls?.select(`SELECT kind FROM sl_entry ORDER BY position`).rows ?? []).map(row =>
    String(row[0]),
  )

/** I0: the batch of the initial input is taken, with its `input-taken` event. */
async function take(s: SqlScene, authority: JournalCommit<string>['authority']) {
  const loaded = await load(s)
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('take'),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

/** F1, F2 and prepareFinish of a complete candidate, as the coordinator writes them. */
async function prepareEnd(s: SqlScene, authority: JournalCommit<string>['authority']) {
  const commit = async (step: 'F1' | 'F2', finish: JournalCommit<string>['finish']) => {
    const loaded = await load(s)
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`end-${step}`),
        authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, position: step },
        state: { kind: 'settling' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: finish === null ? null : { ...finish, inputWatermark: loaded.inputWatermark },
      }),
    )
  }
  await commit('F1', {
    origin: evidence('end-origin'),
    conclusion: { kind: 'complete' },
    failure: null,
    inputWatermark: evidence('replaced'),
    conditions: evidence('end-conditions'),
  })
  await commit('F2', null)
  const settling = await load(s)
  if (settling.state.kind !== 'settling') throw new Error('settling expected')
  ok(
    await s.view.journal.prepareFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('end-prepare'),
      authorization: { kind: 'advancement', authority },
      expected: settling.revision,
      candidate: settling.state.intent.candidate,
    }),
  )
  return load(s)
}

describe('tryFinish on the production session-log Journal with the PA-02 finish check', () => {
  it('a conflict of the Session check is FinishResult.changed and writes nothing; after the hand-over the same tryFinish ends the execution with the reply in the history', async () => {
    const s = await sqlScene('finish-pa02')
    try {
      const open = ok(await s.view.journal.open(s.openInput))
      const authority = open.authority
      await take(s, authority)
      const request = await prepared(s, authority, 'model-reply')
      ok(await s.view.journal.commit(await applied(s, authority, request, admitted(request))))
      const ready = await prepareEnd(s, authority)
      if (ready.state.kind !== 'settling') throw new Error('settling expected')
      const finish = {
        ...s.access,
        execution: s.execution,
        operation: operation('end'),
        authorization: { kind: 'advancement' as const, authority },
        expected: ready.revision,
        intent: ready.state.intent,
      }
      const before = { rows: count(s, 'sl_entry'), records: count(s, 'er_operation') }

      // The initial input is pending for this Run and has no SE35: PA-02 answers a conflict.
      expect(await s.view.journal.tryFinish(finish)).toEqual({
        ok: { kind: 'changed', revision: ready.revision },
      })
      expect((await load(s)).revision).toBe(ready.revision)
      expect((await load(s)).state.kind).toBe('settling')
      expect(count(s, 'sl_entry')).toBe(before.rows)
      expect(count(s, 'er_operation')).toBe(before.records)

      // AD-02 interprets the events of the execution: `input-taken` leaves the pending inputs.
      const c = await cordisScene(s)
      try {
        const interpretation = createSessionJournalInterpretationPlugin<string>({
          coordinator: () => Promise.resolve(succeed(s.access.principal)),
        })
        await c.mount(interpretation.plugin)
        const target = {
          tenant: s.access.tenant,
          session: s.access.session,
          execution: s.execution,
        }
        expect(ok(await interpretation.interpret(target)).committed).toBeGreaterThan(0)
      } finally {
        await c.dispose()
      }
      expect(kinds(s)).toContain('run.batch-taken')
      const ended = ok(await s.view.journal.tryFinish(finish))
      expect(ended.kind).toBe('ended')
      const after = await load(s)
      expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      expect(kinds(s)).toContain('message.assistant')
    } finally {
      await s.close()
    }
  })
})
