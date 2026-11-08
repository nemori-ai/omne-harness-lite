import { judgeContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolMaterialInstant,
  type FactBatch,
  type ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { ledgerWorld, type Principal } from './ledger.ts'
import { TENANT_A } from './app.ts'
import { openStorage } from '../windows-composition/storage.ts'

export function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

export async function liveBody(
  storage: Awaited<ReturnType<typeof openStorage>>,
  wrapStore: (store: ToolMaterialStore<Principal>) => ToolMaterialStore<Principal>,
) {
  const world = await ledgerWorld(TENANT_A)
  let now = Date.parse('2026-11-08T00:00:00.000Z')
  const ledger = world.ledgerOver(storage.store, {
    provider: storage.materialProvider,
    store: wrapStore(storage.materialStore),
    clock: {
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    },
  })
  const access = world.access
  const evidence = { owner: 'live-body', record: 'source', revision: '1', digest: 'sha256:source' }
  const context = async (name: string) => ({
    ...access,
    operation: ok(decodeToolOperationId(name)),
    instance: ok(decodeToolInstanceId('live-body')),
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
  const rawBytes = new TextEncoder().encode('independent native and process bytes')
  const raw = ok(
    await ledger.rawCustody.preserve({
      ...access,
      operation: ok(decodeToolOperationId('raw')),
      codec: { owner: 'fixture', name: 'text', revision: '1', digest: 'sha256:text' },
      bytes: rawBytes,
      source: evidence,
    }),
  )
  const text = '中🙂'.repeat(10_000)
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'body',
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged)) throw new Error(JSON.stringify(judged.rejected))
  const pointer = ok(
    await ledger.finalCustody.preserveFinal({
      ...access,
      start,
      source: evidence,
      operation: ok(decodeToolOperationId('final')),
      final: {
        kind: 'final',
        raw,
        result: {
          content: [judged.ok],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [raw.content],
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
    events: [
      {
        event: 'process',
        fact: {
          kind: 'process',
          blocks: [
            {
              index: 'output',
              mode: 'replace',
              state: 'open',
              sequence: '0',
              trim: null,
              content: {
                kind: 'file',
                id: judged.ok.id,
                visibility: { toHuman: true, toModel: false },
                ref: raw.content,
                transcript: null,
              },
            },
          ],
        },
      },
      { event: 'final', fact: pointer },
    ],
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
  if (value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
  const records = async () => {
    const loaded = await storage.store.read({ kind: 'call', tenant: TENANT_A, call: access.call })
    if (loaded.kind !== 'complete') throw new Error(JSON.stringify(loaded))
    return loaded.records
  }
  const body = (await records()).find(
    row => row.kind === 'material' && row.material.purpose === 'body',
  )
  if (body?.kind !== 'material') throw new Error('body material missing')
  return {
    ledger,
    access,
    value,
    body: body.material.material,
    records,
    raw,
    rawBytes,
    expiresAt: Date.parse(value.original.retention.expiresAt),
    setNow: (value: number) => {
      now = value
    },
    request: {
      ...access,
      result: state.result,
      bodyId: value.original.bodyId,
      after: null,
      maxBytes: 8,
    },
  }
}
