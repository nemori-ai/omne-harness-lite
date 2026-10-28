import { describe, expect, it } from 'vitest'
import {
  createAgentModelReceiver as assembleReceiver,
  createModelReceiverState,
  agentEvaluator,
  type ModelReceiverDependencies,
  type ModelReceiverState,
  readModelDeliveryMaterial,
} from '@omne-harness/agent'
import { sampleAccountHandoff } from '@omne-harness/agent-contract/testing'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeResultVersion,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelDelivery,
} from '@omne-harness/model-contract'
import type { AgentAccountHandoff, AgentAccountOutcome } from '@omne-harness/agent-contract'
import { modelDeliveryMaterial, modelReceivedDraft } from '../src/receiving-material.ts'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import {
  acceptedInput,
  checkpoint,
  consumption,
  execution,
  instance,
  operation,
  ok,
  evidence,
  tenantB,
} from './journal-support.ts'
import { alice, loopAssembly } from './loop-support.ts'
import { options } from './factory-support.ts'

function createAgentModelReceiver<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
) {
  return ok(assembleReceiver(dependencies, state))
}

async function setup() {
  const assembly = await loopAssembly([execution()])
  assembly.controls.access.check.always(input =>
    input.operation === 'receive-result'
      ? { kind: 'denied' }
      : { kind: 'allowed', evidence: evidence('access') },
  )
  const coordinator = createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-receiver'),
    initial: acceptedInput('input-receiver'),
    grant: null,
    idle() {},
  })
  const authority = ok(await coordinator.accept())
  assembly.release.open()
  ok(await coordinator.runExecution())
  const snapshot = ok(
    await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
  )
  const pending = snapshot.checkpoint.calls[0]
  if (!pending || pending.kind !== 'model') throw new Error('model pending expected')
  const pusher = assembly.controls.pusher
  if (!pusher) throw new Error('public pusher required')
  const { resolveModelInvocationRef } = await import('@omne-harness/model-contract')
  const reference = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  const pushed = await pusher.settled({ tenant: alice.tenant, call: reference.call })
  if (pushed.delivery === null) throw new Error('frozen envelope required')
  assembly.controls.access.check.always(() => ({ kind: 'allowed', evidence: evidence('access') }))
  const sent: AgentAccountHandoff[] = []
  let outlet: AgentAccountOutcome = { kind: 'received' }
  const dependencies: ModelReceiverDependencies<string> = {
    provider: assembly.controls.journal.provider,
    access: assembly.controls.access.port,
    targets: assembly.controls.journal.targets,
    models: assembly.dependencies.models.calls,
    capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 2 }),
    outlet: {
      async deliver(input) {
        sent.push(input.handoff)
        return outlet
      },
    },
  }
  const state = createModelReceiverState<string>()
  const receiver = createAgentModelReceiver(dependencies, state)
  const delivery = pushed.delivery
  const push = () =>
    receiver.push({ access: alice, delivery, signal: new AbortController().signal })
  return {
    assembly,
    coordinator,
    authority,
    pending,
    delivery: pushed.delivery,
    dependencies,
    state,
    receiver,
    push,
    sent,
    outlet(value: AgentAccountOutcome) {
      outlet = value
    },
  }
}

describe('host Model receiver', () => {
  it('jointly saves complete material and recalls it after detach and reassembly', async () => {
    const s = await setup()
    const saved = ok(await s.push())
    const snapshot = ok(
      await s.assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(snapshot.entries).toHaveLength(1)
    const entry = snapshot.entries?.[0]
    if (!entry || entry.kind !== 'received') throw new Error('received entry expected')
    expect(
      ok(await s.dependencies.provider.materials.read({ ...alice, source: entry.material })).kind,
    ).toBe('facts')
    ok(
      await s.dependencies.provider.journal.detach({
        ...alice,
        execution: execution(),
        operation: operation('detach-receiver'),
        authority: s.authority,
        reason: evidence('handoff'),
      }),
    )
    const receiver = createAgentModelReceiver(s.dependencies, s.state)
    expect(
      ok(
        await receiver.push({
          access: alice,
          delivery: s.delivery,
          signal: new AbortController().signal,
        }),
      ),
    ).toEqual(saved)
  })
  it.each(['applied', 'pending', 'dropped'] as const)(
    'retains original operation after %s unknown and never sends premature saved',
    async outcome => {
      const s = await setup()
      s.assembly.controls.journal.failNext('received', { kind: 'commit-unknown', outcome })
      expect(await s.push()).toEqual({ failure: { kind: 'outcome-unknown' } })
      const before = ok(
        await s.dependencies.provider.journal.load({ ...alice, execution: execution() }),
      )
      expect(before.entries).toHaveLength(outcome === 'applied' ? 1 : 0)
      if (outcome === 'pending') {
        const operation = before.unresolved[0]
        if (!operation) throw new Error('original operation required')
        expect(
          s.assembly.controls.journal.settle(execution(), operation, 'applied', alice.tenant),
        ).toBe(true)
      }
      const replay = await s.push()
      if (outcome === 'dropped')
        expect(replay).toEqual({ failure: { kind: 'unavailable', dependency: 'responsibility' } })
      else expect(replay).toHaveProperty('ok')
      const after = ok(
        await s.dependencies.provider.journal.load({ ...alice, execution: execution() }),
      )
      expect(after.entries).toHaveLength(outcome === 'dropped' ? 0 : 1)
    },
  )
  it('rechecks authorization and full dispatch authority before returning cached saved', async () => {
    const s = await setup()
    ok(await s.push())
    s.assembly.controls.access.check.always(() => ({ kind: 'denied' }))
    expect(await s.push()).toEqual({ failure: { kind: 'denied' } })
    s.assembly.controls.access.check.always(() => ({
      kind: 'allowed',
      evidence: evidence('access'),
    }))
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        models: {
          ...s.dependencies.models,
          async dispatches() {
            return {
              failure: { kind: 'unavailable', dependency: 'dispatches', diagnostic: 'offline' },
            }
          },
        },
      },
      s.state,
    )
    expect(
      await receiver.push({
        access: alice,
        delivery: s.delivery,
        signal: new AbortController().signal,
      }),
    ).toEqual({ failure: { kind: 'unavailable', dependency: 'dispatches' } })
  })
  it('validates the original consumer and dispatch set before conflict recognition', async () => {
    const s = await setup()
    const input = { access: alice, signal: new AbortController().signal }
    expect(
      await s.receiver.push({
        ...input,
        delivery: { ...s.delivery, consumer: { ...s.delivery.consumer, purpose: 'forged' } },
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'consumer', reason: 'not-original' } })
    if (s.delivery.kind !== 'result') throw new Error('result expected')
    expect(await s.receiver.push({ ...input, delivery: { ...s.delivery, accounts: [] } })).toEqual({
      failure: { kind: 'invalid', field: 'accounts', reason: 'dispatch-set-mismatch' },
    })
  })
  it('takes a frozen input before asynchronous authorization', async () => {
    const s = await setup(),
      wait = Promise.withResolvers<void>()
    s.assembly.controls.access.check.always(async () => {
      await wait.promise
      return { kind: 'allowed', evidence: evidence('access') }
    })
    const delivery = structuredClone(s.delivery)
    const pushed = s.receiver.push({
      access: alice,
      delivery,
      signal: new AbortController().signal,
    })
    Object.assign(delivery.consumer, { purpose: 'mutated' })
    wait.resolve()
    expect(await pushed).toHaveProperty('ok')
    expect(await s.push()).toHaveProperty('ok')
  })
})

function withAccount(delivery: ModelDelivery, revision = '1'): ModelDelivery {
  if (delivery.kind !== 'result' || !delivery.accounts[0])
    throw new Error('one actual dispatch required')
  const call = ok(resolveModelInvocationRef(delivery.key.reference, alice.tenant)).call
  const account = {
    ...sampleAccountHandoff(alice.tenant, 'receiver', revision).account,
    subject: { kind: 'model_call' as const, id: call },
  }
  return { ...delivery, accounts: [{ dispatch: delivery.accounts[0].dispatch, account }] }
}

describe('received account outbox and capacity', () => {
  it('keeps unknown accounting pending with the identical tuple and recovers from saved entries', async () => {
    const s = await setup(),
      delivery = withAccount(s.delivery)
    s.outlet({ kind: 'unknown' })
    const input = { access: alice, delivery, signal: new AbortController().signal }
    expect(await s.receiver.push(input)).toHaveProperty('ok')
    expect(s.sent).toHaveLength(1)
    expect(s.receiver.inspect().pending).toBe(1)
    s.outlet({ kind: 'received' })
    const assembled = createAgentModelReceiver(s.dependencies, s.state)
    await assembled.retry({ access: alice, execution: execution(), signal: input.signal })
    expect(s.sent).toHaveLength(2)
    expect(s.sent[1]).toEqual(s.sent[0])
    expect(assembled.inspect().pending).toBe(0)
    await assembled.recover({ access: alice, execution: execution(), signal: input.signal })
    expect(s.sent).toHaveLength(2)
  })
  it.each([
    { kind: 'conflict' },
    { kind: 'denied' },
    { kind: 'invalid', field: 'account', reason: 'rejected' },
  ] as const)('preserves hard $kind accounting failure across reassembly', async outcome => {
    const s = await setup(),
      delivery = withAccount(s.delivery)
    s.outlet(outcome)
    const input = { access: alice, delivery, signal: new AbortController().signal }
    expect(await s.receiver.push(input)).toHaveProperty('ok')
    expect(s.receiver.inspect().blocked).toBe(1)
    s.outlet({ kind: 'received' })
    const assembled = createAgentModelReceiver(s.dependencies, s.state)
    await assembled.recover({ access: alice, execution: execution(), signal: input.signal })
    expect(s.sent).toHaveLength(1)
    expect(assembled.inspect().blocked).toBe(1)
  })
  it('sends no account for null and sends a later account independently', async () => {
    const s = await setup()
    expect(await s.push()).toHaveProperty('ok')
    expect(s.sent).toEqual([])
    ok(await s.coordinator.runExecution())
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).state
        .kind,
    ).toBe('ended')
    const result = withAccount(s.delivery)
    if (result.kind !== 'result' || !result.accounts[0]?.account)
      throw new Error('account required')
    const item = result.accounts[0]
    if (item.account === null) throw new Error('account required')
    const account: ModelDelivery = {
      kind: 'account',
      key: {
        kind: 'account',
        reference: result.key.reference,
        dispatch: item.dispatch,
        revision: item.account.revision,
      },
      consumer: result.consumer,
      account: item.account,
    }
    expect(
      await s.receiver.push({
        access: alice,
        delivery: account,
        signal: new AbortController().signal,
      }),
    ).toHaveProperty('ok')
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]).toMatchObject({
      dispatch: item.dispatch,
      resultVersion: null,
      account: item.account,
    })
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
    ).toHaveLength(2)
  })
  it('rejects a partial dispatch set and sends every non-null dispatch after joint publication', async () => {
    const s = await setup(),
      delivery = withAccount(s.delivery)
    if (delivery.kind !== 'result' || !delivery.accounts[0]) throw new Error('result required')
    const call = ok(resolveModelInvocationRef(delivery.key.reference, alice.tenant)).call
    const original = ok(await s.dependencies.models.dispatches({ ...alice, call }))[0]
    if (!original) throw new Error('actual first dispatch required')
    const dispatch = ok(decodeDispatchId('mdisp_second'))
    s.assembly.controls.models.recordDispatch({
      tenant: alice.tenant,
      call,
      record: { ...original, dispatch, account: null },
    })
    const input = { access: alice, signal: new AbortController().signal }
    expect(await s.receiver.push({ ...input, delivery })).toMatchObject({
      failure: { kind: 'invalid', field: 'accounts' },
    })
    const complete = {
      ...delivery,
      accounts: [...delivery.accounts, { dispatch, account: delivery.accounts[0].account }],
    }
    expect(await s.receiver.push({ ...input, delivery: complete })).toHaveProperty('ok')
    expect(s.sent.map(item => item.dispatch)).toEqual([original.dispatch, dispatch])
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
    ).toHaveLength(1)
  })
  it.each(['records', 'bytes'] as const)(
    'refuses new custody when its retained %s capacity is exhausted',
    async resource => {
      const s = await setup()
      const receiver = createAgentModelReceiver(
        {
          ...s.dependencies,
          capacity: () => ({
            records: 10,
            bytes: 1000000,
            attachments: 10,
            inFlight: 2,
            [resource]: 0,
          }),
        },
        s.state,
      )
      expect(
        await receiver.push({
          access: alice,
          delivery: s.delivery,
          signal: new AbortController().signal,
        }),
      ).toEqual({ failure: { kind: 'backpressured', resource } })
      expect(
        ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() }))
          .entries,
      ).toEqual([])
    },
  )
  it('counts retained attachment references before accepting custody', async () => {
    const s = await setup()
    if (s.delivery.kind !== 'result' || s.delivery.parts[0]?.kind !== 'sealed')
      throw new Error('sealed result required')
    const delivery: ModelDelivery = {
      ...s.delivery,
      parts: [
        {
          kind: 'sealed',
          trims: [],
          block: {
            kind: 'image',
            id: s.delivery.parts[0].block.id,
            visibility: { toHuman: true, toModel: true },
            transcript: null,
            ref: {
              storage: 'assets',
              key: 'one',
              mediaType: 'image/png',
              bytes: '100',
              digest: 'sha256:one',
            },
          },
        },
      ],
    }
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        capacity: () => ({ records: 10, bytes: 1000000, attachments: 0, inFlight: 2 }),
      },
      s.state,
    )
    expect(
      await receiver.push({ access: alice, delivery, signal: new AbortController().signal }),
    ).toEqual({ failure: { kind: 'backpressured', resource: 'attachments' } })
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
    ).toEqual([])
  })
  it('cancels before acceptance without a write and retains actual in-flight capacity after an aborted wait', async () => {
    const s = await setup(),
      stop = new AbortController()
    stop.abort()
    expect(
      await s.receiver.push({ access: alice, delivery: s.delivery, signal: stop.signal }),
    ).toEqual({ failure: { kind: 'cancelled-before-accept' } })
    const began = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>()
    const received = s.dependencies.provider.received
    if (!received) throw new Error('joint capability required')
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 1 }),
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              began.resolve()
              await released.promise
              return received.commit(input)
            },
          },
        },
      },
      s.state,
    )
    const controller = new AbortController()
    const pending = receiver.push({
      access: alice,
      delivery: s.delivery,
      signal: controller.signal,
    })
    await began.promise
    controller.abort()
    expect(await pending).toEqual({ failure: { kind: 'outcome-unknown' } })
    expect(
      await receiver.push({
        access: alice,
        delivery: s.delivery,
        signal: new AbortController().signal,
      }),
    ).toEqual({ failure: { kind: 'backpressured', resource: 'in-flight' } })
    released.resolve()
    for (let i = 0; i < 50 && s.state.writing.size; i++)
      await new Promise(resolve => setTimeout(resolve, 0))
    expect(
      await receiver.push({
        access: alice,
        delivery: s.delivery,
        signal: new AbortController().signal,
      }),
    ).toHaveProperty('ok')
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
    ).toHaveLength(1)
  })
})

describe('receiver failure boundaries', () => {
  it('refuses a provider without the joint capability', async () => {
    const s = await setup()
    expect(
      assembleReceiver(
        { ...s.dependencies, provider: { ...s.dependencies.provider, received: null } },
        s.state,
      ),
    ).toEqual({ failure: { kind: 'unsupported' } })
  })
  it.each(['unsupported', 'invalid', 'stale-advance', 'terminal', 'unavailable'] as const)(
    'does not expose internal %s as a producer input failure',
    async kind => {
      const s = await setup(),
        received = s.dependencies.provider.received
      if (!received) throw new Error('joint required')
      const internal =
        kind === 'invalid'
          ? ({ kind, field: 'secret-internal-path', reason: 'bad' } as const)
          : kind === 'unavailable'
            ? ({ kind, owner: 'database', diagnostic: 'offline' } as const)
            : { kind }
      const receiver = createAgentModelReceiver(
        {
          ...s.dependencies,
          provider: {
            ...s.dependencies.provider,
            received: {
              ...received,
              async commit() {
                return { failure: internal }
              },
            },
          },
        },
        s.state,
      )
      expect(
        await receiver.push({
          access: alice,
          delivery: s.delivery,
          signal: new AbortController().signal,
        }),
      ).toEqual({ failure: { kind: 'unavailable', dependency: 'responsibility' } })
      expect(s.sent).toEqual([])
      expect(receiver.inspect().diagnostics).toHaveLength(1)
    },
  )
  it('recognizes saved under an already cancelled signal and verifies the original readable material', async () => {
    const s = await setup(),
      saved = ok(await s.push()),
      controller = new AbortController()
    controller.abort()
    expect(
      ok(await s.receiver.push({ access: alice, delivery: s.delivery, signal: controller.signal })),
    ).toEqual(saved)
    const snapshot = ok(
      await s.dependencies.provider.journal.load({ ...alice, execution: execution() }),
    )
    const entry = snapshot.entries?.[0]
    if (!entry || entry.kind !== 'received') throw new Error('received required')
    s.assembly.controls.journal.receiving.loseMaterial(entry.material)
    expect(
      await s.receiver.push({ access: alice, delivery: s.delivery, signal: controller.signal }),
    ).toEqual({ failure: { kind: 'outcome-unknown' } })
  })
})

it('refuses a non-original admission, result relation, tenant, and authoritative not-accepted before saving', async () => {
  const s = await setup(),
    reference = ok(resolveModelInvocationRef(s.delivery.key.reference, alice.tenant))
  const input = { access: alice, signal: new AbortController().signal }
  if (s.delivery.kind !== 'result') throw new Error('result required')
  const otherReference = ok(
    encodeModelInvocationRef({
      ...reference,
      tenant: alice.tenant,
      admission: ok(decodeModelOperationId('mop_other')),
    }),
  )
  expect(
    await s.receiver.push({
      ...input,
      delivery: { ...s.delivery, key: { ...s.delivery.key, reference: otherReference } },
    }),
  ).toEqual({ failure: { kind: 'invalid', field: 'key.reference', reason: 'not-original' } })
  if (s.delivery.kind !== 'result') throw new Error('result required')
  expect(
    await s.receiver.push({
      ...input,
      delivery: {
        ...s.delivery,
        key: { ...s.delivery.key, result: ok(decodeResultVersion('mrver_other')) },
      },
    }),
  ).toEqual({ failure: { kind: 'invalid', field: 'key.result', reason: 'version-mismatch' } })
  expect(
    await s.receiver.push({
      ...input,
      access: { ...alice, tenant: tenantB },
      delivery: s.delivery,
    }),
  ).toEqual({ failure: { kind: 'denied' } })
  const notAccepted = createAgentModelReceiver(
    {
      ...s.dependencies,
      models: {
        ...s.dependencies.models,
        async inspect() {
          return { ok: { kind: 'not-accepted', operation: reference.admission } }
        },
      },
    },
    s.state,
  )
  expect(await notAccepted.push({ ...input, delivery: s.delivery })).toEqual({
    failure: { kind: 'invalid', field: 'key.reference', reason: 'not-accepted' },
  })
  expect(
    ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
  ).toEqual([])
  expect(s.sent).toEqual([])
})

it.each(['same', 'different'] as const)(
  'retains the original target when another execution claims the call with %s admission',
  async admission => {
    const s = await setup()
    const original = ok(resolveModelInvocationRef(s.pending.reference, alice.tenant))
    const laterReference = ok(
      encodeModelInvocationRef({
        ...original,
        tenant: alice.tenant,
        admission:
          admission === 'same' ? original.admission : ok(decodeModelOperationId('mop_later')),
      }),
    )
    const later = {
      ...s.pending,
      reference: laterReference,
      consumption: consumption('later-consumption'),
      position: { ...s.pending.position, work: 'later-execution', purpose: 'forged' },
    }
    const foreign = { ...alice, tenant: tenantB }
    const foreignReference = ok(encodeModelInvocationRef({ ...original, tenant: tenantB }))
    for (const [who, id, pending] of [
      [alice, execution('later-execution'), later],
      [foreign, execution(), { ...later, reference: foreignReference }],
    ] as const)
      ok(
        await s.dependencies.provider.journal.open({
          ...who,
          execution: id,
          operation: operation(`open-${id}`),
          instance: instance(),
          grant: null,
          initial: acceptedInput(`input-${id}`),
          checkpoint: { ...checkpoint('M6'), calls: [pending] },
        }),
      )
    const target = ok(
      await s.dependencies.targets.resolve({
        access: alice,
        reference: laterReference,
        consumer: later.position,
      }),
    )
    expect(target.execution).toBe(execution())
    expect(target.pending).toEqual(s.pending)
    const foreignTarget = ok(
      await s.dependencies.targets.resolve({
        access: foreign,
        reference: foreignReference,
        consumer: later.position,
      }),
    )
    expect(foreignTarget.pending.reference).toBe(foreignReference)
    expect(foreignTarget.pending.consumption).toBe(later.consumption)
    expect(
      await s.dependencies.targets.resolve({
        access: foreign,
        reference: s.pending.reference,
        consumer: s.pending.position,
      }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(
      await s.receiver.push({
        access: alice,
        delivery: { ...s.delivery, consumer: later.position },
        signal: new AbortController().signal,
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'consumer', reason: 'not-original' } })
    ok(await s.push())
    expect(
      ok(await s.dependencies.provider.journal.load({ ...alice, execution: execution() })).entries,
    ).toHaveLength(1)
    for (const [who, id] of [
      [alice, execution('later-execution')],
      [foreign, execution()],
    ] as const)
      expect(
        ok(await s.dependencies.provider.journal.load({ ...who, execution: id })).entries,
      ).toEqual([])
  },
)

it('does not return a saved receipt whose owner is unrelated to the frozen consumer', async () => {
  const s = await setup(),
    received = s.dependencies.provider.received
  if (!received) throw new Error('joint required')
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      provider: {
        ...s.dependencies.provider,
        received: {
          ...received,
          async commit(input) {
            const result = await received.commit(input)
            if ('failure' in result || result.ok.kind !== 'committed') return result
            return {
              ok: {
                kind: 'committed',
                value: {
                  ...result.ok.value,
                  saved: { ...result.ok.value.saved, owner: 'foreign-owner' },
                },
              },
            }
          },
        },
      },
    },
    s.state,
  )
  expect(
    await receiver.push({
      access: alice,
      delivery: s.delivery,
      signal: new AbortController().signal,
    }),
  ).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(s.sent).toEqual([])
  expect(receiver.inspect().diagnostics).toHaveLength(1)
})

it('retains the access identity of the push while asynchronous checks run', async () => {
  const s = await setup(),
    reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      access: {
        async check(input) {
          reached.resolve()
          await release.promise
          return input.access.principal === 'alice'
            ? { kind: 'allowed', evidence: evidence('access') }
            : { kind: 'denied' }
        },
      },
    },
    s.state,
  )
  const access = { ...alice, principal: 'alice' }
  const result = receiver.push({
    access,
    delivery: s.delivery,
    signal: new AbortController().signal,
  })
  await reached.promise
  access.principal = 'bob'
  release.resolve()
  expect(await result).toHaveProperty('ok')
})

describe('maintenance isolation and independent saved', () => {
  it.each(['retry', 'recover'] as const)(
    'denies %s for a foreign tenant, revoked principal, or absent execution',
    async method => {
      const s = await setup()
      s.outlet({ kind: 'invalid', field: 'account', reason: 'private-account' })
      ok(
        await s.receiver.push({
          access: alice,
          delivery: withAccount(s.delivery),
          signal: new AbortController().signal,
        }),
      )
      const before = s.receiver.inspect()
      s.assembly.controls.access.check.always(input =>
        input.access.principal === 'revoked'
          ? { kind: 'denied' }
          : { kind: 'allowed', evidence: evidence('access') },
      )
      for (const input of [
        { access: { ...alice, tenant: tenantB }, execution: execution() },
        { access: { ...alice, principal: 'revoked' }, execution: execution() },
        { access: alice, execution: execution('absent') },
      ]) {
        expect(
          await s.receiver[method]({ ...input, signal: new AbortController().signal }),
        ).toMatchObject({ failure: { kind: 'denied' } })
        expect(s.receiver.inspect()).toEqual(before)
      }
    },
  )
  it('returns first and repeated saved while the actual outlet remains pending', async () => {
    const s = await setup(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    let sends = 0
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 1 }),
        outlet: {
          async deliver() {
            sends++
            entered.resolve()
            await release.promise
            return { kind: 'received' }
          },
        },
      },
      s.state,
    )
    const input = {
      access: alice,
      delivery: withAccount(s.delivery),
      signal: new AbortController().signal,
    }
    const pushed = receiver.push(input)
    await entered.promise
    try {
      expect(
        await Promise.race([
          pushed,
          new Promise(resolve => setTimeout(() => resolve('still-waiting'), 50)),
        ]),
      ).toHaveProperty('ok')
      expect(await receiver.push(input)).toHaveProperty('ok')
      expect([...s.state.active.values()]).toEqual([0])
      expect(s.state.outletActive.size).toBe(1)
      expect(sends).toBe(1)
      const late = withAccount(s.delivery, '2')
      if (late.kind !== 'result' || !late.accounts[0]?.account) throw new Error('account required')
      const item = late.accounts[0]
      if (!item.account) throw new Error('account required')
      const later: ModelDelivery = {
        kind: 'account',
        consumer: late.consumer,
        key: {
          kind: 'account',
          reference: late.key.reference,
          dispatch: item.dispatch,
          revision: item.account.revision,
        },
        account: item.account,
      }
      expect(await receiver.push({ ...input, delivery: later })).toHaveProperty('ok')
      expect([...s.state.active.values()]).toEqual([0])
    } finally {
      release.resolve()
      await pushed
      await drainTasks(s.state)
    }
  })
  it.each(['targets', 'access', 'inspect', 'dispatches'] as const)(
    'names the actual throwing %s dependency',
    async dependency => {
      const s = await setup()
      const throws = async (): Promise<never> => {
        throw new Error(`private-${dependency}`)
      }
      const receiver = createAgentModelReceiver(
        {
          ...s.dependencies,
          targets:
            dependency === 'targets'
              ? { ...s.dependencies.targets, resolve: throws }
              : s.dependencies.targets,
          access: dependency === 'access' ? { check: throws } : s.dependencies.access,
          models: {
            ...s.dependencies.models,
            ...(dependency === 'inspect'
              ? { inspect: throws }
              : dependency === 'dispatches'
                ? { dispatches: throws }
                : {}),
          },
        },
        s.state,
      )
      expect(
        await receiver.push({
          access: alice,
          delivery: s.delivery,
          signal: new AbortController().signal,
        }),
      ).toEqual({ failure: { kind: 'unavailable', dependency } })
      expect(receiver.inspect().diagnostics).toHaveLength(1)
      expect(s.sent).toEqual([])
    },
  )
})

const signal = () => new AbortController().signal
async function drainTasks(state: ModelReceiverState<string>) {
  while (state.tasks.size) await Promise.all(state.tasks)
}

it('rejects an arbitrary OverLimitMetric in persisted received facts', async () => {
  const s = await setup()
  if (s.delivery.kind !== 'result') throw new Error('result required')
  const delivery: ModelDelivery = {
    ...s.delivery,
    settlement: {
      ...s.delivery.settlement,
      termination: {
        kind: 'failed',
        fault: {
          cause: 'input-over-limit',
          diagnostic: 'too large',
          upstreamStatus: null,
          reported: { metric: 'input-tokens', limit: '4', actual: '5' },
        },
      },
    },
  }
  const material = modelDeliveryMaterial(alice, delivery)
  const expected = modelReceivedDraft(delivery, s.pending.consumption)
  expect(readModelDeliveryMaterial(alice, material, expected)).not.toBeNull()
  const malformed = JSON.parse(JSON.stringify(material).replace('input-tokens', 'banana'))
  expect(readModelDeliveryMaterial(alice, malformed, expected)).toBeNull()
})

it.each(['retry', 'recover'] as const)(
  'keeps %s reports within two tenants with the same execution and another execution in one tenant',
  async method => {
    const s = await setup()
    s.outlet({ kind: 'invalid', field: 'account', reason: 'private-original' })
    ok(
      await s.receiver.push({ access: alice, delivery: withAccount(s.delivery), signal: signal() }),
    )
    await drainTasks(s.state)
    const original = ok(resolveModelInvocationRef(s.pending.reference, alice.tenant))
    for (const [access, id, suffix] of [
      [{ ...alice, tenant: tenantB }, execution(), 'tenant-b'],
      [alice, execution('other-execution'), 'other-execution'],
    ] as const) {
      const pending = {
        ...s.pending,
        reference: ok(
          encodeModelInvocationRef({
            tenant: access.tenant,
            admission: original.admission,
            call: ok(decodeModelCallId(`mcall_${suffix}`)),
          }),
        ),
        position: { ...s.pending.position, work: suffix },
      }
      ok(
        await s.dependencies.provider.journal.open({
          ...access,
          execution: id,
          operation: operation(`open-${suffix}`),
          instance: instance(suffix),
          grant: null,
          initial: acceptedInput(suffix),
          checkpoint: { ...checkpoint(), calls: [pending] },
        }),
      )
      expect(ok(await s.receiver[method]({ access, execution: id, signal: signal() }))).toEqual({
        pending: 0,
        blocked: 0,
        diagnostics: [],
      })
    }
    expect(
      ok(await s.receiver[method]({ access: alice, execution: execution(), signal: signal() })),
    ).toMatchObject({ blocked: 1 })
  },
)

it.each(['targets', 'access', 'journal'] as const)(
  'does not turn a maintenance %s failure into an empty success',
  async dependency => {
    const s = await setup()
    const throws = async (): Promise<never> => {
      throw new Error('offline')
    }
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        targets:
          dependency === 'targets'
            ? { ...s.dependencies.targets, forExecution: throws }
            : s.dependencies.targets,
        access: dependency === 'access' ? { check: throws } : s.dependencies.access,
        provider:
          dependency === 'journal'
            ? {
                ...s.dependencies.provider,
                journal: { ...s.dependencies.provider.journal, load: throws },
              }
            : s.dependencies.provider,
      },
      s.state,
    )
    expect(
      await receiver.recover({ access: alice, execution: execution(), signal: signal() }),
    ).toEqual({
      failure: { kind: 'unavailable', owner: 'agent-model-receiver', diagnostic: dependency },
    })
  },
)

it('preserves explicit denied from Journal maintenance load without changing retained state', async () => {
  const s = await setup()
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      provider: {
        ...s.dependencies.provider,
        journal: {
          ...s.dependencies.provider.journal,
          async load() {
            return { failure: { kind: 'denied', action: 'load' } }
          },
        },
      },
    },
    s.state,
  )
  expect(
    await receiver.recover({ access: alice, execution: execution(), signal: signal() }),
  ).toHaveProperty('failure.kind', 'denied')
  expect(receiver.inspect()).toEqual({ pending: 0, blocked: 0, diagnostics: [] })
})

it.each(['targets', 'access', 'final-access'] as const)(
  'cancels an unresolved %s check without leaking a report or starting further reads',
  async phase => {
    const s = await setup(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    let checks = 0,
      reads = 0
    const wait = async () => {
      entered.resolve()
      await release.promise
    }
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        targets: {
          ...s.dependencies.targets,
          async forExecution(input) {
            if (phase === 'targets') await wait()
            return s.dependencies.targets.forExecution(input)
          },
        },
        access: {
          async check(input) {
            checks++
            if ((phase === 'access' && checks === 1) || (phase === 'final-access' && checks === 2))
              await wait()
            return s.dependencies.access.check(input)
          },
        },
        provider: {
          ...s.dependencies.provider,
          materials: {
            ...s.dependencies.provider.materials,
            async read(input) {
              reads++
              return s.dependencies.provider.materials.read(input)
            },
          },
        },
      },
      s.state,
    )
    const stop = new AbortController()
    const pending = receiver.retry({ access: alice, execution: execution(), signal: stop.signal })
    await entered.promise
    stop.abort()
    expect(await pending).toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'agent-model-receiver',
        diagnostic: 'maintenance-cancelled',
      },
    })
    expect(reads).toBe(0)
    expect(s.state.tasks.size).toBeGreaterThan(0)
    release.resolve()
    await drainTasks(s.state)
    expect(reads).toBe(0)
    expect(s.state.tasks.size).toBe(0)
  },
)

it('rechecks qualification after an awaited load and denies the final report after revocation', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  let revoked = false
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      access: {
        async check() {
          return revoked ? { kind: 'denied' } : { kind: 'allowed', evidence: evidence('access') }
        },
      },
      provider: {
        ...s.dependencies.provider,
        journal: {
          ...s.dependencies.provider.journal,
          async load(input) {
            entered.resolve()
            await release.promise
            return s.dependencies.provider.journal.load(input)
          },
        },
      },
    },
    s.state,
  )
  const pending = receiver.recover({ access: alice, execution: execution(), signal: signal() })
  await entered.promise
  revoked = true
  release.resolve()
  expect(await pending).toHaveProperty('failure.kind', 'denied')
  expect(s.sent).toEqual([])
})

it('keeps the actual outlet task through cancellation and reassembly and fences the old driver', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const oldSent: AgentAccountHandoff[] = [],
    newSent: AgentAccountHandoff[] = []
  const old = createAgentModelReceiver(
    {
      ...s.dependencies,
      outlet: {
        async deliver(input) {
          oldSent.push(input.handoff)
          entered.resolve()
          await release.promise
          return { kind: 'received' }
        },
      },
    },
    s.state,
  )
  const delivery = withAccount(s.delivery)
  ok(await old.push({ access: alice, delivery, signal: signal() }))
  await entered.promise
  const next = createAgentModelReceiver(
    {
      ...s.dependencies,
      outlet: {
        async deliver(input) {
          newSent.push(input.handoff)
          return { kind: 'received' }
        },
      },
    },
    s.state,
  )
  const stop = new AbortController()
  const waiting = next.retry({ access: alice, execution: execution(), signal: stop.signal })
  stop.abort()
  expect(await waiting).toHaveProperty('failure.diagnostic', 'maintenance-cancelled')
  expect(s.state.outletActive.size).toBe(1)
  expect(s.state.outletTasks.size).toBe(1)
  expect(newSent).toEqual([])
  const late = withAccount(s.delivery, '2')
  if (late.kind !== 'result' || !late.accounts[0]?.account) throw new Error('account required')
  const item = late.accounts[0]
  if (!item.account) throw new Error('account required')
  const later: ModelDelivery = {
    kind: 'account',
    consumer: late.consumer,
    key: {
      kind: 'account',
      reference: late.key.reference,
      dispatch: item.dispatch,
      revision: item.account.revision,
    },
    account: item.account,
  }
  // Already accepted old pushes still commit, but may not send with their retired driver.
  ok(await old.push({ access: alice, delivery: later, signal: signal() }))
  release.resolve()
  await drainTasks(s.state)
  expect(oldSent).toHaveLength(1)
  expect(newSent).toHaveLength(0)
  expect(s.state.outletActive.size).toBe(0)
  expect(
    ok(await next.retry({ access: alice, execution: execution(), signal: signal() })).pending,
  ).toBe(0)
  expect(newSent).toHaveLength(1)
  expect(newSent[0]?.account.revision).toBe('2')
})

it('freezes the original binding workset before authorization and excludes a concurrently added instance', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const originalRef = ok(resolveModelInvocationRef(s.pending.reference, alice.tenant))
  const laterRef = ok(
    encodeModelInvocationRef({
      ...originalRef,
      tenant: alice.tenant,
      call: ok(decodeModelCallId('mcall_concurrent')),
    }),
  )
  const laterPending = {
    ...s.pending,
    reference: laterRef,
    consumption: consumption('later'),
    position: { ...s.pending.position, work: 'later-binding' },
  }
  const inspected = ok(
    await s.dependencies.models.inspect({ ...alice, reference: s.pending.reference }),
  )
  if (inspected.kind !== 'found') throw new Error('original call required')
  const foreignReads: string[] = [],
    sends: string[] = []
  let first = true
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      access: {
        async check(input) {
          if (input.access.principal !== 'limited')
            return { kind: 'allowed', evidence: evidence('access') }
          if (input.target.kind !== 'execution' || input.target.instance !== instance())
            return { kind: 'denied' }
          if (first) {
            first = false
            entered.resolve()
            await release.promise
          }
          return { kind: 'allowed', evidence: evidence('access') }
        },
      },
      models: {
        async inspect(input) {
          return input.reference === laterRef
            ? {
                ok: {
                  kind: 'found',
                  state: {
                    ...inspected.state,
                    call: ok(decodeModelCallId('mcall_concurrent')),
                    consumer: laterPending.position,
                  },
                },
              }
            : s.dependencies.models.inspect(input)
        },
        dispatches: () => s.dependencies.models.dispatches({ ...alice, call: originalRef.call }),
      },
      outlet: {
        async deliver(input) {
          sends.push(input.access.principal)
          return {
            kind: 'invalid',
            field: 'account',
            reason: input.handoff.call === laterRef ? 'private-later-binding' : 'original-binding',
          }
        },
      },
      provider: {
        ...s.dependencies.provider,
        materials: {
          ...s.dependencies.provider.materials,
          async read(input) {
            const result = await s.dependencies.provider.materials.read(input)
            if (input.principal === 'limited' && JSON.stringify(result).includes('later-binding'))
              foreignReads.push('later')
            return result
          },
        },
      },
    },
    s.state,
  )
  ok(await receiver.push({ access: alice, delivery: withAccount(s.delivery), signal: signal() }))
  await drainTasks(s.state)
  const maintaining = receiver.recover({
    access: { ...alice, principal: 'limited' },
    execution: execution(),
    signal: signal(),
  })
  await entered.promise
  const attached = ok(
    await s.dependencies.provider.journal.attach({
      ...alice,
      execution: execution(),
      operation: operation('later-attach'),
      instance: instance('later'),
      grant: null,
      takeover: evidence('later-takeover'),
      recovery: evidence('later-recovery'),
    }),
  )
  const snapshot = ok(
    await s.dependencies.provider.journal.load({ ...alice, execution: execution() }),
  )
  ok(
    await s.dependencies.provider.journal.commit({
      ...alice,
      execution: execution(),
      operation: operation('later-binding'),
      authority: attached.authority,
      expected: snapshot.revision,
      checkpoint: { ...snapshot.checkpoint, calls: [laterPending] },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const prior = withAccount(s.delivery)
  if (prior.kind !== 'result' || !prior.accounts[0]?.account) throw new Error('account required')
  const delivery: ModelDelivery = {
    ...prior,
    consumer: laterPending.position,
    key: { ...prior.key, reference: laterRef },
    accounts: prior.accounts.map(item => ({
      ...item,
      account:
        item.account === null
          ? null
          : {
              ...item.account,
              subject: { kind: 'model_call', id: ok(decodeModelCallId('mcall_concurrent')) },
            },
    })),
  }
  ok(await receiver.push({ access: alice, delivery, signal: signal() }))
  // Do not wait for the deliberately held maintenance task.
  await Promise.all(s.state.outletTasks.values())
  release.resolve()
  const report = ok(await maintaining)
  expect(report.blocked).toBe(1)
  expect(JSON.stringify(report)).not.toContain('private-later-binding')
  expect(foreignReads).toEqual([])
  expect(sends).toEqual(['alice', 'alice'])
  expect(
    await receiver.retry({
      access: { ...alice, principal: 'limited' },
      execution: execution(),
      signal: signal(),
    }),
  ).toHaveProperty('failure.kind', 'denied')
})

it('does not report success when retry cannot read original Model authority for an unknown commit', async () => {
  const s = await setup()
  s.assembly.controls.journal.failNext('received', { kind: 'commit-unknown', outcome: 'pending' })
  expect(await s.push()).toHaveProperty('failure.kind', 'outcome-unknown')
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      models: {
        ...s.dependencies.models,
        async inspect() {
          return { failure: { kind: 'unavailable', dependency: 'model', diagnostic: 'offline' } }
        },
      },
    },
    s.state,
  )
  expect(await receiver.retry({ access: alice, execution: execution(), signal: signal() })).toEqual(
    { failure: { kind: 'unavailable', owner: 'agent-model-receiver', diagnostic: 'inspect' } },
  )
  expect(receiver.inspect().pending).toBe(1)
})

it('does not start the next binding qualification after cancellation of the first check', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const targets = ok(
    await s.dependencies.targets.forExecution({ access: alice, execution: execution() }),
  )
  const first = targets[0]
  if (!first) throw new Error('original target required')
  let checks = 0
  const receiver = createAgentModelReceiver(
    {
      ...s.dependencies,
      targets: {
        ...s.dependencies.targets,
        async forExecution() {
          return { ok: [first, { ...first, instance: instance('other') }] }
        },
      },
      access: {
        async check() {
          checks++
          entered.resolve()
          await release.promise
          return { kind: 'allowed', evidence: evidence('allowed') }
        },
      },
    },
    s.state,
  )
  const stop = new AbortController()
  const pending = receiver.retry({ access: alice, execution: execution(), signal: stop.signal })
  await entered.promise
  stop.abort()
  expect(await pending).toHaveProperty('failure.diagnostic', 'maintenance-cancelled')
  release.resolve()
  await drainTasks(s.state)
  expect(checks).toBe(1)
})

it.each(['unknown', 'saved'] as const)(
  'does not start material verification after cancelling an already issued %s maintenance query',
  async initial => {
    const s = await setup(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    if (initial === 'unknown') {
      s.assembly.controls.journal.failNext('received', {
        kind: 'commit-unknown',
        outcome: 'applied',
      })
      expect(await s.push()).toHaveProperty('failure.kind', 'outcome-unknown')
    } else ok(await s.push())
    const received = s.dependencies.provider.received
    if (!received) throw new Error('received provider required')
    let reads = 0
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async query(input) {
              entered.resolve()
              await release.promise
              return received.query(input)
            },
          },
          materials: {
            ...s.dependencies.provider.materials,
            async read(input) {
              reads++
              return s.dependencies.provider.materials.read(input)
            },
          },
        },
      },
      s.state,
    )
    const stop = new AbortController()
    const pending = receiver[initial === 'unknown' ? 'retry' : 'recover']({
      access: alice,
      execution: execution(),
      signal: stop.signal,
    })
    await entered.promise
    stop.abort()
    expect(await pending).toHaveProperty('failure.diagnostic', 'maintenance-cancelled')
    release.resolve()
    await drainTasks(s.state)
    expect(reads).toBe(initial === 'unknown' ? 0 : 1)
    expect(receiver.inspect().pending).toBe(initial === 'unknown' ? 1 : 0)
    expect([...s.state.receptions.values()][0]?.commit.kind).toBe(initial)
    expect(
      ok(await receiver.retry({ access: alice, execution: execution(), signal: signal() })).pending,
    ).toBe(0)
    expect(reads).toBe(1)
  },
)

it.each(['denied', 'unavailable', 'throw'] as const)(
  'preserves %s from the outbound qualification instead of returning a successful report',
  async failure => {
    const s = await setup()
    s.outlet({ kind: 'unknown' })
    ok(
      await s.receiver.push({ access: alice, delivery: withAccount(s.delivery), signal: signal() }),
    )
    await drainTasks(s.state)
    let checks = 0
    const receiver = createAgentModelReceiver(
      {
        ...s.dependencies,
        access: {
          async check() {
            checks++
            if (checks === 2) {
              if (failure === 'throw') throw new Error('access unavailable')
              return failure === 'denied'
                ? { kind: 'denied' }
                : { kind: 'unavailable', diagnostic: 'access offline' }
            }
            return { kind: 'allowed', evidence: evidence('allowed') }
          },
        },
      },
      s.state,
    )
    const reply = await receiver.retry({ access: alice, execution: execution(), signal: signal() })
    expect(reply).toHaveProperty('failure.kind', failure === 'denied' ? 'denied' : 'unavailable')
    expect(s.sent).toHaveLength(1)
    expect(receiver.inspect().pending).toBe(1)
  },
)
