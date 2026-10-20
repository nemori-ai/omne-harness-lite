import { describe, expect, it } from 'vitest'
import type { LedgerRecord, ResultRecord } from '@omne-harness/tool'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  judgeConsumerRef,
  readToolInvocationRef,
  type Handoff,
  type ToolTask,
} from '@omne-harness/tool-contract'
import {
  dummyRequest,
  evidence,
  harness,
  judged,
  ok,
  operationId,
  principalA,
  tenantA,
  text,
  textOf,
  type Block,
} from './runtime-values.ts'

// Existing-record fixtures isolate release behavior. Late-result production belongs to a later increment.
async function existingVersions() {
  const assembly = harness()
  const invoked = await assembly.runtime.invoke({
    principal: principalA,
    tenant: tenantA,
    request: dummyRequest(),
  })
  if (invoked.kind !== 'accepted' || invoked.state.phase !== 'settled')
    throw new Error('fixture did not settle')
  const access = { principal: principalA, tenant: tenantA, reference: invoked.reference }
  const { call } = readToolInvocationRef(invoked.reference)
  const domain = { kind: 'call', tenant: tenantA, call } as const
  const saved = await assembly.store.read(domain)
  if (saved.kind !== 'complete') throw new Error('fixture store unreadable')
  const original = saved.records.find(record => record.kind === 'result')
  const callRecord = saved.records.find(record => record.kind === 'call')
  if (original?.kind !== 'result' || callRecord?.kind !== 'call')
    throw new Error('fixture records missing')
  const late = (ordinal: number): ResultRecord<Block> => ({
    ...original.result,
    result: ok(decodeToolResultVersion(`fixture-late-${ordinal}`)),
    relation: 'late',
    actual: { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence(`fixture-effect-${ordinal}`) },
    value: { ...original.result.value, content: [text(`late-${ordinal}`, `late ${ordinal}`)] },
    delivery: {
      kind: 'pending',
      delivery: ok(decodeToolDeliveryId(`fixture-delivery-${ordinal}`)),
      consumer: original.result.delivery.consumer,
    },
    source: evidence(`fixture-late-source-${ordinal}`),
    settledBy: operationId(`fixture-late-operation-${ordinal}`),
  })
  const versions = [original.result, late(1), late(2)] as const
  const revision = ok(decodeToolRevision('2'))
  const state = judged({
    ...callRecord.call.state,
    revision,
    source: evidence('fixture-existing-state'),
    supplements: versions.slice(1).map(record => {
      if (record.actual === null) throw new Error('fixture late terminal missing')
      return {
        result: record.result,
        actual: record.actual,
        delivery: record.delivery,
        source: record.source,
      }
    }),
  })
  const taskFor = (record: ResultRecord<Block>): ToolTask => ({
    kind: 'deliver',
    operation: record.settledBy,
    state: 'pending',
    diagnostic: null,
    result: record.result,
    delivery: record.delivery.delivery,
    consumer: record.delivery.consumer,
  })
  const records: LedgerRecord<Block>[] = [
    { kind: 'call', call: { ...callRecord.call, state } },
    ...versions.slice(1).flatMap(record => [
      { kind: 'result' as const, result: record },
      { kind: 'task' as const, task: taskFor(record) },
    ]),
  ]
  expect(new Set(versions.map(record => record.result)).size).toBe(3)
  expect(new Set(versions.map(record => record.delivery.delivery)).size).toBe(3)
  expect(new Set(versions.map(record => record.settledBy)).size).toBe(3)
  for (const record of versions) {
    expect(record.call).toBe(call)
    expect(record.tenant).toEqual(tenantA)
    expect(ok(judgeConsumerRef(record.delivery.consumer))).toEqual(dummyRequest().consumer)
  }
  expect(state).toMatchObject({
    terminal: original.result.terminal,
    execution: { kind: 'not-started' },
    effect: { kind: 'not-started' },
    result: original.result.result,
    delivery: original.result.delivery,
  })
  expect(
    await assembly.store.commit({
      domain,
      expected: saved.revision,
      revision,
      writes: records.map(record => ({ kind: 'put', record })),
    }),
  ).toEqual({ kind: 'committed' })
  const tasks = async () =>
    ok(
      await assembly.ledger.commands.loadRecovery({ principal: principalA, tenant: tenantA, call }),
    ).tasks.filter(task => task.kind === 'deliver')
  expect(await tasks()).toEqual(versions.map(taskFor))
  const current = async () => {
    const found = ok(await assembly.runtime.queries.lookup(access))
    if (found.kind !== 'found' || found.state.phase !== 'settled')
      throw new Error('lost the settled call')
    return judged(found.state)
  }
  const read = (record: ResultRecord<Block>) =>
    assembly.runtime.queries.readResult({ ...access, result: record.result, after: null }).then(ok)
  for (const record of versions) {
    const page = await read(record)
    expect(page).toMatchObject({
      result: record.result,
      delivery: record.delivery.delivery,
      relation: record.relation,
      actualTerminal: record.actual,
      source: record.source,
      value: record.value,
      next: null,
    })
  }
  expect((await current()).supplements.map(entry => entry.delivery)).toEqual(
    versions.slice(1).map(record => record.delivery),
  )
  return { assembly, access, versions, current, tasks, read }
}

const handoffs: readonly Handoff[] = [
  { kind: 'retained', custody: evidence('fixture-kept', dummyRequest().consumer.owner) },
  { kind: 'processed', completion: evidence('fixture-done', dummyRequest().consumer.owner) },
]

describe('16 release isolation on existing version fixtures (P08)', () => {
  it.each([
    { order: 'original first', indexes: [0, 1, 2] as const },
    { order: 'late first', indexes: [2, 1, 0] as const },
  ])('16 release: $order changes only the selected delivery and task', async ({ indexes }) => {
    for (const handoff of handoffs) {
      const f = await existingVersions()
      const contents = await Promise.all(f.versions.map(f.read))
      expect(contents.map(page => page.value.content.map(textOf).join(''))).toEqual([
        expect.stringContaining('tool unavailable'),
        'late 1',
        'late 2',
      ])
      for (const index of indexes) {
        const target = f.versions[index]
        const before = await f.current()
        const pendingTasks = await f.tasks()
        const commits = f.assembly.store.commits
        const input = {
          ...f.access,
          result: target.result,
          delivery: target.delivery.delivery,
          consumer: target.delivery.consumer,
          evidence: handoff,
        }
        const outcome = await f.assembly.runtime.commands.releaseDelivery(input)
        if (outcome.kind !== 'released') throw new Error(JSON.stringify(outcome))
        expect(f.assembly.store.commits).toBe(commits + 1)
        const after = await f.current()
        expect(after).toMatchObject({ phase: 'settled', result: f.versions[0].result })
        expect(after.delivery).toEqual(index === 0 ? outcome.receipt : before.delivery)
        expect(after.supplements).toEqual(
          before.supplements.map(entry =>
            entry.result === target.result ? { ...entry, delivery: outcome.receipt } : entry,
          ),
        )
        expect(outcome.receipt).toMatchObject({
          kind: 'released',
          delivery: target.delivery.delivery,
          consumer: target.delivery.consumer,
          evidence: { owner: '@omne-harness/tool' },
        })
        expect(await f.tasks()).toEqual(
          pendingTasks.filter(task => task.operation !== target.settledBy),
        )
        expect(await Promise.all(f.versions.map(f.read))).toEqual(contents)
        expect(await f.assembly.runtime.commands.releaseDelivery(input)).toEqual(outcome)
        expect(f.assembly.store.commits).toBe(commits + 1)
      }
      expect(await f.tasks()).toEqual([])
    }
  })
})
