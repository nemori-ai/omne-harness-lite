import { expect, it } from 'vitest'
import { decodeActionId } from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { assistantMessage, evidence } from '@omne-harness/session-contract/testing'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

it('admissions before the verified prefix close, and a cold provider still pages them from the origin', async () => {
  const s = await sqlScene('closed-admissions')
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const model = sampleReceivedModelResult(s.access.tenant, 'closed-admissions')
    if (model.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
    const call = ok(resolveModelInvocationRef(model.delivery.key.reference, s.access.tenant)).call
    const load = async (view = s.view) =>
      ok(await view.journal.load({ ...s.access, execution: s.execution }))
    const commit = async (name: string, change: object) => {
      const loaded = await load()
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          authority,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
          ...change,
        }),
      )
    }
    const decisions = ['rejected', 'admitted', 'rejected'] as const
    for (const [index, decision] of decisions.entries())
      await commit(`reply-${String(index)}`, {
        events: [
          {
            kind: 'message',
            message: assistantMessage(`reply-${String(index)}`),
            source: evidence(`message-${String(index)}`),
          },
        ],
        replyAdmission: {
          step: (await load()).checkpoint.step,
          action: ok(decodeActionId(`action-${String(index)}`)),
          call,
          resultVersion: String(index),
          decision,
          source: evidence(`reply-${String(index)}`),
        },
      })
    const readAll = async (view = s.view) => {
      const { through } = (await load(view)).replyAdmissions
      const page = ok(
        await view.journal.readReplyAdmissions({
          ...s.access,
          execution: s.execution,
          from: { kind: 'origin' },
          through,
          after: null,
          limit: 10,
        }),
      )
      if (page.kind !== 'page') throw new Error(`page expected, got ${page.kind}`)
      return page
    }
    const warm = await readAll()
    expect(warm.items.map(item => item.fact.decision)).toEqual([...decisions])
    const firstTwo = ok(
      await journal.readReplyAdmissions({
        ...s.access,
        execution: s.execution,
        from: { kind: 'origin' },
        through: warm.through,
        after: null,
        limit: 2,
      }),
    )
    if (firstTwo.kind !== 'page') throw new Error('page expected')
    // The Agent has verified the first two: the first admission closes, the prefix one stays.
    const verified = { kind: 'verified' as const, prefix: firstTwo.end }
    await commit('verified', {
      checkpoint: { ...(await load()).checkpoint, replyAdmissionRead: verified },
    })
    const open = s.controls
      ?.select(
        `SELECT item, open FROM er_item WHERE family = 'admission' AND execution = '${s.execution}' ORDER BY item`,
      )
      .rows.map(row => [String(row[0]), Number(row[1])])
    expect(open).toEqual([
      ['1', 0],
      ['2', 1],
      ['3', 1],
    ])
    const cold = s.fresh()
    expect((await readAll(cold)).items).toEqual(warm.items)
    expect((await load(cold)).replyAdmissions).toEqual((await load()).replyAdmissions)
  } finally {
    await s.close()
  }
})
