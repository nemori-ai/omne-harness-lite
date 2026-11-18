import { expect, it } from 'vitest'
import type { AgentJournal, SettlementRequest } from '@omne-harness/agent-contract'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { keptToolCall } from './fixtures/tool-call.ts'

// A Run that waits on `calls` tool calls is cancelled: the cancellation is established, then judged.
async function cancelled(name: string, calls: number) {
  const s = await sqlScene(name, { cancellation: 'installed' })
  const journal = s.view.journal
  const { authority } = ok(await journal.open(s.openInput))
  const tools = []
  for (let at = 0; at < calls; at += 1)
    tools.push(
      await keptToolCall(
        { view: s.view, access: s.access, execution: s.execution },
        `tool-${String(at)}`,
      ),
    )
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  const waits = tools.map(tool => ({ kind: 'producer' as const, pending: tool.pending }))
  const first = tools[0]!
  ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('tool-wait'),
      authority,
      expected: loaded.revision,
      checkpoint: {
        ...loaded.checkpoint,
        batch: {
          ...first.batch,
          actions: tools.flatMap(tool => tool.batch.actions),
          barrier: {
            kind: 'open',
            evidence: evidence('action-barrier'),
            approved: [first.pending.action, ...tools.slice(1).map(tool => tool.pending.action)],
          },
          slots: tools.flatMap(tool => tool.batch.slots),
        },
      },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: tools.map(tool => ({
        action: tool.pending.action,
        pending: tool.pending,
        authority,
      })),
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const control = operation('cancel-control')
  ok(
    await journal.control({
      ...s.access,
      execution: s.execution,
      operation: control,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  ok(
    await journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('cancel-intent'),
      target: control,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
  const common = async (name: string) => {
    const snapshot = ok(await journal.load({ ...s.access, execution: s.execution }))
    const record = snapshot.controls.find(item => item.operation === control)
    if (record === undefined) throw new Error('the control should be saved')
    return {
      snapshot,
      common: {
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authorization: {
          kind: 'cancel' as const,
          control,
          source: record.stages.accepted.source,
        },
        expected: snapshot.revision,
        installation: testCancellationPolicyInstallation.record,
      },
    }
  }
  const establish: SettlementRequest<string> = {
    ...(await common('cancel-establish')).common,
    kind: 'establish-cancellation',
    predecessor: null,
  }
  const established = ok(await journal.commitSettlement(establish))
  const second = await common('cancel-judge')
  const route = second.snapshot.settlement.route
  if (route === null) throw new Error('a route is expected')
  const judge: SettlementRequest<string> = {
    ...second.common,
    kind: 'judge-cancellation',
    candidate: route.candidate,
    route: route.record,
  }
  const judged = ok(await journal.commitSettlement(judge))
  return { s, establish, established, judge, judged }
}

// The bytes of the answer the store keeps for an operation, as the publication wrote them.
function answerBytes(s: SqlScene, name: string): number {
  const rows = s.controls?.select(
    `SELECT body FROM er_item WHERE family = 'answer' AND item = '${operation(name)}'`,
  ).rows
  const body = rows?.[0]?.[0]
  if (!(body instanceof Uint8Array)) throw new Error(`no stored answer of ${name}`)
  return Buffer.byteLength(unpackText(body), 'utf8')
}

const repeat = (journal: AgentJournal<string>, request: SettlementRequest<string>) =>
  journal.commitSettlement(request)

it('a settlement answer names the records the Journal holds: what the store keeps for it does not grow with the work', async () => {
  const small = await cancelled('settle-answer-01', 1)
  const large = await cancelled('settle-answer-12', 12)
  try {
    expect(large.judged).toMatchObject({ kind: 'judge-cancellation' })
    // Twelve waiting calls against one: only the digits of the revisions and positions may differ.
    for (const name of ['cancel-establish', 'cancel-judge']) {
      const grown = answerBytes(large.s, name) - answerBytes(small.s, name)
      expect(Math.abs(grown), name).toBeLessThan(32)
    }
  } finally {
    await small.s.close()
    await large.s.close()
  }
})

it('a repeat of a settlement through a replica that has only the store answers what the original answered', async () => {
  const { s, establish, established, judge, judged } = await cancelled('settle-answer-repeat', 3)
  try {
    const cold = s.fresh().journal
    expect(ok(await repeat(cold, judge))).toEqual(judged)
    expect(ok(await repeat(cold, establish))).toEqual(established)
    expect(ok(await repeat(s.view.journal, judge))).toEqual(judged)
  } finally {
    await s.close()
  }
})
