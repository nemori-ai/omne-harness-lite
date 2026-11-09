// A settled call over the real SQL ledger and body store whose final planned a text body over the
// inline threshold: the offloaded original with its body entry, due index entry and fixed expiry.
import { randomBytes } from 'node:crypto'
import { judgeContentBlock } from '@omne-harness/content-block'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolInstant,
  type FactBatch,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolBodyStore } from '../../src/index.ts'
import { TENANT_A, type App } from './app.ts'
import { ledgerWorld } from './ledger.ts'

export function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

export const evidence = {
  owner: 'sweep-live',
  record: 'source',
  revision: '1',
  digest: 'sha256:source',
}

/** A settled call whose final planned a 70 KiB text body, over the SQL ledger and body store. */
export async function settledOffloaded(app: App, tenant = TENANT_A, text = 'x'.repeat(70 * 1024)) {
  const world = await ledgerWorld(tenant)
  let now = '2026-11-10T00:00:00.000Z'
  const permitKey = { secret: randomBytes(32) }
  const clock = { now: () => ok(decodeToolInstant(now)) }
  const ledger = world.ledgerOver(app.store, {
    bodies: {
      store: createSqlToolBodyStore({ ...app.options, permitKey, clock }),
      permitKey,
      clock,
    },
  })
  const access = world.access
  const context = async (name: string) => ({
    ...access,
    operation: ok(decodeToolOperationId(name)),
    instance: ok(decodeToolInstanceId('sweep-live')),
    generation: '1',
    expected: ok(await ledger.commands.loadRecovery(access)).state.revision,
  })
  ok(await ledger.admissions.admit(world.input))
  const preparation = ok(
    await ledger.commands.planPreparation({
      ...(await context('prepare')),
      request: world.input.request,
      purpose: 'initial',
      environmentAdoption: {
        owner: 'fixture',
        name: 'environment',
        revision: '1',
        digest: 'sha256:env',
      },
    }),
  )
  ok(
    await ledger.commands.prepared({
      ...(await context('prepared')),
      preparation,
      resources: evidence,
    }),
  )
  ok(await ledger.commands.enqueue(await context('enqueue')))
  const start = ok(await ledger.commands.prepareStart(await context('start'))).start
  ok(
    await ledger.commands.recordStart({
      ...(await context('started')),
      invocation: start,
      outcome: { kind: 'started', acceptance: evidence },
    }),
  )
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'answer',
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged)) throw new Error(JSON.stringify(judged.rejected))
  const planned = ok(
    await ledger.finalPlanner.planFinal({
      ...access,
      start,
      source: evidence,
      operation: ok(decodeToolOperationId('final')),
      final: {
        kind: 'final',
        result: {
          content: [judged.ok],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        },
        terminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence },
      },
    }),
  )
  const batch: FactBatch = {
    start,
    source: evidence,
    batch: 'final',
    after: null,
    cursor: 'final/end',
    events: [{ event: 'final', fact: planned }],
  }
  ok(await ledger.commands.receiveFacts({ ...access, start, batch }))
  const task = ok(await ledger.commands.loadRecovery(access)).tasks.find(
    task => task.kind === 'settle',
  )
  if (task?.kind !== 'settle') throw new Error('missing settlement task')
  ok(await ledger.commands.preserveResult({ ...(await context('settle')), basis: task.basis }))
  const state = ok(await ledger.commands.loadRecovery(access)).state
  if (state.phase !== 'settled') throw new Error('result did not settle')
  const value = ok(await ledger.delivery.read({ ...access, result: state.result }))
  return {
    ledger,
    access,
    planned,
    result: state.result,
    value,
    setNow: (value: string) => {
      now = value
    },
  }
}
