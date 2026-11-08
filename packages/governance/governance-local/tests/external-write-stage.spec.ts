import { afterEach, expect, it } from 'vitest'
import type { CommitRequestV2 } from '@omne-harness/sql-contract'
import { inputDigestV2 } from '@omne-harness/sql-contract'
import { openActivation } from './activation-world.ts'
import { scope } from './operation-world.ts'
import { executionSchema, type AcceptOperation } from '../src/operation-schema.ts'
import { METADATA_PLANNER } from '../src/activation-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { digest, json, operationIdentity } from '../src/encoding.ts'

const BASIS = 'governance.external-write-basis'
const TERMINAL = 'governance.external-write-terminal'
const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function prepared(variant = 'valid') {
  const world = await openActivation()
  worlds.push(world)
  await world.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input: AcceptOperation = {
    principalRef: 'fixture-qualified-principal',
    epoch: 'first',
    transactionDomain: world.domain.transactionDomain,
    request: {
      owner: 'internal.external-write',
      command: {
        scope,
        operationId: 'external-one',
        required: [],
        source: null,
        sourceRoute: 'fixture-source',
        write: {
          owner: 'fixture.writer',
          protocol: 'fixture-write/1',
          targetRef: 'target-one',
          commandDigest: 'external-digest',
          command: { value: 3 },
          qualification: { fixture: 'original-write-qualified' },
        },
      },
    },
  }
  await world.control({ kind: 'accept', input })
  const operation = {
    ref: {
      scope,
      owner: 'internal.external-write' as const,
      principalRef: input.principalRef,
      operationId: input.request.command.operationId,
    },
    requestDigest: digest(input.request),
  }
  const { combinationVersion, manifestDigest } = world.combination('mutation')
  const commands = [
    {
      participant: 'fixture.writer',
      facts: { command: { value: 3 }, guards: ['original-guard'], budget: 11 },
    },
    { participant: 'fixture.basis-adapter', facts: {} },
    { participant: 'fixture.result-adapter', facts: {} },
  ]
  const authority = {
    protocol: 'governance-external-write-execution/1',
    requestDigest: operation.requestDigest,
    writer: 'fixture.writer',
    commands,
  }
  if (variant === 'digest') authority.requestDigest = 'b'.repeat(64)
  if (variant === 'writer') authority.writer = 'missing-writer'
  if (variant === 'protocol') authority.protocol = 'unknown-execution/1'
  if (variant === 'duplicate') authority.commands = [...commands, commands[0]!]
  if (variant === 'foreign-planner') {
    authority.commands = [{ participant: METADATA_PLANNER, facts: {} }, ...commands]
  }
  const execution = executionSchema.parse({ combinationVersion, manifestDigest, authority })
  await world.control({ kind: 'submit', binding: operation, execution })
  const request = { binding: operation, execution }
  const envelope: CommitRequestV2 = {
    identity: operationIdentity(world.domain.transactionDomain, operation.ref),
    combinationVersion,
    manifestDigest,
    commands: [
      ...authority.commands,
      { participant: BASIS, facts: { request: json(request) } },
      { participant: TERMINAL, facts: { request: json(request) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
    ],
  }
  return { world, operation, envelope }
}
async function save(
  world: Awaited<ReturnType<typeof openActivation>>,
  operation: Awaited<ReturnType<typeof prepared>>['operation'],
  envelope: CommitRequestV2,
) {
  const request = { kind: 'persist-stage', input: { binding: operation, stage: 'apply', envelope } }
  return world.commit('metadata', [
    { participant: METADATA_PLANNER, facts: { request: json(request) } },
    { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
  ])
}
it('keeps the complete external apply envelope through retry and restart without executing it', async () => {
  const { world, operation, envelope } = await prepared()
  const saved = await save(world, operation, envelope)
  expect(saved.kind, JSON.stringify(saved)).toBe('committed')
  const original = await world.readStage(operation, 'apply')
  expect(original).toEqual({
    kind: 'stored',
    stage: 'apply',
    envelope,
    inputDigest: inputDigestV2(envelope),
  })
  expect((await save(world, operation, envelope)).kind).toBe('committed')
  const reordered = { ...envelope, commands: [...envelope.commands].reverse() }
  expect(inputDigestV2(reordered)).toBe(inputDigestV2(envelope))
  expect(await world.response(await save(world, operation, reordered))).toMatchObject({
    kind: 'conflict',
  })
  expect(await world.readStage(operation, 'apply')).toEqual(original)
  worlds.splice(worlds.indexOf(world), 1)
  await world.close(false)
  const reopened = await openActivation(world.root)
  worlds.push(reopened)
  expect(await reopened.readStage(operation, 'apply')).toEqual(original)
})
it('rejects substituted execution facts and coordination before storing any apply envelope', async () => {
  const { world, operation, envelope } = await prepared()
  const changes: CommitRequestV2[] = [
    { ...envelope, commands: envelope.commands.filter(c => c.participant !== 'fixture.writer') },
    {
      ...envelope,
      commands: envelope.commands.map(c =>
        c.participant === 'fixture.writer' ? { ...c, facts: { ...c.facts, budget: 12 } } : c,
      ),
    },
    {
      ...envelope,
      commands: envelope.commands.map(c =>
        c.participant === 'fixture.writer' ? { ...c, facts: { ...c.facts, guards: [] } } : c,
      ),
    },
    { ...envelope, commands: [...envelope.commands, { participant: 'fixture.extra', facts: {} }] },
    {
      ...envelope,
      commands: [...envelope.commands, { participant: 'governance.mutation-plan', facts: {} }],
    },
    { ...envelope, commands: [...envelope.commands, envelope.commands[0]!] },
    { ...envelope, commands: envelope.commands.filter(c => c.participant !== TERMINAL) },
    { ...envelope, commands: envelope.commands.filter(c => c.participant !== BASIS) },
    {
      ...envelope,
      commands: envelope.commands.map(c =>
        c.participant === TERMINAL ? { ...c, facts: { request: { forged: true } } } : c,
      ),
    },
    {
      ...envelope,
      commands: envelope.commands.map(c =>
        c.participant === GOVERNANCE_OWNER ? { ...c, facts: { requestDigest: 'b'.repeat(64) } } : c,
      ),
    },
    { ...envelope, combinationVersion: 'different/1' },
    { ...envelope, identity: { ...envelope.identity, operationKey: 'b'.repeat(64) } },
  ]
  for (const changed of changes) {
    expect(await save(world, operation, changed)).toMatchObject({ kind: 'rolled_back' })
    expect(await world.readStage(operation, 'apply')).toEqual({ kind: 'unplanned' })
  }
})

it.each(['digest', 'writer', 'protocol', 'duplicate', 'foreign-planner'])(
  'rejects an external execution with invalid %s even when its envelope repeats that plan',
  async variant => {
    const { world, operation, envelope } = await prepared(variant)
    expect(await save(world, operation, envelope)).toMatchObject({ kind: 'rolled_back' })
    expect(await world.readStage(operation, 'apply')).toEqual({ kind: 'unplanned' })
  },
)
