import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  ConsumerReceiptSchema,
  OperationRefSchema,
  RegisterRequestSchema,
  type OperationRef,
  type RequestRef,
} from '@omne-harness/human-intervention'
import {
  createHitlSqlOperations,
  IndependentCommandSchema,
  RequestRecordSchema,
  SqlCommandSchema,
  independentControlCommands,
  independentRequestCommands,
  type SqlCommand,
} from '@omne-harness/human-intervention-local'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { digest, json, operationKey } from '../src/encoding.ts'
import { StoredOperationSchema } from '../src/operation-schema.ts'
import { SqlCommandResultSchema } from '../src/request-schema.ts'
import { openWorld } from './world.ts'

const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
const waitRef = {
  owner: 'independent',
  waitId: 'wait-a',
  incarnation: 'one',
  destination: 'independent-inbox',
}
function operation(id: string, actorRef = 'owner') {
  return OperationRefSchema.parse({ tenantRef: 'tenant-a', actorRef, operationId: id })
}
const registration = RegisterRequestSchema.parse({
  protocol: 'hitl/1',
  operation: operation('register'),
  preparationRef: 'prepared',
  displayContext: 'Two questions',
  origin: {
    kind: 'independent',
    originRef: 'form',
    wait: waitRef,
    positionRef: 'step-a',
    adoptionRef: 'implementation-v1',
  },
  questions: ['first', 'second'].map(cardId => ({
    kind: 'question',
    cardId,
    title: cardId,
    description: 'Please answer',
    options: [{ id: 'yes', label: 'Yes', description: 'Continue' }],
  })),
})
const preparation = IndependentCommandSchema.parse({
  kind: 'prepare',
  operation: operation('prepare'),
  preparation: {
    registration,
    readers: ['owner', 'human', 'other-human'],
    responders: ['human', 'other-human'],
    compatibleImplementations: ['implementation-v1'],
  },
})
type World = Awaited<ReturnType<typeof openWorld>>
function commit(world: World, operationRef: OperationRef, commands: readonly FactCommandV2[]) {
  return world.storage.commit({
    identity: {
      ...world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(operationRef),
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands,
  })
}
async function register(world: World) {
  expect(
    (await commit(world, operation('prepare'), independentControlCommands(preparation))).kind,
  ).toBe('committed')
  const result = await commit(
    world,
    registration.operation,
    independentRequestCommands({ method: 'registerRequest', command: registration }, waitRef),
  )
  const parsed = resultValue(result)
  if (parsed.kind !== 'registered') throw new Error(JSON.stringify(parsed))
  return parsed.requestRef
}
function resultValue(result: Awaited<ReturnType<typeof commit>>) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  const envelope = result.responses.find(item => item.participant === 'hitl.requests')?.reply
    .response
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    !('result' in envelope)
  )
    throw new Error('Expected durable result envelope')
  return SqlCommandResultSchema.parse(envelope.result)
}
function submit(ref: RequestRef, id: string, cardId = 'first', actor = 'human'): SqlCommand {
  return SqlCommandSchema.parse({
    method: 'submitReply',
    command: {
      protocol: 'hitl/1',
      operation: operation(id, actor),
      cardRef: { request: ref, cardId },
      expectedRevision: '0',
      reply: { kind: 'text', text: ' original answer ' },
    },
  })
}
async function request(world: World, ref: RequestRef) {
  const read = await world.storage.read({
    domain: world.combination,
    handler: 'hitl.request-read',
    protocol: 'hitl-sql/2',
    requestKey: randomUUID(),
    input: json({ kind: 'request', ref, actorRef: 'owner' }),
  })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  return read.output === null ? null : RequestRecordSchema.parse(read.output)
}
async function state(world: World) {
  const read = await world.storage.read({
    domain: world.combination,
    handler: 'hitl.independent-read',
    protocol: 'independent-wait/2',
    requestKey: randomUUID(),
    input: json({ tenantRef: 'tenant-a', waitRef, actorRef: 'owner', kind: 'state' }),
  })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  return read.output
}
async function recovery(world: World, kind: 'bind' | 'consume', command: unknown) {
  const input = IndependentCommandSchema.parse({ kind, command })
  if (input.kind !== 'bind' && input.kind !== 'consume') throw new Error('Expected recovery input')
  const result = await commit(world, input.command.operation, independentControlCommands(input))
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return StoredOperationSchema.parse(
    result.responses.find(item => item.participant === 'hitl.independent-state')?.reply.response,
  ).result
}

it('commits registration with the original wait, and a late failure leaves neither active', async () => {
  const world = await open()
  await commit(world, operation('prepare'), independentControlCommands(preparation))
  const input = { method: 'registerRequest', command: registration } satisfies SqlCommand
  const failed = await commit(world, registration.operation, [
    ...independentRequestCommands(input, waitRef),
    { participant: 'fixture.hitl.late-reject', facts: {} },
  ])
  expect(failed.kind).toBe('rolled_back')
  expect(await state(world)).toMatchObject({ active: null, state: { checkpoint: 'waiting' } })
  const changed = RegisterRequestSchema.parse({
    ...registration,
    operation: operation('retry-register'),
  })
  const mismatch = resultValue(
    await commit(
      world,
      changed.operation,
      independentRequestCommands({ method: 'registerRequest', command: changed }, waitRef),
    ),
  )
  expect(mismatch).toMatchObject({ kind: 'conflict', reason: 'registration-changed' })
  expect(await state(world)).toMatchObject({ active: null })
})
it('rejects a composition that omits the original wait writer', async () => {
  const world = await open()
  await commit(world, operation('prepare'), independentControlCommands(preparation))
  const commands = independentRequestCommands(
    { method: 'registerRequest', command: registration },
    waitRef,
  ).filter(item => item.participant !== 'hitl.independent-state')
  expect(await commit(world, registration.operation, commands)).toMatchObject({
    kind: 'rejected_before_accept',
    reason: 'participant_dependency_missing',
  })
  expect(await state(world)).toMatchObject({ active: null })
})
it('serializes competing human answers and recovers the original submission on replay', async () => {
  const world = await open()
  const ref = await register(world)
  const a = submit(ref, 'answer-a')
  const b = submit(ref, 'answer-b', 'first', 'other-human')
  const results = await Promise.all(
    [a, b].map(input =>
      commit(world, input.command.operation, independentRequestCommands(input, waitRef)),
    ),
  )
  expect(results.map(result => resultValue(result).kind).sort()).toEqual([
    'already-decided',
    'decided',
  ])
  expect(await commit(world, a.command.operation, independentRequestCommands(a, waitRef))).toEqual(
    results[0],
  )
  expect((await request(world, ref))?.cards[0]).toMatchObject({
    kind: 'decided',
    decision: { reply: { text: ' original answer ' } },
  })
  expect(await state(world)).toMatchObject({
    active: { requestRef: ref },
    state: { checkpoint: 'waiting' },
  })
})
it('rolls both the decision and durable inbox back if any participant fails', async () => {
  const world = await open()
  const ref = await register(world)
  const input = submit(ref, 'failed-answer')
  expect(
    (
      await commit(world, input.command.operation, [
        ...independentRequestCommands(input, waitRef),
        { participant: 'fixture.hitl.late-reject', facts: {} },
      ])
    ).kind,
  ).toBe('rolled_back')
  expect((await request(world, ref))?.cards[0]).toMatchObject({ kind: 'pending' })
  const bind = {
    protocol: 'hitl/1',
    operation: operation('bind'),
    waitRef,
    expectedGeneration: '0',
    instanceId: 'process-a',
    implementationRef: 'implementation-v1',
  }
  await recovery(world, 'bind', bind)
  const read = await world.storage.read({
    domain: world.combination,
    handler: 'hitl.independent-read',
    protocol: 'independent-wait/2',
    requestKey: randomUUID(),
    input: json({
      tenantRef: 'tenant-a',
      waitRef,
      actorRef: 'owner',
      kind: 'inbox',
      receiverGeneration: '1',
    }),
  })
  expect(read).toMatchObject({ kind: 'read', output: { kind: 'page', decisions: [] } })
})
it('restores offline answers, fences old receivers, and crosses a batch barrier only once', async () => {
  const world = await open()
  const ref = await register(world)
  const first = submit(ref, 'first-answer')
  const second = submit(ref, 'second-answer', 'second')
  const firstResult = resultValue(
    await commit(world, first.command.operation, independentRequestCommands(first, waitRef)),
  )
  const secondResult = resultValue(
    await commit(world, second.command.operation, independentRequestCommands(second, waitRef)),
  )
  if (firstResult.kind !== 'decided' || secondResult.kind !== 'decided')
    throw new Error('Expected decisions')
  await world.close()
  const restarted = await open({ root: world.root })
  expect((await request(restarted, ref))?.cards.every(card => card.kind === 'decided')).toBe(true)
  const bind = {
    protocol: 'hitl/1',
    operation: operation('bind-one'),
    waitRef,
    expectedGeneration: '0',
    instanceId: 'process-b',
    implementationRef: 'implementation-v1',
  }
  expect(await recovery(restarted, 'bind', bind)).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  expect(
    await recovery(restarted, 'bind', {
      ...bind,
      operation: operation('bind-two'),
      expectedGeneration: '1',
      instanceId: 'process-c',
    }),
  ).toMatchObject({ kind: 'bound', receiverGeneration: '2' })
  const consume = {
    protocol: 'hitl/1',
    operation: operation('consume-one'),
    waitRef,
    receiverGeneration: '2',
    decisionRef: firstResult.decisionRef,
    consumeOperationId: 'consume-one',
  }
  expect(
    await recovery(restarted, 'consume', {
      ...consume,
      operation: operation('old-generation'),
      consumeOperationId: 'old-generation',
      receiverGeneration: '1',
    }),
  ).toMatchObject({ kind: 'stale-generation' })
  const received = await recovery(restarted, 'consume', consume)
  expect(received).toMatchObject({ kind: 'accepted' })
  expect(await state(restarted)).toMatchObject({ state: { checkpoint: 'waiting' } })
  expect(await recovery(restarted, 'consume', consume)).toEqual(received)
  expect(
    await recovery(restarted, 'consume', {
      ...consume,
      operation: operation('consume-again'),
      consumeOperationId: 'consume-again',
    }),
  ).toMatchObject({ kind: 'accepted' })
  expect(await state(restarted)).toMatchObject({ state: { checkpoint: 'waiting', receipts: [{}] } })
  expect(
    await recovery(restarted, 'consume', {
      ...consume,
      operation: operation('consume-two'),
      consumeOperationId: 'consume-two',
      decisionRef: secondResult.decisionRef,
    }),
  ).toMatchObject({ kind: 'accepted' })
  expect(await state(restarted)).toMatchObject({
    state: { checkpoint: 'resume-ready', receipts: [{}, {}] },
  })
})
it('preserves decided history when control wins before the remaining answers', async () => {
  const world = await open()
  const ref = await register(world)
  await recovery(world, 'bind', {
    protocol: 'hitl/1',
    operation: operation('bind'),
    waitRef,
    expectedGeneration: '0',
    instanceId: 'process',
    implementationRef: 'implementation-v1',
  })
  const first = submit(ref, 'first-answer')
  const decided = resultValue(
    await commit(world, first.command.operation, independentRequestCommands(first, waitRef)),
  )
  if (decided.kind !== 'decided') throw new Error('Expected decision')
  const cancel = SqlCommandSchema.parse({
    method: 'invalidateWait',
    command: {
      protocol: 'hitl/1',
      operation: operation('cancel'),
      waitRef,
      terminalEvidenceRef: 'cancelled-by-owner',
      reason: 'cancelled',
    },
  })
  expect(
    resultValue(
      await commit(world, cancel.command.operation, independentRequestCommands(cancel, waitRef)),
    ),
  ).toMatchObject({ kind: 'invalidated', affected: 1 })
  const late = submit(ref, 'late', 'second')
  expect(
    resultValue(
      await commit(world, late.command.operation, independentRequestCommands(late, waitRef)),
    ),
  ).toMatchObject({ kind: 'invalidated', reason: 'cancelled' })
  expect((await request(world, ref))?.cards.map(card => card.kind)).toEqual([
    'decided',
    'invalidated',
  ])
  const consumed = await recovery(world, 'consume', {
    protocol: 'hitl/1',
    operation: operation('consume'),
    waitRef,
    receiverGeneration: '1',
    decisionRef: decided.decisionRef,
    consumeOperationId: 'consume',
  })
  expect(consumed).toMatchObject({ kind: 'superseded' })
  if (
    !consumed ||
    typeof consumed !== 'object' ||
    Array.isArray(consumed) ||
    !('receipt' in consumed)
  )
    throw new Error('Expected receipt')
  const receipt = ConsumerReceiptSchema.parse(consumed.receipt)
  const ack = SqlCommandSchema.parse({
    method: 'acknowledgeDelivery',
    command: { protocol: 'hitl/1', operation: operation('ack'), consumerReceipt: receipt },
  })
  expect(
    resultValue(
      await commit(world, ack.command.operation, independentRequestCommands(ack, waitRef)),
    ),
  ).toMatchObject({ kind: 'acknowledged', outcome: 'superseded' })
  expect((await request(world, ref))?.cards[0]).toMatchObject({
    kind: 'decided',
    delivery: { kind: 'superseded' },
  })
  expect(await state(world)).toMatchObject({ state: { checkpoint: 'terminal' } })
})
it('keeps permission and compatibility failures outside valid replies', async () => {
  const world = await open()
  const ref = await register(world)
  const forged = submit(ref, 'forged', 'first', 'outsider')
  expect(
    (await commit(world, forged.command.operation, independentRequestCommands(forged, waitRef)))
      .kind,
  ).toBe('rolled_back')
  const invalid = SqlCommandSchema.parse({
    method: 'submitReply',
    command: {
      ...submit(ref, 'bad-option').command,
      reply: { kind: 'selection', optionId: 'absent' },
    },
  })
  expect(
    resultValue(
      await commit(world, invalid.command.operation, independentRequestCommands(invalid, waitRef)),
    ),
  ).toMatchObject({ kind: 'invalid-input', reason: 'unknown-option' })
  expect(
    await recovery(world, 'bind', {
      protocol: 'hitl/1',
      operation: operation('wrong-code'),
      waitRef,
      expectedGeneration: '0',
      instanceId: 'process',
      implementationRef: 'implementation-v2',
    }),
  ).toMatchObject({ kind: 'incompatible' })
  expect((await request(world, ref))?.cards.every(card => card.kind === 'pending')).toBe(true)
})

it('recovers the original result and method after restart without replaying the command', async () => {
  const world = await open()
  const ref = await register(world)
  const input = submit(ref, 'answer-for-readback')
  const original = await commit(
    world,
    input.command.operation,
    independentRequestCommands(input, waitRef),
  )
  const expected = resultValue(original)
  const bind = IndependentCommandSchema.parse({
    kind: 'bind',
    command: {
      protocol: 'hitl/1',
      operation: operation('bind-for-readback'),
      waitRef,
      expectedGeneration: '0',
      instanceId: 'process-a',
      implementationRef: 'implementation-v1',
    },
  })
  if (bind.kind !== 'bind') throw new Error('Expected bind')
  const bound = await recovery(world, 'bind', bind.command)
  await world.close()
  const reopened = await open({ root: world.root })
  const operations = createHitlSqlOperations({
    storage: reopened.storage,
    domain: reopened.combination,
    ...reopened.combination,
  })
  expect(
    await operations.inspect({ operationRef: input.command.operation, inputDigest: digest(input) }),
  ).toEqual({
    kind: 'committed',
    method: 'submitReply',
    operationRef: input.command.operation,
    inputDigest: digest(input),
    result: expected,
    commitReceipt: `hitl-${operationKey(input.command.operation)}`,
  })
  expect(
    await operations.inspect({ operationRef: bind.command.operation, inputDigest: digest(bind) }),
  ).toMatchObject({
    kind: 'committed',
    method: 'bindReceiver',
    result: bound,
  })
  expect(
    await operations.inspect({
      operationRef: input.command.operation,
      inputDigest: 'a'.repeat(64),
    }),
  ).toMatchObject({ kind: 'conflict' })
  expect(
    await operations.inspect({
      operationRef: operation('answer-for-readback', 'outsider'),
      inputDigest: digest(input),
    }),
  ).toMatchObject({ kind: 'unknown' })
  expect(await state(reopened)).toMatchObject({
    state: { receiver: { generation: '1' }, checkpoint: 'waiting' },
  })
})

it('keeps an absent operation unknown until a durable seal excludes a late write', async () => {
  const world = await open()
  const ref = await register(world)
  const input = submit(ref, 'never-submitted')
  const binding = { operationRef: input.command.operation, inputDigest: digest(input) }
  const operations = createHitlSqlOperations({
    storage: world.storage,
    domain: world.combination,
    ...world.combination,
  })
  expect(await operations.inspect(binding)).toEqual({
    kind: 'unknown',
    operationRef: binding.operationRef,
  })
  expect(await operations.seal(binding)).toEqual({
    kind: 'not-committed',
    operationRef: binding.operationRef,
    sealReceipt: `hitl-seal-${operationKey(binding.operationRef)}`,
  })
  expect(
    (await commit(world, input.command.operation, independentRequestCommands(input, waitRef))).kind,
  ).toBe('rolled_back')
  expect((await request(world, ref))?.cards.every(card => card.kind === 'pending')).toBe(true)
})

it('reads back a seal whose response was lost and never fabricates a result from a terminal alone', async () => {
  const world = await open()
  const ref = await register(world)
  const input = submit(ref, 'lost-seal')
  const binding = { operationRef: input.command.operation, inputDigest: digest(input) }
  const operations = createHitlSqlOperations({
    domain: world.combination,
    ...world.combination,
    storage: {
      ...world.storage,
      async commit(request) {
        await world.storage.commit(request)
        throw new Error('lost response')
      },
    },
  })
  expect(await operations.seal(binding)).toMatchObject({ kind: 'not-committed' })
  const other = submit(ref, 'terminal-only')
  const otherBinding = { operationRef: other.command.operation, inputDigest: digest(other) }
  expect(
    (
      await commit(world, other.command.operation, [
        { participant: 'hitl.terminal', facts: { kind: 'consume', binding: json(otherBinding) } },
      ])
    ).kind,
  ).toBe('committed')
  expect(await operations.inspect(otherBinding)).toMatchObject({
    kind: 'unavailable',
    reason: 'operation-result',
  })
})

it('persists a known recovery refusal as the original operation outcome', async () => {
  const world = await open()
  await register(world)
  const input = IndependentCommandSchema.parse({
    kind: 'consume',
    command: {
      protocol: 'hitl/1',
      operation: operation('stale-consume'),
      waitRef,
      receiverGeneration: '9',
      consumeOperationId: 'stale-consume',
      decisionRef: {
        card: { request: { tenantRef: 'tenant-a', requestId: 'missing' }, cardId: 'first' },
        submission: operation('absent', 'human'),
        decisionId: 'decision-absent',
      },
    },
  })
  if (input.kind !== 'consume') throw new Error('Expected consume')
  const outcome = await recovery(world, 'consume', input.command)
  expect(outcome).toMatchObject({ kind: 'stale-generation' })
  const operations = createHitlSqlOperations({
    storage: world.storage,
    domain: world.combination,
    ...world.combination,
  })
  expect(
    await operations.inspect({ operationRef: input.command.operation, inputDigest: digest(input) }),
  ).toMatchObject({
    kind: 'committed',
    method: 'consumeDecision',
    result: outcome,
  })
})

it('rejects stored results that bind a different method, actor, receipt or request', async () => {
  const world = await open()
  const ref = await register(world)
  const input = submit(ref, 'schema-result')
  const committed = await commit(
    world,
    input.command.operation,
    independentRequestCommands(input, waitRef),
  )
  const operations = createHitlSqlOperations({
    storage: world.storage,
    domain: world.combination,
    ...world.combination,
  })
  const original = await operations.inspect({
    operationRef: input.command.operation,
    inputDigest: digest(input),
  })
  if (original.kind !== 'committed') throw new Error('Expected original result')
  expect(StoredOperationSchema.safeParse({ ...original, method: 'registerRequest' }).success).toBe(
    false,
  )
  expect(
    StoredOperationSchema.safeParse({
      ...original,
      result: { ...resultValue(committed), operationRef: operation('schema-result', 'outsider') },
    }).success,
  ).toBe(false)
  expect(StoredOperationSchema.safeParse({ ...original, commitReceipt: 'unrelated' }).success).toBe(
    false,
  )
  const stored = await request(world, ref)
  if (!stored) throw new Error('Expected request')
  expect(
    RequestRecordSchema.safeParse({ ...stored, ref: { ...stored.ref, requestId: 'different' } })
      .success,
  ).toBe(false)
  expect(
    RequestRecordSchema.safeParse({ ...stored, cards: [stored.cards[0], stored.cards[0]] }).success,
  ).toBe(false)
})

it('recovers a losing receiver CAS as the same conflict after a newer receiver binds', async () => {
  const world = await open()
  await register(world)
  const bind = {
    protocol: 'hitl/1',
    operation: operation('receiver-first'),
    waitRef,
    expectedGeneration: '0',
    instanceId: 'process-a',
    implementationRef: 'implementation-v1',
  }
  expect(await recovery(world, 'bind', bind)).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  const losing = IndependentCommandSchema.parse({
    kind: 'bind',
    command: { ...bind, operation: operation('receiver-loser') },
  })
  if (losing.kind !== 'bind') throw new Error('Expected bind')
  const conflict = await recovery(world, 'bind', losing.command)
  expect(conflict).toMatchObject({ kind: 'conflict', reason: 'receiver-changed' })
  expect(
    await recovery(world, 'bind', {
      ...bind,
      operation: operation('receiver-next'),
      expectedGeneration: '1',
    }),
  ).toMatchObject({ kind: 'bound', receiverGeneration: '2' })
  const operations = createHitlSqlOperations({
    storage: world.storage,
    domain: world.combination,
    ...world.combination,
  })
  expect(
    await operations.inspect({
      operationRef: losing.command.operation,
      inputDigest: digest(losing),
    }),
  ).toMatchObject({ kind: 'committed', method: 'bindReceiver', result: conflict })
  expect(await recovery(world, 'bind', losing.command)).toEqual(conflict)
  expect(await state(world)).toMatchObject({ state: { receiver: { generation: '2' } } })
})

it('rolls receipt, count and exact pending back together after the WaitOwner writer fails downstream', async () => {
  const world = await open(),
    ref = await register(world),
    reply = submit(ref, 'atomic-answer')
  const decided = resultValue(
    await commit(world, reply.command.operation, independentRequestCommands(reply, waitRef)),
  )
  if (decided.kind !== 'decided') throw new Error('Expected decision')
  await recovery(world, 'bind', {
    protocol: 'hitl/1',
    operation: operation('atomic-bind'),
    waitRef,
    expectedGeneration: '0',
    instanceId: 'process',
    implementationRef: 'implementation-v1',
  })
  const command = {
    protocol: 'hitl/1',
    operation: operation('atomic-consume-failure'),
    waitRef,
    receiverGeneration: '1',
    decisionRef: decided.decisionRef,
    consumeOperationId: 'atomic-consume-failure',
  }
  const input = IndependentCommandSchema.parse({ kind: 'consume', command })
  expect(
    (
      await commit(world, command.operation, [
        ...independentControlCommands(input),
        { participant: 'fixture.hitl.late-reject', facts: {} },
      ])
    ).kind,
  ).toBe('rolled_back')
  expect(await state(world)).toMatchObject({
    state: { receiptCount: 0, receipts: [], checkpoint: 'waiting' },
  })
  const deliveries = () =>
    world.storage.read({
      domain: world.combination,
      handler: 'hitl.independent-deliveries',
      protocol: 'independent-wait/2',
      requestKey: randomUUID(),
      input: {
        tenantRef: 'tenant-a',
        actorRef: 'owner',
        destination: waitRef.destination,
        after: '0',
        limit: 20,
      },
    })
  expect(await deliveries()).toMatchObject({
    kind: 'read',
    output: { items: [{ decision: { ref: decided.decisionRef } }] },
  })
  expect(
    await recovery(world, 'consume', {
      ...command,
      operation: operation('atomic-consume-success'),
      consumeOperationId: 'atomic-consume-success',
    }),
  ).toMatchObject({ kind: 'accepted' })
  expect(await state(world)).toMatchObject({
    state: { receiptCount: 1, receipts: [{}], checkpoint: 'waiting' },
  })
  expect(await deliveries()).toMatchObject({ kind: 'read', output: { items: [] } })
  expect((await request(world, ref))?.cards[0]).toMatchObject({
    kind: 'decided',
    delivery: { kind: 'pending' },
  })
})

it(
  'keeps directory size proportional to nonempty buckets at 64 cards and 64 readers',
  { tags: ['slow'], timeout: 30000 },
  async () => {
    const { database } = await import('./legacy-fixture.ts')
    const { inspectRelations } = await import('../verification/relations.ts')
    const world = await open(),
      readers = ['owner', ...Array.from({ length: 63 }, (_, i) => `reader-${i}`)]
    const large = RegisterRequestSchema.parse({
      ...registration,
      questions: Array.from({ length: 64 }, (_, i) => ({
        ...registration.questions[0],
        cardId: `card-${i}`,
      })),
    })
    const prep = IndependentCommandSchema.parse({
      ...preparation,
      preparation: {
        registration: large,
        readers,
        responders: ['owner'],
        compatibleImplementations: ['implementation-v1'],
      },
    })
    expect((await commit(world, operation('prepare'), independentControlCommands(prep))).kind).toBe(
      'committed',
    )
    const registered = resultValue(
      await commit(
        world,
        large.operation,
        independentRequestCommands({ method: 'registerRequest', command: large }, waitRef),
      ),
    )
    if (registered.kind !== 'registered') throw new Error('Expected registration')
    const db = database(world.root)
    function check(buckets: number) {
      expect(inspectRelations(db)).toEqual([])
      expect(db.prepare('SELECT count(*) AS n FROM hi_pool_request_buckets_v2').get()?.n).toBe(
        64 * buckets,
      )
      expect(db.prepare('SELECT count(*) AS n FROM hi_request_readers_v2').get()?.n).toBe(64)
    }
    try {
      check(1)
      for (let i = 0; i < 32; i++) {
        const input = submit(registered.requestRef, `answer-${i}`, `card-${i}`, 'owner')
        expect(
          resultValue(
            await commit(
              world,
              input.command.operation,
              independentRequestCommands(input, waitRef),
            ),
          ).kind,
        ).toBe('decided')
        check(2)
      }
      const cancel = SqlCommandSchema.parse({
        method: 'invalidateWait',
        command: {
          protocol: 'hitl/1',
          operation: operation('cancel'),
          waitRef,
          terminalEvidenceRef: 'owner-cancelled',
          reason: 'cancelled',
        },
      })
      expect(
        resultValue(
          await commit(
            world,
            cancel.command.operation,
            independentRequestCommands(cancel, waitRef),
          ),
        ),
      ).toMatchObject({ kind: 'invalidated', affected: 32 })
      check(2)
      const page = await world.storage.read({
        domain: world.combination,
        handler: 'hitl.pool-read',
        protocol: 'hitl-sql/2',
        requestKey: 'all-64',
        input: {
          tenantRef: 'tenant-a',
          actorRef: 'reader-62',
          position: { after: '0', offset: 0 },
          filter: { states: ['pending', 'decided', 'invalidated'] },
          limit: 100,
        },
      })
      expect(page.kind).toBe('read')
      if (page.kind !== 'read') throw new Error('Expected page')
      const { PoolScanResultSchema } = await import('../src/pool-schema.ts')
      const parsed = PoolScanResultSchema.parse(page.output)
      expect(parsed.kind).toBe('page')
      if (parsed.kind !== 'page') throw new Error('Expected page')
      expect(parsed.items.map(item => item.card.ref.cardId)).toEqual(
        large.questions.map(q => q.cardId),
      )
    } finally {
      db.close()
    }
  },
)

it(
  'paginates escaped large questions without exceeding the output budget or losing raw text',
  { tags: ['slow'], timeout: 30000 },
  async () => {
    const { PoolScanResultSchema } = await import('../src/pool-schema.ts')
    const world = await open(),
      original = '\u0001'.repeat(700),
      refs: string[] = []
    for (let i = 0; i < 45; i++) {
      const wait = { ...waitRef, waitId: `large-${i}` }
      const input = RegisterRequestSchema.parse({
        ...registration,
        operation: operation(`large-register-${i}`),
        preparationRef: `large-${i}`,
        origin: { ...registration.origin, wait },
        questions: [
          {
            kind: 'question',
            cardId: 'question',
            title: 'Large',
            description: 'Preserve original',
            options: Array.from({ length: 50 }, (_, n) => ({
              id: `option-${n}`,
              label: 'Choice',
              description: original,
            })),
          },
        ],
      })
      const prep = IndependentCommandSchema.parse({
        kind: 'prepare',
        operation: operation(`large-prepare-${i}`),
        preparation: {
          registration: input,
          readers: ['owner'],
          responders: ['owner'],
          compatibleImplementations: ['implementation-v1'],
        },
      })
      if (prep.kind !== 'prepare') throw new Error('Expected preparation')
      expect((await commit(world, prep.operation, independentControlCommands(prep))).kind).toBe(
        'committed',
      )
      const result = resultValue(
        await commit(
          world,
          input.operation,
          independentRequestCommands({ method: 'registerRequest', command: input }, wait),
        ),
      )
      if (result.kind !== 'registered') throw new Error('Expected registration')
      refs.push(result.requestRef.requestId)
    }
    let position: { after: string; offset: number } | null = { after: '0', offset: 0 }
    const found: string[] = []
    let pages = 0
    while (position) {
      const read = await world.storage.read({
        domain: world.combination,
        handler: 'hitl.pool-read',
        protocol: 'hitl-sql/2',
        requestKey: `large-page-${pages}`,
        input: {
          tenantRef: 'tenant-a',
          actorRef: 'owner',
          position,
          filter: { states: ['pending'] },
          limit: 100,
        },
      })
      if (read.kind !== 'read') throw new Error(JSON.stringify(read))
      expect(Buffer.byteLength(JSON.stringify(read.output))).toBeLessThanOrEqual(8 << 20)
      const page = PoolScanResultSchema.parse(read.output)
      if (page.kind !== 'page') throw new Error(JSON.stringify(page))
      if (pages === 0) expect(page.completeness).toBe('partial')
      for (const item of page.items) {
        expect(item.card.question.options.every(option => option.description === original)).toBe(
          true,
        )
        found.push(item.card.ref.request.requestId)
      }
      position = page.next
      pages++
      if (pages > 3) throw new Error('Page failed to advance')
    }
    expect(found).toEqual(refs)
    expect(pages).toBe(2)
  },
)
