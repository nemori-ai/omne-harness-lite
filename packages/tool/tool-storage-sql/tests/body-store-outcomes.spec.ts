// What the SQL body store answers when its commit does not land: every commit answer of the SQL
// storage contract other than `committed` maps to the port's `conflict`, `not-ready` or
// `unavailable`, and an unavailable answer names the operation and why it did not land.
import { randomBytes } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import type { CommitRequestV2, CommitResultV2, StoppingReply } from '@omne-harness/sql-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  decodeToolInstanceId,
  decodeToolInstant,
  signBodyPermit,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolBodyStore } from '../src/index.ts'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import { ok } from './fixtures/settled-offloaded.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

type Answer = (request: CommitRequestV2) => CommitResultV2

async function storeAnswering(answer: Answer | null) {
  const app = await openApp()
  opened.push(app)
  const permitKey = { secret: randomBytes(32) }
  const now = ok(decodeToolInstant('2026-11-10T00:00:00.000Z'))
  const storage =
    answer === null
      ? app.options.storage
      : { ...app.options.storage, commit: async (request: CommitRequestV2) => answer(request) }
  const store = createSqlToolBodyStore({
    ...app.options,
    storage,
    permitKey,
    clock: { now: () => now },
  })
  const permit = signBodyPermit(permitKey, {
    tenant: TENANT_A,
    call: ok(decodeToolCallId('outcome-call')),
    body: ok(decodeToolBodyId('outcome-body')),
    instance: ok(decodeToolInstanceId('outcome-instance')),
    generation: '1',
    deadline: ok(decodeToolInstant('2026-11-10T00:01:00.000Z')),
  })
  return { app, store, permit }
}

const receipt = (request: CommitRequestV2) => ({
  identity: request.identity,
  inputDigest: 'b'.repeat(64),
  combinationVersion: 'tool-c1',
  manifestDigest: 'a'.repeat(64),
})

const rolledBack =
  (reply: StoppingReply): Answer =>
  request => ({
    kind: 'rolled_back',
    ...receipt(request),
    responses: [{ participant: 'tool', protocol: 'tool/1', reply }],
  })

const lostWithoutDiagnostic: Answer = request => ({
  kind: 'unknown',
  identity: request.identity,
  diagnostic: null,
})

const keyUsed: Answer = request => ({
  kind: 'identity_conflict',
  identity: request.identity,
  existing: {
    kind: 'committed',
    ...receipt(request),
    responses: [
      { participant: 'tool', protocol: 'tool/1', reply: { kind: 'participated', response: null } },
    ],
  },
})

const manifest = { chunks: 1, bytes: 1, digest: 'c'.repeat(64) }

it.each([
  [
    'a failed participant reply',
    rolledBack({ kind: 'failed', category: 'sql_error', diagnostic: 'x' }),
    'body put rolled back: sql_error',
  ],
  [
    'an unsupported participant reply',
    rolledBack({ kind: 'unsupported', basis: { reason: 'body-conflict' } }),
    'body put rolled back: unsupported',
  ],
  [
    'a conflict whose basis the store does not know',
    rolledBack({ kind: 'conflict', basis: { reason: 'other', diagnostic: 'x' } }),
    'body put rolled back: conflict',
  ],
  [
    'a not-ready basis without a diagnostic',
    rolledBack({ kind: 'conflict', basis: { reason: 'body-not-ready' } }),
    'body put rolled back: conflict',
  ],
  [
    'a conflict without a basis',
    rolledBack({ kind: 'conflict', basis: null }),
    'body put rolled back: conflict',
  ],
  [
    'a conflict whose basis is not a record',
    rolledBack({ kind: 'conflict', basis: 'body-conflict' }),
    'body put rolled back: conflict',
  ],
  ['an unknown answer without a diagnostic', lostWithoutDiagnostic, 'body put: unknown'],
  ['an identity conflict', keyUsed, 'body put: the operation key was already used'],
] as const)('a put whose commit answers %s is unavailable', async (_name, answer, diagnostic) => {
  const { store, permit } = await storeAnswering(answer)
  expect(await store.put(permit, 0, new Uint8Array([1]))).toEqual({
    kind: 'unavailable',
    diagnostic,
  })
})

it('a put rejected before acceptance names the reason', async () => {
  const { app, store, permit } = await storeAnswering(null)
  app.faults.armCommit('rejected')
  expect(await store.put(permit, 0, new Uint8Array([1]))).toEqual({
    kind: 'unavailable',
    diagnostic: 'body put rejected: queue_full',
  })
})

it('a put whose answer is lost carries the provider diagnostic', async () => {
  const { app, store, permit } = await storeAnswering(null)
  app.faults.armCommit('unknown-dropped')
  expect(await store.put(permit, 0, new Uint8Array([1]))).toEqual({
    kind: 'unavailable',
    diagnostic: 'body put: injected',
  })
})

it('a stop the participant reports on a put is not a conflict unless it is one', async () => {
  const { store, permit } = await storeAnswering(
    rolledBack({ kind: 'conflict', basis: { reason: 'body-not-ready', diagnostic: 'gap' } }),
  )
  expect(await store.put(permit, 0, new Uint8Array([1]))).toEqual({
    kind: 'unavailable',
    diagnostic: 'body put stopped: body-not-ready',
  })
})

it('a seal names the stop the participant reported', async () => {
  const notReady = await storeAnswering(
    rolledBack({ kind: 'conflict', basis: { reason: 'body-not-ready', diagnostic: 'gap' } }),
  )
  expect(await notReady.store.seal(notReady.permit, manifest)).toEqual({
    kind: 'not-ready',
    diagnostic: 'gap',
  })
  const conflict = await storeAnswering(
    rolledBack({ kind: 'conflict', basis: { reason: 'body-conflict' } }),
  )
  expect(await conflict.store.seal(conflict.permit, manifest)).toEqual({ kind: 'conflict' })
  const failed = await storeAnswering(
    rolledBack({ kind: 'failed', category: 'participant_threw', diagnostic: 'x' }),
  )
  expect(await failed.store.seal(failed.permit, manifest)).toEqual({
    kind: 'unavailable',
    diagnostic: 'body seal rolled back: participant_threw',
  })
})

it('a delete whose commit does not land names why', async () => {
  const stopped = await storeAnswering(
    rolledBack({ kind: 'conflict', basis: { reason: 'body-conflict' } }),
  )
  expect(await stopped.store.delete(stopped.permit.claims)).toEqual({
    kind: 'unavailable',
    diagnostic: 'body delete stopped: body-conflict',
  })
  const lost = await storeAnswering(null)
  lost.app.faults.armCommit('unknown-dropped')
  expect(await lost.store.delete(lost.permit.claims)).toEqual({
    kind: 'unavailable',
    diagnostic: 'body delete: injected',
  })
})
