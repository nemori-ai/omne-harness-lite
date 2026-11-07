import { afterEach, expect, it } from 'vitest'
import { inputDigestV2, type CommitRequestV2 } from '@omne-harness/sql-contract'
import { openActivation } from './activation-world.ts'
import { command, binding, scope } from './operation-world.ts'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { storedStageSchema, persistStageSchema, type SqlStage } from '../src/sql-stage-schema.ts'
import { stageIdentity } from '../src/sql-stage-binding.ts'
import {
  METADATA_PLANNER,
  MUTATION_PLANNER,
  type ControlRequest,
} from '../src/activation-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { digest, json } from '../src/encoding.ts'

const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function prepare() {
  const w = await openActivation()
  worlds.push(w)
  await w.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = command()
  await w.control({ kind: 'accept', input })
  const operation = binding(input)
  const custody = standingCustodySchema.parse(
    await w.control({
      kind: 'standing-prepare',
      input: {
        operation,
        destination: 'governance',
        required: [],
      },
    }),
  )
  const reservation = { ...custody.request, id: custody.reservationId }
  await w.control({ kind: 'standing-held', binding: operation, reservation })
  const request = { binding: operation, execution: w.execution('mutation') }
  await w.control({ kind: 'submit', ...request })
  return { w, request, reservation, envelope: w.envelope('mutation', request) }
}
function persist(
  w: Awaited<ReturnType<typeof openActivation>>,
  operation: ReturnType<typeof binding>,
  envelope: CommitRequestV2,
  stage: SqlStage = 'apply',
) {
  return w.control({
    kind: 'persist-stage',
    input: persistStageSchema.parse({ binding: operation, stage, envelope }),
  })
}
it('keeps the first complete request across retries and refuses replacement even when SQL digests match', async () => {
  const { w, request, envelope } = await prepare()
  const saved = storedStageSchema.parse(await persist(w, request.binding, envelope))
  expect(saved.envelope).toEqual(envelope)
  expect(saved.inputDigest).toBe(inputDigestV2(envelope))
  expect(await persist(w, request.binding, envelope)).toEqual(saved)
  const swapped = { ...envelope, commands: [...envelope.commands].reverse() }
  expect(inputDigestV2(swapped)).toBe(saved.inputDigest)
  for (const changed of [
    swapped,
    { ...envelope, combinationVersion: 'new/2' },
    { ...envelope, identity: { ...envelope.identity, operationKey: 'c'.repeat(64) } },
  ])
    expect(await persist(w, request.binding, changed)).toMatchObject({ kind: 'conflict' })
  expect(await w.readStage(request.binding, 'apply')).toEqual(saved)
})
it('requires custody before effects and submits the saved request after closing and reopening the real Worker', async () => {
  const { w, request, envelope } = await prepare()
  expect(await w.commit('mutation', envelope.commands)).toMatchObject({ kind: 'rolled_back' })
  expect(await w.readStage(request.binding, 'apply')).toEqual({ kind: 'unplanned' })
  await persist(w, request.binding, envelope)
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  const reopened = await openActivation(w.root)
  worlds.push(reopened)
  const saved = storedStageSchema.parse(await reopened.readStage(request.binding, 'apply'))
  expect(saved.envelope).toEqual(envelope)
  await reopened.storage.commit(saved.envelope)
  const receipt = await reopened.storage.query(saved.envelope.identity)
  expect(receipt).toMatchObject({
    kind: 'committed',
    inputDigest: saved.inputDigest,
    responses: expect.arrayContaining([
      expect.objectContaining({
        participant: GOVERNANCE_OWNER,
        reply: expect.objectContaining({
          response: expect.objectContaining({
            record: expect.objectContaining({ state: 'committed' }),
          }),
        }),
      }),
    ]),
  })
  expect(await reopened.storage.commit(saved.envelope)).toEqual(receipt)
})
it.each([
  'tenant',
  'domain',
  'key',
  'operation',
  'digest',
  'combination',
  'principal',
  'extra',
  'duplicate',
  'writer',
  'normalized',
])('rejects a new envelope with wrong %s binding without storing it', async variant => {
  const { w, request, envelope } = await prepare()
  let bad = structuredClone(envelope)
  switch (variant) {
    case 'tenant':
      bad = { ...bad, identity: { ...bad.identity, scope: { kind: 'tenant', tenant: 'other' } } }
      break
    case 'domain':
      bad = { ...bad, identity: { ...bad.identity, transactionDomain: 'other' } }
      break
    case 'key':
      bad = { ...bad, identity: { ...bad.identity, operationKey: 'c'.repeat(64) } }
      break
    case 'operation':
      bad = { ...bad, identity: { ...bad.identity, operation: 'governance.meta.seal' } }
      break
    case 'digest':
      bad = { ...bad, manifestDigest: 'b'.repeat(64) }
      break
    case 'combination':
      bad = { ...bad, combinationVersion: 'other/2' }
      break
    case 'duplicate':
      bad = { ...bad, commands: [...bad.commands, bad.commands[0]!] }
      break
    case 'writer':
      bad = {
        ...bad,
        commands: bad.commands.map(c =>
          c.participant === GOVERNANCE_OWNER
            ? { ...c, facts: { requestDigest: 'b'.repeat(64) } }
            : c,
        ),
      }
      break
    case 'principal':
      bad = {
        ...bad,
        commands: w.businessCommands('mutation', {
          ...request,
          binding: { ...request.binding, ref: { ...request.binding.ref, principalRef: 'bob' } },
        }),
      }
      break
    case 'extra':
      bad = {
        ...bad,
        commands: bad.commands.map(c =>
          c.participant === MUTATION_PLANNER ? { ...c, facts: { ...c.facts, extra: true } } : c,
        ),
      }
      break
    case 'normalized':
      bad = { ...bad, combinationVersion: ' ' + bad.combinationVersion + ' ' }
      break
  }
  const raw = {
    kind: 'persist-stage',
    input: { binding: request.binding, stage: 'apply', envelope: bad },
  }
  expect(
    await w.commit('metadata', [
      { participant: METADATA_PLANNER, facts: { request: json(raw) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(raw) } },
    ]),
  ).toMatchObject({ kind: 'rolled_back' })
  expect(await w.readStage(request.binding, 'apply')).toEqual({ kind: 'unplanned' })
})
it('binds every metadata stage to its original operation and permits settlement after sealing', async () => {
  const { w, request, reservation } = await prepare()
  const controls: ControlRequest[] = [
    {
      kind: 'standing-prepare',
      input: { operation: request.binding, destination: 'governance', required: [] },
    },
    { kind: 'standing-held', binding: request.binding, reservation },
    { kind: 'submit', ...request },
    { kind: 'seal', binding: request.binding },
    {
      kind: 'standing-seal',
      reservation,
      route: { destination: 'governance', transactionDomain: w.domain.transactionDomain },
    },
    { kind: 'standing-settled', binding: request.binding, reservation, outcome: 'aborted' },
  ]
  for (const control of controls) {
    if (
      control.kind === 'bootstrap' ||
      control.kind === 'accept' ||
      control.kind === 'persist-stage'
    )
      throw new Error('fixture stage')
    const combination = w.combination('metadata')
    const envelope = {
      identity: stageIdentity(w.domain.transactionDomain, request.binding.ref, control.kind),
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: w.controlCommands(control),
    }
    const saved = storedStageSchema.parse(await persist(w, request.binding, envelope, control.kind))
    expect(await w.readStage(request.binding, control.kind)).toEqual(saved)
    expect(await w.storage.commit(saved.envelope)).toMatchObject({ kind: 'committed' })
  }
  expect(await w.apply('mutation', request)).toMatchObject({ record: { state: 'aborted' } })
})
it('isolates custody lookup by complete original identity and digest', async () => {
  const { w, request, envelope } = await prepare()
  await persist(w, request.binding, envelope)
  expect(await w.readStage({ ...request.binding, requestDigest: 'f'.repeat(64) }, 'apply')).toEqual(
    { kind: 'conflict', reason: 'operation' },
  )
  for (const ref of [
    { ...request.binding.ref, principalRef: 'bob' },
    { ...request.binding.ref, operationId: 'other' },
    { ...request.binding.ref, owner: 'adopt' as const },
    { ...request.binding.ref, scope: { ...scope, deploymentId: 'other' } },
  ])
    expect(await w.readStage({ ...request.binding, ref }, 'apply')).toEqual({ kind: 'absent' })
})
it('serializes competing first saves without replacing the winning envelope', async () => {
  const { w, request, envelope } = await prepare()
  const alternate = { ...envelope, commands: [...envelope.commands].reverse() }
  const outcomes = await Promise.all([
    persist(w, request.binding, envelope),
    persist(w, request.binding, alternate),
  ])
  expect(
    outcomes.filter(
      result =>
        result && typeof result === 'object' && 'kind' in result && result.kind === 'stored',
    ),
  ).toHaveLength(1)
  expect(
    outcomes.filter(
      result =>
        result && typeof result === 'object' && 'kind' in result && result.kind === 'conflict',
    ),
  ).toHaveLength(1)
  const saved = storedStageSchema.parse(await w.readStage(request.binding, 'apply'))
  expect([envelope, alternate]).toContainEqual(saved.envelope)
})
it('rejects an oversized envelope before storing it', async () => {
  const { w, request, envelope } = await prepare()
  const raw = {
    kind: 'persist-stage',
    input: {
      binding: request.binding,
      stage: 'apply',
      envelope: {
        ...envelope,
        commands: [
          ...envelope.commands,
          { participant: 'large', facts: { value: 'x'.repeat(4 * 1024 * 1024) } },
        ],
      },
    },
  }
  expect(
    await w.commit('metadata', [
      { participant: METADATA_PLANNER, facts: { request: json(raw) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(raw) } },
    ]),
  ).toMatchObject({ kind: 'rolled_back' })
  expect(await w.readStage(request.binding, 'apply')).toEqual({ kind: 'unplanned' })
})
it('rejects metadata envelopes that address another operation or recovery route', async () => {
  const { w, request, reservation } = await prepare()
  const wrong = { ...request.binding, ref: { ...request.binding.ref, principalRef: 'bob' } }
  const controls: ControlRequest[] = [
    { kind: 'seal', binding: wrong },
    {
      kind: 'standing-prepare',
      input: { operation: wrong, destination: 'governance', required: [] },
    },
    {
      kind: 'standing-held',
      binding: request.binding,
      reservation: { ...reservation, id: 'wrong' },
    },
    {
      kind: 'standing-seal',
      reservation,
      route: { destination: 'other', transactionDomain: w.domain.transactionDomain },
    },
    {
      kind: 'standing-seal',
      reservation,
      route: { destination: 'governance', transactionDomain: 'other' },
    },
  ]
  for (const control of controls) {
    if (
      control.kind === 'bootstrap' ||
      control.kind === 'accept' ||
      control.kind === 'persist-stage'
    )
      throw new Error('fixture stage')
    const combination = w.combination('metadata')
    const envelope = {
      identity: stageIdentity(w.domain.transactionDomain, request.binding.ref, control.kind),
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [
        { participant: METADATA_PLANNER, facts: { request: json(control) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(control) } },
      ],
    }
    const raw = {
      kind: 'persist-stage',
      input: { binding: request.binding, stage: control.kind, envelope },
    }
    expect(
      await w.commit('metadata', [
        { participant: METADATA_PLANNER, facts: { request: json(raw) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(raw) } },
      ]),
    ).toMatchObject({ kind: 'rolled_back' })
    expect(await w.readStage(request.binding, control.kind)).toEqual({ kind: 'unplanned' })
  }
})
