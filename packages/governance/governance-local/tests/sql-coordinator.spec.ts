import { afterEach, expect, it } from 'vitest'
import {
  inputDigestV2,
  type SqlStorage,
  type CommittedV2,
  type CommitRequestV2,
} from '@omne-harness/sql-contract'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'
import { submitSql } from '../src/sql-submission.ts'
import { OPERATION_HANDLER } from '../src/operation-read.ts'
import { STAGE_HANDLER } from '../src/sql-stage-read.ts'
import { persistStageSchema } from '../src/sql-stage-schema.ts'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { digest, json } from '../src/encoding.ts'
import { openActivation } from './activation-world.ts'
import { command, binding, scope } from './operation-world.ts'

const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
function wrap(storage: SqlStorage, overrides: Partial<SqlStorage>): SqlStorage {
  return {
    registerCombination: input => storage.registerCombination(input),
    commit: input => storage.commit(input),
    query: input => storage.query(input),
    read: input => storage.read(input),
    ...overrides,
  }
}
function coordinator(
  w: Awaited<ReturnType<typeof openActivation>>,
  storage = w.storage,
  metadataVersion?: string,
) {
  const metadata = w.combination('metadata')
  return new SqlOperationCoordinator({
    storage,
    domain: w.domain,
    metadata: {
      combinationVersion: metadataVersion ?? metadata.combinationVersion,
      manifestDigest: metadata.manifestDigest,
    },
  })
}
async function setup() {
  const w = await openActivation()
  worlds.push(w)
  await w.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  return w
}
async function prepare(w: Awaited<ReturnType<typeof openActivation>>, input = command()) {
  const operation = binding(input),
    driver = coordinator(w)
  const prepared = await driver.executeControl(operation, {
    kind: 'standing-prepare',
    input: {
      operation,
      destination: 'governance',
      required: [],
    },
  })
  if (prepared.kind !== 'applied') throw new Error(JSON.stringify(prepared))
  const custody = standingCustodySchema.parse(prepared.response)
  const reservation = { ...custody.request, id: custody.reservationId }
  expect(
    await driver.executeControl(operation, {
      kind: 'standing-held',
      binding: operation,
      reservation,
    }),
  ).toMatchObject({ kind: 'applied' })
  const request = { binding: operation, execution: w.execution('mutation') }
  expect(await driver.executeControl(operation, { kind: 'submit', ...request })).toMatchObject({
    kind: 'applied',
  })
  return { request, reservation, envelope: w.envelope('mutation', request) }
}
async function saved(w: Awaited<ReturnType<typeof openActivation>>) {
  const driver = coordinator(w),
    input = command()
  expect(await driver.accept(input)).toMatchObject({ kind: 'found', record: { state: 'accepted' } })
  const prepared = await prepare(w, input)
  expect(
    await driver.save(
      persistStageSchema.parse({
        binding: prepared.request.binding,
        stage: 'apply',
        envelope: prepared.envelope,
      }),
    ),
  ).toMatchObject({ kind: 'stored' })
  return { driver, ...prepared }
}
it('accepts once, rejects changed business input and observes current state instead of the old acceptance receipt', async () => {
  const w = await setup(),
    input = command(),
    driver = coordinator(w)
  expect(await driver.accept(input)).toMatchObject({
    kind: 'found',
    standing: null,
    record: { state: 'accepted' },
  })
  const changed = command()
  if (changed.request.owner !== 'contribute') throw new Error('fixture')
  changed.request.command.generation = 'another'
  expect(await driver.accept(changed)).toEqual({ kind: 'conflict', reason: 'operation' })
  const prepared = await prepare(w, input)
  await w.apply('mutation', prepared.request)
  const current = await coordinator(w, w.storage, 'new-metadata/2').accept({
    ...input,
    epoch: 'new',
  })
  expect(current).toMatchObject({
    kind: 'found',
    standing: { kind: 'held' },
    record: {
      state: 'committed',
      epoch: 'first',
      result: { kind: 'registered', declarationRevision: 1 },
    },
  })
})
it('rechecks the operation after a concurrent accept commits between the first read and acceptance receipt query', async () => {
  const w = await setup(),
    input = command()
  let intercept = true,
    commits = 0
  const storage = wrap(w.storage, {
    async read(request) {
      const response = await w.storage.read(request)
      if (request.handler === OPERATION_HANDLER.handler && intercept) {
        intercept = false
        await coordinator(w).accept(input)
        const prepared = await prepare(w, input)
        await w.apply('mutation', prepared.request)
      }
      return response
    },
    async commit(request) {
      commits++
      return w.storage.commit(request)
    },
  })
  expect(await coordinator(w, storage, 'unregistered-new-metadata/2').accept(input)).toMatchObject({
    kind: 'found',
    record: { state: 'committed' },
  })
  expect(commits).toBe(0)
})
it('recovers a lost accept reply through the exact SQL identity', async () => {
  const w = await setup(),
    input = command(),
    sent: CommitRequestV2[] = []
  const storage = wrap(w.storage, {
    async commit(request) {
      sent.push(request)
      await w.storage.commit(request)
      return { kind: 'unknown', identity: request.identity, diagnostic: null }
    },
  })
  expect(await coordinator(w, storage).accept(input)).toMatchObject({
    kind: 'found',
    record: { state: 'accepted' },
  })
  expect(sent).toHaveLength(1)
  expect(sent[0]?.identity.operation).toBe('governance.meta.accept')
  expect(sent[0]?.identity.operationKey).toBe(digest(binding(input).ref))
})
it('freezes the caller input before the first asynchronous observation', async () => {
  const w = await setup(),
    input = command(),
    original = structuredClone(input)
  let mutate = true
  const storage = wrap(w.storage, {
    async read(request) {
      if (mutate) {
        mutate = false
        if (input.request.owner === 'contribute')
          input.request.command.generation = 'changed-in-flight'
      }
      return w.storage.read(request)
    },
  })
  expect(await coordinator(w, storage).accept(input)).toMatchObject({
    kind: 'found',
    record: { request: original.request },
  })
})
it('sends the original saved envelope after reopening even when the new coordinator metadata combination differs', async () => {
  const w = await setup(),
    original = await saved(w)
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  const reopened = await openActivation(w.root)
  worlds.push(reopened)
  const sent: CommitRequestV2[] = []
  const storage = wrap(reopened.storage, {
    async commit(request) {
      sent.push(request)
      await reopened.storage.commit(request)
      return { kind: 'unknown', identity: request.identity, diagnostic: null }
    },
  })
  expect(
    await coordinator(reopened, storage, 'new-metadata/2').send(original.request.binding, 'apply'),
  ).toMatchObject({ kind: 'applied', response: { record: { state: 'committed' } } })
  expect(sent).toEqual([original.envelope])
  expect(await coordinator(reopened).observe(original.request.binding)).toMatchObject({
    record: { state: 'committed' },
    standing: { kind: 'held' },
  })
})
it('recognizes lost custody replies and rejects replacement without sending a new save', async () => {
  const w = await setup(),
    input = command()
  await coordinator(w).accept(input)
  const prepared = await prepare(w, input)
  let commits = 0
  const storage = wrap(w.storage, {
    async commit(request) {
      commits++
      await w.storage.commit(request)
      return { kind: 'unknown', identity: request.identity, diagnostic: null }
    },
  })
  const driver = coordinator(w, storage)
  const request = persistStageSchema.parse({
    binding: prepared.request.binding,
    stage: 'apply',
    envelope: prepared.envelope,
  })
  expect(await driver.save(request)).toMatchObject({ kind: 'stored', envelope: prepared.envelope })
  expect(await driver.save(request)).toMatchObject({ kind: 'stored' })
  expect(
    await driver.save({
      ...request,
      envelope: { ...request.envelope, combinationVersion: 'different' },
    }),
  ).toMatchObject({ kind: 'conflict' })
  expect(commits).toBe(1)
})
it('does not send without a saved stage and does not touch SQL for another tenant', async () => {
  const w = await setup(),
    input = command()
  await coordinator(w).accept(input)
  let calls = 0
  const storage = wrap(w.storage, {
    async commit(request) {
      calls++
      return w.storage.commit(request)
    },
    async read(request) {
      calls++
      return w.storage.read(request)
    },
  })
  const driver = coordinator(w, storage)
  expect(await driver.send(binding(input), 'apply')).toEqual({ kind: 'unplanned' })
  calls = 0
  const foreign = structuredClone(input)
  if (foreign.request.owner !== 'contribute') throw new Error('fixture')
  const otherTenant = JSON.stringify({
    organization: 'org_00000000000000000000000001',
    account: 'acc_00000000000000000000000003',
  })
  foreign.request.command.scope.tenantRef = otherTenant
  foreign.request.command.scope.visibility = { kind: 'tenant', tenantRef: otherTenant }
  expect(await driver.accept(foreign)).toMatchObject({ kind: 'unavailable' })
  expect(await driver.observe(binding(foreign))).toMatchObject({ kind: 'unavailable' })
  expect(await driver.send(binding(foreign), 'apply')).toMatchObject({ kind: 'unavailable' })
  expect(calls).toBe(0)
})
const corruptions: [string, (receipt: CommittedV2) => CommittedV2][] = [
  ['identity', r => ({ ...r, identity: { ...r.identity, operationKey: 'f'.repeat(64) } })],
  ['digest', r => ({ ...r, inputDigest: 'f'.repeat(64) })],
  ['combination', r => ({ ...r, combinationVersion: 'other' })],
  ['manifest', r => ({ ...r, manifestDigest: 'f'.repeat(64) })],
  ['writer', r => ({ ...r, responses: [r.responses[0]!] })],
  ['duplicate writer', r => ({ ...r, responses: [...r.responses, ...r.responses] })],
]
it.each(corruptions)(
  'does not recognize an inconsistent %s receipt as success',
  async (_name, corrupt) => {
    const w = await setup(),
      prepared = await saved(w)
    const storage = wrap(w.storage, {
      async commit(request) {
        const result = await w.storage.commit(request)
        if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
        return corrupt(result)
      },
    })
    const result = await coordinator(w, storage).send(prepared.request.binding, 'apply')
    expect(['conflict', 'unavailable']).toContain(result.kind)
    expect(await coordinator(w).observe(prepared.request.binding)).toMatchObject({
      record: { state: 'committed' },
    })
  },
)
it('keeps transport exceptions and unknown query results distinct from proof of no commit', async () => {
  const w = await setup(),
    prepared = await saved(w)
  for (const fail of [true, false]) {
    const storage = wrap(w.storage, {
      async commit(request) {
        await w.storage.commit(request)
        if (fail) throw new Error('reply lost')
        return { kind: 'unknown', identity: request.identity, diagnostic: null }
      },
      async query(identity) {
        return { kind: 'unknown', identity, diagnostic: null }
      },
    })
    expect(await coordinator(w, storage).send(prepared.request.binding, 'apply')).toEqual({
      kind: 'unknown',
      identity: prepared.envelope.identity,
    })
  }
  expect(await coordinator(w).send(prepared.request.binding, 'apply')).toMatchObject({
    kind: 'applied',
  })
})
it('preserves the storage-provided no-commit proof instead of constructing one', async () => {
  const w = await setup(),
    prepared = await saved(w)
  const proof = await w.storage.query(prepared.envelope.identity)
  expect(proof.kind).toBe('not_committed')
  const storage = wrap(w.storage, {
    async commit(request) {
      return { kind: 'unknown', identity: request.identity, diagnostic: null }
    },
    async query() {
      return proof
    },
  })
  const result = await submitSql(storage, prepared.envelope)
  expect(result).toEqual({ kind: 'not-committed', proof })
  if (result.kind !== 'not-committed') throw new Error('missing proof')
  expect(result.proof).toBe(proof)
})
it('rejects a saved-stage read with the wrong original identity or input digest', async () => {
  const w = await setup(),
    prepared = await saved(w)
  for (const field of ['identity', 'digest'] as const) {
    let commits = 0
    const storage = wrap(w.storage, {
      async read(request) {
        const result = await w.storage.read(request)
        if (request.handler !== STAGE_HANDLER.handler || result.kind !== 'read') return result
        const value = persistStageSchema.parse({
          binding: prepared.request.binding,
          stage: 'apply',
          envelope: prepared.envelope,
        })
        return {
          ...result,
          output: json({
            kind: 'stored',
            stage: 'apply',
            envelope:
              field === 'identity'
                ? {
                    ...value.envelope,
                    identity: { ...value.envelope.identity, operationKey: 'f'.repeat(64) },
                  }
                : value.envelope,
            inputDigest: field === 'identity' ? inputDigestV2(prepared.envelope) : 'f'.repeat(64),
          }),
        }
      },
      async commit(request) {
        commits++
        return w.storage.commit(request)
      },
    })
    expect(await coordinator(w, storage).send(prepared.request.binding, 'apply')).toMatchObject({
      kind: 'unavailable',
    })
    expect(commits).toBe(0)
  }
})
it('keeps an unavailable initial acceptance query unknown without submitting a new envelope', async () => {
  const w = await setup()
  let commits = 0
  const storage = wrap(w.storage, {
    async query() {
      throw new Error('query connection lost')
    },
    async commit(request) {
      commits++
      return w.storage.commit(request)
    },
  })
  expect(await coordinator(w, storage).accept(command())).toMatchObject({ kind: 'unknown' })
  expect(commits).toBe(0)
  expect(await coordinator(w).observe(binding(command()))).toEqual({ kind: 'absent' })
})
it('does not mistake a domain rejection receipt for a successful acceptance', async () => {
  const w = await setup(),
    input = { ...command(), epoch: 'stale' },
    driver = coordinator(w)
  expect(await driver.accept(input)).toEqual({ kind: 'conflict', reason: 'basis' })
  expect(await driver.accept(input)).toEqual({ kind: 'conflict', reason: 'basis' })
  expect(await driver.observe(binding(input))).toEqual({ kind: 'absent' })
})
it('reuses the saved metadata stage across assembly changes and rejects changed control input', async () => {
  const w = await setup(),
    prepared = await saved(w)
  const driver = coordinator(w, w.storage, 'unregistered-new-metadata/2')
  expect(
    await driver.executeControl(prepared.request.binding, { kind: 'submit', ...prepared.request }),
  ).toMatchObject({ kind: 'applied' })
  expect(
    await driver.executeControl(prepared.request.binding, {
      kind: 'submit',
      ...prepared.request,
      execution: { ...prepared.request.execution, authority: { changed: true } },
    }),
  ).toMatchObject({ kind: 'conflict' })
  expect(await driver.send(prepared.request.binding, 'apply')).toMatchObject({ kind: 'applied' })
})
it('recognizes the original rejected acceptance across epoch and metadata changes without rebinding the business operation', async () => {
  const w = await setup(),
    input = { ...command(), epoch: 'stale' }
  expect(await coordinator(w).accept(input)).toEqual({ kind: 'conflict', reason: 'basis' })
  expect(
    await coordinator(w, w.storage, 'unregistered-new-metadata/2').accept({
      ...input,
      epoch: 'first',
    }),
  ).toEqual({ kind: 'conflict', reason: 'basis' })
  const changed = command()
  if (changed.request.owner !== 'contribute') throw new Error('fixture')
  changed.request.command.generation = 'different'
  expect(await coordinator(w).accept(changed)).toEqual({ kind: 'conflict', reason: 'operation' })
  expect(await coordinator(w).observe(binding(input))).toEqual({ kind: 'absent' })
})
