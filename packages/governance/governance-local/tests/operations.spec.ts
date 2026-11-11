import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { recordSchema, type AcceptOperation } from '../src/operation-schema.ts'
import { command, binding, scope, bundle, execution, openOperations } from './operation-world.ts'
const worlds: Awaited<ReturnType<typeof openOperations>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const world = await openOperations()
  worlds.push(world)
  expect(
    await world.call({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } }),
  ).toMatchObject({ kind: 'opened' })
  return world
}
const found = z.object({ kind: z.literal('found'), record: recordSchema })
async function run(world: Awaited<ReturnType<typeof openOperations>>, input: AcceptOperation) {
  await world.call({ kind: 'accept', input })
  await world.call({ kind: 'submit', binding: binding(input), execution })
  return found.parse(await world.call({ kind: 'apply', binding: binding(input), execution })).record
}
const registration = z.object({
  kind: z.literal('registered'),
  contribution: z.object({
    scope: z.unknown(),
    contributorId: z.string(),
    generation: z.string(),
    registrationId: z.string(),
  }),
})
it('recognizes the same operation and original receipt without replacing its command or envelope', async () => {
  const w = await open(),
    input = command()
  const first = found.parse(await w.call({ kind: 'accept', input })).record
  expect(first.state).toBe('accepted')
  expect(await w.call({ kind: 'accept', input })).toEqual({ kind: 'found', record: first })
  const changed = structuredClone(input)
  if (changed.request.owner !== 'contribute') throw new Error('test request')
  changed.request.command.generation = 'other'
  expect(await w.call({ kind: 'accept', input: changed })).toEqual({
    kind: 'conflict',
    reason: 'operation',
  })
  expect(await w.call({ kind: 'accept', input: { ...input, transactionDomain: 'other' } })).toEqual(
    { kind: 'conflict', reason: 'operation' },
  )
  await w.call({ kind: 'submit', binding: binding(input), execution })
  expect(
    await w.call({
      kind: 'submit',
      binding: binding(input),
      execution: { ...execution, manifestDigest: 'b'.repeat(64) },
    }),
  ).toEqual({ kind: 'conflict', reason: 'operation' })
  const result = found.parse(
    await w.call({ kind: 'apply', binding: binding(input), execution }),
  ).record
  expect(result.state).toBe('committed')
  expect(await w.call({ kind: 'seal', binding: binding(input) })).toEqual({
    kind: 'found',
    record: result,
  })
  expect(await w.call({ kind: 'apply', binding: binding(input), execution })).toEqual({
    kind: 'found',
    record: result,
  })
})
it('preserves a pending original envelope across restart and seals before a late effect', async () => {
  let w = await open()
  const input = command()
  await w.call({ kind: 'accept', input })
  await w.call({ kind: 'submit', binding: binding(input), execution })
  const saved = await w.call({ kind: 'read', ref: binding(input).ref })
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openOperations(w.root)
  worlds.push(w)
  expect(await w.call({ kind: 'read', ref: binding(input).ref })).toEqual(saved)
  const sealed = found.parse(await w.call({ kind: 'seal', binding: binding(input) })).record
  expect(sealed.state).toBe('aborted')
  expect(await w.call({ kind: 'apply', binding: binding(input), execution })).toEqual({
    kind: 'found',
    record: sealed,
  })
  expect(await w.call({ kind: 'read', ref: binding(command('absent')).ref })).toEqual({
    kind: 'absent',
  })
})
it('rolls back the lease, declaration revision and operation terminal together', async () => {
  const w = await open(),
    input = command()
  await w.call({ kind: 'accept', input })
  await w.call({ kind: 'submit', binding: binding(input), execution })
  expect(
    await w.commit({ kind: 'apply', binding: binding(input), execution, rollback: true }),
  ).toMatchObject({
    kind: 'rolled_back',
    responses: [{ reply: { kind: 'conflict', basis: { reason: 'fixture-rollback' } } }],
  })
  expect(found.parse(await w.call({ kind: 'read', ref: binding(input).ref })).record.state).toBe(
    'submitted',
  )
  const result = found.parse(
    await w.call({ kind: 'apply', binding: binding(input), execution }),
  ).record
  expect(result.result).toMatchObject({ kind: 'registered', declarationRevision: 1 })
})
it('fences old epochs and recognizes old success without reviving its lease', async () => {
  const w = await open(),
    success = command('success'),
    pending = command('pending')
  const committed = await run(w, success)
  await w.call({ kind: 'accept', input: pending })
  await w.call({ kind: 'submit', binding: binding(pending), execution })
  await w.call({ kind: 'bootstrap', input: { scope, epoch: 'second', previousEpoch: 'first' } })
  expect(
    await w.call({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } }),
  ).toEqual({ kind: 'conflict', reason: 'basis' })
  expect(
    found.parse(await w.call({ kind: 'apply', binding: binding(pending), execution })).record,
  ).toMatchObject({ state: 'aborted', result: { kind: 'conflict', reason: 'basis' } })
  expect(await w.call({ kind: 'accept', input: success })).toEqual({
    kind: 'found',
    record: committed,
  })
  expect(await w.call({ kind: 'accept', input: command('late') })).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
})
it('withdraws exact target support while preserving sibling support and original registration results', async () => {
  const w = await open(),
    left = command('left'),
    right = command('right')
  const a = await run(w, left),
    b = await run(w, right)
  const l = registration.parse(a.result).contribution,
    r = registration.parse(b.result).contribution
  await w.call({
    kind: 'support',
    scope,
    definition: bundle.reference,
    epoch: 'first',
    members: [
      { registrationId: l.registrationId, targets: ['a', 'shared'] },
      { registrationId: r.registrationId, targets: ['b', 'shared'] },
    ],
    targets: ['a', 'b', 'shared'],
  })
  const withdraw: AcceptOperation = {
    ...left,
    request: {
      owner: 'withdraw',
      command: { operationId: 'release', contribution: { ...l, scope } },
    },
  }
  const removed = await run(w, withdraw)
  expect(removed).toMatchObject({
    state: 'committed',
    result: { kind: 'released', adoptionRevision: 1 },
  })
  expect(await w.call({ kind: 'targets', scope })).toEqual({
    kind: 'targets',
    rows: [['b'], ['shared']],
  })
  expect(found.parse(await w.call({ kind: 'read', ref: binding(left).ref })).record).toEqual(a)
  expect(
    await run(w, {
      ...withdraw,
      request: {
        owner: 'withdraw',
        command: {
          ...withdraw.request.command,
          operationId: 'again',
          contribution: { ...l, scope },
        },
      },
    }),
  ).toMatchObject({ result: { kind: 'already-released', adoptionRevision: 1 } })
})
it('rejects a different principal or generation and a changed immutable declaration', async () => {
  const w = await open(),
    input = command()
  const first = await run(w, input),
    ref = registration.parse(first.result).contribution
  for (const [principalRef, generation] of [
    ['mallory', ref.generation],
    ['alice', 'other'],
  ] as const) {
    const denied: AcceptOperation = {
      ...input,
      principalRef,
      request: {
        owner: 'withdraw',
        command: {
          operationId: 'withdraw-' + principalRef,
          contribution: { ...ref, scope, generation },
        },
      },
    }
    expect(await run(w, denied)).toMatchObject({ state: 'aborted', result: { kind: 'denied' } })
  }
  const change = command('changed')
  if (change.request.owner !== 'contribute') throw new Error('test request')
  change.request.command.declaration.reference.digest = 'b'.repeat(64)
  expect(await run(w, change)).toMatchObject({
    state: 'aborted',
    result: { kind: 'conflict', reason: 'definition' },
  })
})

it('bounds accepted work and recovers capacity only after a terminal', async () => {
  const w = await open()
  for (let i = 0; i < 32; i++)
    expect(await w.call({ kind: 'accept', input: command('pending-' + i) })).toMatchObject({
      kind: 'found',
    })
  expect(await w.call({ kind: 'accept', input: command('overflow') })).toEqual({
    kind: 'limited',
    resource: 'pending-operations',
  })
  expect(await w.call({ kind: 'accept', input: command('pending-0') })).toMatchObject({
    kind: 'found',
  })
  await w.call({ kind: 'seal', binding: binding(command('pending-0')) })
  expect(await w.call({ kind: 'accept', input: command('overflow') })).toMatchObject({
    kind: 'found',
  })
})
it('serializes competition for the final registration slot', async () => {
  const w = await open()
  for (let i = 0; i < 127; i++)
    expect((await run(w, command('lease-' + i))).state).toBe('committed')
  const inputs = [command('last-a'), command('last-b')]
  for (const input of inputs) {
    await w.call({ kind: 'accept', input })
    await w.call({ kind: 'submit', binding: binding(input), execution })
  }
  const outcomes = await Promise.all(
    inputs.map(input => w.call({ kind: 'apply', binding: binding(input), execution })),
  )
  const records = outcomes.map(value => found.parse(value).record)
  expect(records.filter(record => record.state === 'committed')).toHaveLength(1)
  expect(records.find(record => record.state === 'aborted')?.result).toEqual({
    kind: 'limited',
    resource: 'contributions',
  })
}, 20000)

it('limits serialized command and execution bytes before saving oversized custody', async () => {
  const w = await open(),
    input = command()
  expect(
    await w.call({ kind: 'accept', input: { ...input, oversized: 'x'.repeat(1024 * 1024) } }),
  ).toEqual({ kind: 'limited', resource: 'command-bytes' })
  expect(await w.call({ kind: 'read', ref: binding(input).ref })).toEqual({ kind: 'absent' })
  await w.call({ kind: 'accept', input })
  expect(
    await w.call({
      kind: 'submit',
      binding: binding(input),
      execution: { ...execution, authority: 'x'.repeat(1024 * 1024) },
    }),
  ).toEqual({ kind: 'limited', resource: 'execution-bytes' })
  expect(found.parse(await w.call({ kind: 'read', ref: binding(input).ref })).record.state).toBe(
    'accepted',
  )
})

it('counts online items once per definition and returns capacity after the final supporting lease exits', async () => {
  const w = await open()
  function fullBundle(index: number, operationId = 'items-' + index) {
    const input = command(operationId)
    if (input.request.owner !== 'contribute') throw new Error('test request')
    input.request.command.declaration = {
      ...bundle,
      reference: { ...bundle.reference, version: String(index) },
      settings: [
        {
          providerId: 'example',
          definitionId: 'features',
          version: String(index),
          groups: [
            {
              id: 'general',
              parentId: null,
              title: 'General',
              description: 'Feature switches',
              order: 0,
            },
          ],
          items: Array.from({ length: 128 }, (_, n) => ({
            id: 'feature-' + n,
            groupId: 'general',
            category: 'preference' as const,
            presentation: {
              title: 'Feature ' + n,
              description: 'Enable this feature',
              impact: 'Used on next read',
              clear: 'Inherit outer value',
              adoption: 'next-read' as const,
            },
            valueSchema: { type: 'boolean' },
            default: { kind: 'value' as const, value: false },
            merge: 'override' as const,
            sensitivity: 'ordinary' as const,
          })),
        },
      ],
    }
    return input
  }
  let first = await run(w, fullBundle(1))
  for (let i = 2; i <= 8; i++) expect((await run(w, fullBundle(i))).state).toBe('committed')
  expect(await run(w, fullBundle(9))).toMatchObject({
    state: 'aborted',
    result: { kind: 'limited', resource: 'active-items' },
  })
  expect((await run(w, fullBundle(8, 'sibling'))).state).toBe('committed')
  const ref = registration.parse(first.result).contribution
  await run(w, {
    ...command(),
    request: {
      owner: 'withdraw',
      command: { operationId: 'free-items', contribution: { ...ref, scope } },
    },
  })
  first = await run(w, fullBundle(9, 'replacement'))
  expect(first.state).toBe('committed')
}, 20000)
