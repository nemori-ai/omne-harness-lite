import { afterEach, expect, it } from 'vitest'
import { openActivation } from './activation-world.ts'
import { scope } from './operation-world.ts'
import { capture, held } from './permission-capture-world.ts'
import { GovernanceSourceDestination } from '../src/source-destination.ts'
import { METADATA_PLANNER } from '../src/activation-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { bindingSchema } from '../src/operation-schema.ts'
import { digest, json } from '../src/encoding.ts'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'

const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
function acceptance() {
  return {
    principalRef: 'fixture-original-login',
    epoch: 'first',
    transactionDomain: 'governance-operations',
    request: {
      owner: 'internal.external-write',
      command: {
        scope,
        operationId: 'session-permission-one',
        write: {
          owner: 'session',
          protocol: 'fixture-session-permission-write/1',
          targetRef: 'session-one',
          commandDigest: 'sha256:' + 'a'.repeat(64),
          command: { operation: 'set-rule', session: 'session-one', revision: '4', pick: 'deny' },
          qualification: {
            fixture: 'previously-qualified-original-operation',
            principalRef: 'fixture-original-login',
          },
        },
        required: [],
        source: null,
        sourceRoute: 'governance-source',
      },
    },
  }
}
async function accept(
  world: Awaited<ReturnType<typeof openActivation>>,
  input: unknown = acceptance(),
) {
  const request = { kind: 'accept', input }
  const result = await world.commit('metadata', [
    { participant: METADATA_PLANNER, facts: { request: json(request) } },
    { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
  ])
  expect(result.kind, JSON.stringify(result)).toBe('committed')
  return world.response(result)
}
function operation(input: ReturnType<typeof acceptance>) {
  return bindingSchema.parse({
    ref: {
      scope,
      owner: input.request.owner,
      principalRef: input.principalRef,
      operationId: input.request.command.operationId,
    },
    requestDigest: digest(input.request),
  })
}
function coordinator(world: Awaited<ReturnType<typeof openActivation>>) {
  const { combinationVersion, manifestDigest } = world.combination('metadata')
  return new SqlOperationCoordinator({
    storage: world.storage,
    domain: world.domain,
    metadata: { combinationVersion, manifestDigest },
  })
}
it('retains the original external command and qualification across retries and a real Worker restart', async () => {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = acceptance()
  expect(await accept(world, input)).toMatchObject({
    kind: 'acceptance',
    outcome: { kind: 'found', record: { state: 'accepted', request: input.request } },
  })
  const binding = operation(input)
  const original = await coordinator(world).observe(binding)
  expect(original).toMatchObject({
    kind: 'found',
    record: { request: input.request },
    source: { kind: 'not-required' },
  })
  await accept(world, input)
  expect(await coordinator(world).observe(binding)).toEqual(original)
  worlds.splice(worlds.indexOf(world), 1)
  await world.close(false)
  const reopened = await openActivation(world.root)
  worlds.push(reopened)
  expect(await coordinator(reopened).observe(binding)).toEqual(original)
})
it('refuses replacement of command, qualification, target or source route under the same operation', async () => {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = acceptance()
  await accept(world, input)
  const binding = operation(input),
    sql = coordinator(world)
  const original = await sql.observe(binding)
  const changes = [
    {
      write: {
        ...input.request.command.write,
        command: { ...input.request.command.write.command, pick: 'auto' },
      },
    },
    {
      write: {
        ...input.request.command.write,
        qualification: { fixture: 'replacement', principalRef: input.principalRef },
      },
    },
    { write: { ...input.request.command.write, targetRef: 'session-other' } },
    { sourceRoute: 'another-route' },
  ]
  for (const changed of changes) {
    expect(
      await accept(world, {
        ...input,
        request: { ...input.request, command: { ...input.request.command, ...changed } },
      }),
    ).toMatchObject({ kind: 'acceptance', outcome: { kind: 'conflict', reason: 'operation' } })
    expect(await sql.observe(binding)).toEqual(original)
  }
})

it('retains source custody and lets only the original route seal the external operation', async () => {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const original = acceptance()
  const input = {
    ...original,
    request: {
      ...original.request,
      command: { ...original.request.command, source: capture().request.command.source },
    },
  }
  await accept(world, input)
  const binding = bindingSchema.parse({
    ref: {
      scope,
      owner: input.request.owner,
      principalRef: input.principalRef,
      operationId: input.request.command.operationId,
    },
    requestDigest: digest(input.request),
  })
  const sql = coordinator(world)
  const found = await sql.observe(binding)
  expect(found).toMatchObject({
    kind: 'found',
    source: {
      kind: 'requested',
      request: {
        destination: {
          identity: { operation: { protocol: 'governance-external-write/1', binding } },
        },
      },
    },
  })
  if (found.kind !== 'found' || found.source.kind !== 'requested')
    throw new Error('expected original source request')
  const request = found.source.request
  await sql.executeControl(binding, { kind: 'source-held', binding, receipt: held(request) })
  const before = await sql.observe(binding)
  expect(before).toMatchObject({ kind: 'found', source: { kind: 'held' } })
  worlds.splice(worlds.indexOf(world), 1)
  await world.close(false)
  const reopened = await openActivation(world.root)
  worlds.push(reopened)
  const restored = coordinator(reopened)
  expect(await restored.observe(binding)).toEqual(before)
  const destination = new GovernanceSourceDestination(restored, input.request.command.sourceRoute)
  expect(await destination.recognize(request)).toEqual({ kind: 'known', request })
  expect(
    await destination.recognize({
      ...request,
      destination: { ...request.destination, route: 'wrong-route' },
    }),
  ).toEqual({ kind: 'unavailable' })
  expect(await destination.seal(request)).toEqual({ kind: 'terminal', request, outcome: 'aborted' })
  expect(await restored.observe(binding)).toMatchObject({
    kind: 'found',
    record: { state: 'aborted' },
    source: { kind: 'held' },
  })
})

it('looks up the original internal write by reference without re-qualifying it', async () => {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = acceptance()
  await accept(world, input)
  const binding = operation(input)
  expect(await coordinator(world).lookup(binding.ref)).toMatchObject({
    kind: 'found',
    record: { request: input.request, requestDigest: binding.requestDigest },
  })
  expect(
    await coordinator(world).lookup({ ...binding.ref, principalRef: 'different-principal' }),
  ).toEqual({ kind: 'absent' })
})

it('cannot lower the original external operation Identity requirements when preparing custody', async () => {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = acceptance()
  const required = ['organization-settings-manage']
  const request = { ...input.request, command: { ...input.request.command, required } }
  await accept(world, { ...input, request })
  const binding = { ...operation(input), requestDigest: digest(request) }
  const sql = coordinator(world)
  const result = await sql.executeControl(binding, {
    kind: 'standing-prepare',
    input: {
      operation: binding,
      destination: 'fixture-standing',
      required: [],
    },
  })
  expect(result).toMatchObject({
    kind: 'applied',
    response: { kind: 'conflict', reason: 'operation' },
  })
  expect(await sql.observe(binding)).toMatchObject({ kind: 'found', standing: null })
})
