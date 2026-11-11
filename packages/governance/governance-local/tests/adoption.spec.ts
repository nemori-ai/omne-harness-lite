import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { GovernanceBasisSchema } from '@omne-harness/governance-contract'
import { openAdoptionWorld, adoption, found, target } from './adoption-world.ts'
import { binding, execution, scope } from './operation-world.ts'
import { declaration } from './definition-fixture.ts'
import { canonical } from '../src/encoding.ts'
const worlds: Awaited<ReturnType<typeof openAdoptionWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const world = await openAdoptionWorld()
  worlds.push(world)
  return world
}
const adopted = z.object({ kind: z.literal('adopted'), basis: GovernanceBasisSchema })
const view = z.object({
  members: z.array(z.array(z.string())),
  definitions: z.array(z.array(z.string())),
  targets: z.array(z.array(z.string())),
})

it('publishes a complete bundle with no selected targets and preserves its original receipt', async () => {
  const w = await open(),
    candidate = await w.register('register')
  const { input, evidence } = adoption([{ candidate, targets: [] }], 'adopt', 1)
  const record = await w.run(input, evidence)
  expect(record.state).toBe('committed')
  expect(adopted.parse(record.result).basis).toMatchObject({
    declarationRevision: 1,
    adoptionRevision: 1,
    selectedDefinitions: [candidate.declaration.reference],
  })
  const selected = view.parse(await w.call({ kind: 'selection', scope }))
  expect(selected.members).toHaveLength(1)
  expect(selected.definitions).toHaveLength(1)
  expect(selected.targets).toEqual([])
  expect(
    found.parse(await w.call({ kind: 'apply', binding: binding(input), execution })).record,
  ).toEqual(record)
})
it('keeps precise shared and separate target support after real adoption and withdrawal', async () => {
  const w = await open(),
    left = await w.register('left'),
    right = await w.register('right')
  const { input, evidence } = adoption(
    [
      { candidate: left, targets: [target('a'), target('shared')] },
      { candidate: right, targets: [target('b'), target('shared')] },
    ],
    'adopt',
    2,
  )
  expect((await w.run(input, evidence)).state).toBe('committed')
  expect(view.parse(await w.call({ kind: 'selection', scope })).targets).toHaveLength(3)
  const withdrawn = await w.run({
    principalRef: 'alice',
    epoch: 'first',
    transactionDomain: input.transactionDomain,
    request: {
      owner: 'withdraw',
      command: { operationId: 'withdraw-left', contribution: left.contribution },
    },
  })
  expect(withdrawn.result).toMatchObject({ kind: 'released', adoptionRevision: 2 })
  const selected = view.parse(await w.call({ kind: 'selection', scope }))
  expect(selected.members).toHaveLength(1)
  expect(selected.targets.map(row => row[1]).sort()).toEqual(
    [canonical(target('b')), canonical(target('shared'))].sort(),
  )
})
it('permits only one of two adopters with the same revisions', async () => {
  const w = await open(),
    candidate = await w.register('one')
  const first = adoption([{ candidate, targets: [target('a')] }], 'first', 1)
  const second = adoption([{ candidate, targets: [target('b')] }], 'second', 1)
  const results = await Promise.all([
    w.run(first.input, first.evidence),
    w.run(second.input, second.evidence),
  ])
  expect(results.filter(r => r.state === 'committed')).toHaveLength(1)
  expect(results.filter(r => r.state === 'aborted').map(r => r.result)).toEqual([
    { kind: 'conflict', reason: 'basis' },
  ])
  expect(view.parse(await w.call({ kind: 'selection', scope })).targets).toHaveLength(1)
})
it('rolls back selected relations, revision and receipt together before retry', async () => {
  const w = await open(),
    candidate = await w.register('one')
  const { input, evidence } = adoption([{ candidate, targets: [target('a')] }], 'adopt', 1)
  await w.call({ kind: 'accept', input })
  await w.call({ kind: 'submit', binding: binding(input), execution })
  const result = await w.commit({
    kind: 'apply',
    binding: binding(input),
    execution,
    evidence,
    rollback: true,
  })
  expect(result.kind).toBe('rolled_back')
  expect(view.parse(await w.call({ kind: 'selection', scope })).definitions).toEqual([])
  expect(found.parse(await w.call({ kind: 'read', ref: binding(input).ref })).record.state).toBe(
    'submitted',
  )
  expect(adopted.parse((await w.run(input, evidence)).result).basis.adoptionRevision).toBe(1)
})
it.each([
  'omitted',
  'extra',
  'duplicate',
  'generation',
  'scope',
  'digest',
  'duplicate-target',
] as const)('rejects %s without replacing the previous selection', async defect => {
  const w = await open(),
    candidate = await w.register('one')
  const first = adoption([{ candidate, targets: [target('original')] }], 'first', 1)
  expect((await w.run(first.input, first.evidence)).state).toBe('committed')
  const before = await w.call({ kind: 'selection', scope })
  const next = adoption([{ candidate, targets: [target('replacement')] }], 'next', 1, 1)
  const command = next.input.request.command
  if (defect === 'omitted') command.complete = []
  if (defect === 'extra')
    command.complete.push({
      contribution: { ...candidate.contribution, registrationId: 'extra' },
      selectedTargets: [],
    })
  if (defect === 'duplicate') command.complete.push(structuredClone(command.complete[0]!))
  if (defect === 'generation')
    command.complete[0]!.contribution = { ...candidate.contribution, generation: 'other' }
  if (defect === 'scope')
    command.complete[0]!.contribution = {
      ...candidate.contribution,
      scope: { ...scope, logicalServiceId: 'another' },
    }
  if (defect === 'digest') command.collection.digest = 'b'.repeat(64)
  if (defect === 'duplicate-target')
    command.complete[0]!.selectedTargets.push(target('replacement'))
  next.evidence.binding = binding(next.input)
  expect((await w.run(next.input, next.evidence)).result).toEqual({
    kind: 'conflict',
    reason: 'selection',
  })
  expect(await w.call({ kind: 'selection', scope })).toEqual(before)
})
it.each([
  'binding',
  'epoch',
  'domain',
  'disabled',
  'origin',
  'definition',
  'enforcement',
  'missing-target',
] as const)('rejects invalid current %s facts', async defect => {
  const w = await open(),
    candidate = await w.register('one')
  const { input, evidence } = adoption([{ candidate, targets: [target('a')] }], 'adopt', 1)
  if (defect === 'binding')
    evidence.binding = { ...evidence.binding, requestDigest: 'b'.repeat(64) }
  if (defect === 'epoch') evidence.epoch = 'old'
  if (defect === 'domain') evidence.transactionDomain = 'another'
  if (defect === 'disabled') evidence.targets[0]!.enabled = false
  if (defect === 'origin')
    evidence.targets[0]!.origin = {
      kind: 'independent',
      providerId: 'other',
      definitionRef: 'other/1',
    }
  if (defect === 'definition')
    evidence.targets[0]!.definition = { ...evidence.targets[0]!.definition, version: '2' }
  if (defect === 'enforcement')
    evidence.enforcementBindings = [
      { ...evidence.enforcementBindings[0]!, implementationRef: 'other/1' },
    ]
  if (defect === 'missing-target') evidence.targets = []
  expect((await w.run(input, evidence)).result).toEqual({
    kind: 'unavailable',
    owner: 'adoption-current',
  })
  expect(view.parse(await w.call({ kind: 'selection', scope })).members).toEqual([])
})
it('requires a current fact even for empty adoption and rejects empty lists hiding active leases', async () => {
  const w = await open(),
    empty = adoption([], 'empty', 0)
  expect((await w.run(empty.input)).result).toEqual({
    kind: 'unavailable',
    owner: 'adoption-current',
  })
  const valid = adoption([], 'valid-empty', 0)
  expect(
    adopted.parse((await w.run(valid.input, valid.evidence)).result).basis.selectedDefinitions,
  ).toEqual([])
  await w.register('one')
  const hidden = adoption([], 'hidden', 1, 1)
  expect((await w.run(hidden.input, hidden.evidence)).result).toEqual({
    kind: 'conflict',
    reason: 'selection',
  })
})
it('refuses conflicting definition origins and excessive support count', async () => {
  const w = await open(),
    left = await w.register('one')
  const other = declaration()
  other.reference.definitionId = 'another'
  other.reference.digest = 'b'.repeat(64)
  other.origin = { kind: 'independent', providerId: 'another', definitionRef: 'another/1' }
  other.permissions[0]!.reference.origin = other.origin
  const right = await w.register('two', other)
  const conflict = adoption(
    [
      { candidate: left, targets: [] },
      { candidate: right, targets: [] },
    ],
    'conflicting',
    2,
  )
  expect((await w.run(conflict.input, conflict.evidence)).result).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  const many = adoption(
    [
      { candidate: left, targets: Array.from({ length: 128 }, (_, i) => target(String(i))) },
      { candidate: right, targets: [target('last')] },
    ],
    'many',
    2,
  )
  many.evidence.targets = []
  expect((await w.run(many.input, many.evidence)).result).toEqual({
    kind: 'limited',
    resource: 'target-supports',
  })
})

it('recognizes a committed adoption after disk reopen without new current evidence', async () => {
  let w = await open()
  const candidate = await w.register('one')
  const { input, evidence } = adoption([{ candidate, targets: [target('a')] }], 'adopt', 1)
  const receipt = await w.run(input, evidence)
  const before = await w.call({ kind: 'selection', scope })
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openAdoptionWorld(w.root)
  worlds.push(w)
  expect(await w.run(input)).toEqual(receipt)
  expect(await w.call({ kind: 'selection', scope })).toEqual(before)
})
it('accepts collection order changes and removes stale epoch selection on a new empty adoption', async () => {
  const w = await open(),
    left = await w.register('left'),
    right = await w.register('right')
  const members = [
    { candidate: left, targets: [target('a'), target('b')] },
    { candidate: right, targets: [] },
  ]
  const first = adoption(members, 'first', 2)
  first.input.request.command.complete.reverse()
  first.input.request.command.complete[1]!.selectedTargets.reverse()
  first.evidence.binding = binding(first.input)
  const original = await w.run(first.input, first.evidence)
  expect(original.state).toBe('committed')
  await w.call({ kind: 'bootstrap', input: { scope, epoch: 'second', previousEpoch: 'first' } })
  const next = adoption([], 'second', 3, 2)
  next.input.epoch = 'second'
  next.evidence.epoch = 'second'
  next.evidence.binding = binding(next.input)
  expect(adopted.parse((await w.run(next.input, next.evidence)).result).basis).toMatchObject({
    epoch: 'second',
    adoptionRevision: 3,
    selectedDefinitions: [],
  })
  expect(view.parse(await w.call({ kind: 'selection', scope }))).toEqual({
    members: [],
    definitions: [],
    targets: [],
  })
  expect(await w.run(first.input)).toEqual(original)
})
it('checks the current definition byte budget before reading all bodies into the plan', async () => {
  const w = await open()
  const members = []
  for (let i = 0; i < 10; i++) {
    const value = declaration()
    value.reference.definitionId = 'large-' + i
    value.permissions = []
    value.enforcementBindings = []
    value.settings = [
      {
        providerId: 'large-' + i,
        definitionId: 'large',
        version: '1',
        items: [],
        groups: Array.from({ length: 110 }, (_, n) => ({
          id: 'group-' + n,
          parentId: null,
          title: 'Group',
          description: 'x'.repeat(2000),
          order: n,
        })),
      },
    ]
    members.push({ candidate: await w.register('large-' + i, value), targets: [] })
  }
  const { input, evidence } = adoption(members, 'adopt', 10)
  expect((await w.run(input, evidence)).result).toEqual({
    kind: 'limited',
    resource: 'current-declarations',
  })
  expect(view.parse(await w.call({ kind: 'selection', scope })).definitions).toEqual([])
})

it('allows more than one bundle of enforcement mappings within the declared scope budget', async () => {
  const w = await open(),
    members = []
  for (let i = 0; i < 2; i++) {
    const value = declaration()
    value.reference.definitionId = 'bindings-' + i
    value.settings = []
    value.permissions = []
    value.enforcementBindings = Array.from({ length: i === 0 ? 128 : 1 }, (_, n) => ({
      capabilityId: 'cap-' + i + '-' + n,
      enforcementKey: 'call',
      implementationRef: 'impl/1',
      action: 'call',
      interpretationRef: 'policy/1',
    }))
    members.push({ candidate: await w.register('bindings-' + i, value), targets: [] })
  }
  const { input, evidence } = adoption(members, 'adopt', 2)
  expect(evidence.enforcementBindings).toHaveLength(129)
  expect(
    adopted.parse((await w.run(input, evidence)).result).basis.selectedDefinitions,
  ).toHaveLength(2)
})
