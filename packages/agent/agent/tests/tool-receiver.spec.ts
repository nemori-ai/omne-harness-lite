import { describe, expect, it } from 'vitest'
import {
  createAgentToolReceiver,
  createToolReceiverState,
  readToolDeliveryMaterial,
  type ToolReceiverDependencies,
  type ToolReceptionTarget,
} from '@omne-harness/agent'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import {
  decodeActionId,
  decodeAgentExecutionId,
  type Access,
  type ConsumerRef,
  type Material,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { toolResultReceiverConformance } from '@omne-harness/tool-contract/testing'
import { toolDeliveryMaterial, toolReceivedDraft } from '../src/tool-receiving-material.ts'
import { json, plain, object } from '../src/receiving-values.ts'
import {
  access,
  otherTenant,
  checkpoint,
  consumption,
  evidence,
  execution,
  instance,
  ok,
  openInput,
  operation,
  loadWithEntries,
} from './journal-support.ts'

const consumer: ConsumerRef = {
  owner: 'agent',
  work: 'opaque-work',
  position: 'first',
  purpose: 'result',
}
const otherConsumer = { ...consumer, position: 'second' }
const signal = () => new AbortController().signal
const reference = (who: Access<string>, call: string) =>
  ok(
    encodeToolInvocationRef({
      tenant: who.tenant,
      call: ok(decodeToolCallId(call)),
      admission: ok(decodeToolOperationId(`${call}/admission`)),
    }),
  )

async function setup() {
  const journal = createMemoryAgentJournal<string>({ coordination: 'standalone' })
  const targets = new Map<string, ToolReceptionTarget>()
  for (const who of [access, otherTenant]) {
    const calls = ['call-0', 'call-1', 'call-over'].map(name => {
      const pending: ToolReceptionTarget['pending'] = {
        kind: 'tool',
        association: 'associated',
        purpose: 'action',
        reference: reference(who, name),
        position: consumer,
        action: ok(decodeActionId(name)),
        consumption: consumption(name),
        fixed: evidence(name),
      }
      targets.set(pending.reference, { execution: execution(), instance: instance(), pending })
      return pending
    })
    ok(
      await journal.port.open(
        openInput({
          ...who,
          execution: execution(),
          operation: operation('open'),
          checkpoint: { ...checkpoint(), calls },
        }),
      ),
    )
  }
  let allowed = true
  const qualifies = (who: Access<string>) =>
    allowed &&
    [access, otherTenant].some(
      item => item.principal === who.principal && item.tenant === who.tenant,
    )
  const dependencies: ToolReceiverDependencies<string> = {
    provider: journal.provider,
    access: {
      async check(input) {
        return qualifies(input.access)
          ? { kind: 'allowed', evidence: evidence('allowed') }
          : { kind: 'denied' }
      },
    },
    targets: {
      async resolve(input) {
        if (!qualifies(input.access))
          return { failure: { kind: 'denied', action: 'receive-result' } }
        const registered = [consumer, otherConsumer].some(
          item =>
            item.owner === input.consumer.owner &&
            item.work === input.consumer.work &&
            item.position === input.consumer.position &&
            item.purpose === input.consumer.purpose,
        )
        return { ok: registered ? (targets.get(input.reference) ?? null) : null }
      },
      async forExecution(input) {
        if (!qualifies(input.access) || input.execution !== execution())
          return { failure: { kind: 'denied', action: 'receive-result' } }
        return {
          ok: [...targets.values()].filter(
            target =>
              target.pending.reference === reference(input.access, 'call-0') ||
              target.pending.reference === reference(input.access, 'call-1') ||
              target.pending.reference === reference(input.access, 'call-over'),
          ),
        }
      },
    },
    capacity: () => ({ records: 2, bytes: 1000000, attachments: 10, inFlight: 2 }),
  }
  const state = createToolReceiverState<string>()
  const receiver = ok(createAgentToolReceiver(dependencies, state))
  const delivery: ToolDelivery<ContentBlock> = {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference: reference(access, 'call-1'),
      result: ok(decodeToolResultVersion('result-1')),
    },
    consumer,
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'occurred', evidence: evidence('effect') },
    source: evidence('result'),
    value: { content: [], data: { kind: 'none' }, original: { kind: 'none' }, attachments: [] },
    account: null,
  }
  return {
    journal,
    targets,
    dependencies,
    state,
    receiver,
    delivery,
    access,
    otherAccess: otherTenant,
    strangerAccess: { ...access, principal: 'stranger' },
    consumer,
    otherConsumer,
    tenantCapacity: 2,
    revoke() {
      allowed = false
    },
    push: (value: ToolDelivery<ContentBlock> = delivery, stop = signal()) =>
      receiver.push({ access, delivery: value, signal: stop }),
  }
}

describe('Tool result receiver conformance', () => {
  for (const entry of toolResultReceiverConformance<string>())
    it(entry.name, async () => {
      await entry.run(await setup())
    })
})

it('receives a late result after detach and receiver reassembly with the original host state', async () => {
  const s = await setup()
  ok(await s.push())
  const opened = await loadWithEntries(s.journal.provider, { ...access, execution: execution() })
  if (!opened.executionAttachment) throw new Error('attachment expected')
  ok(
    await s.journal.port.detach({
      ...access,
      execution: execution(),
      operation: operation('detach'),
      authority: opened.executionAttachment,
      reason: evidence('detach'),
    }),
  )
  const rebuilt = ok(createAgentToolReceiver(s.dependencies, s.state))
  expect(s.state.receptions.size).toBe(1)
  const late = {
    ...s.delivery,
    relation: 'late' as const,
    key: { ...s.delivery.key, result: ok(decodeToolResultVersion('result-2')) },
    delivery: ok(decodeToolDeliveryId('delivery-2')),
  }
  const saved = ok(await rebuilt.push({ access, delivery: late, signal: signal() }))
  const loaded = await loadWithEntries(s.journal.provider, { ...access, execution: execution() })
  expect(loaded.entries).toHaveLength(2)
  const entry = loaded.entries?.[1]
  if (!entry || entry.kind !== 'received') throw new Error('received entry expected')
  const material = ok(
    await s.journal.provider.materials.read({ ...access, source: entry.material }),
  )
  expect(readToolDeliveryMaterial(access, material, entry)).toEqual(late)
  expect(saved.key).toEqual(late.key)
})

it.each(['applied', 'pending', 'dropped'] as const)(
  'retains the original operation through %s unknown and reassembly',
  async outcome => {
    const s = await setup()
    const received = s.dependencies.provider.received
    if (!received) throw new Error('joint provider expected')
    let commits = 0
    const dependencies = {
      ...s.dependencies,
      provider: {
        ...s.dependencies.provider,
        received: {
          ...received,
          async commit(input: Parameters<typeof received.commit>[0]) {
            commits++
            return received.commit(input)
          },
        },
      },
    }
    const receiver = ok(createAgentToolReceiver(dependencies, s.state))
    s.journal.failNext('received', { kind: 'commit-unknown', outcome })
    expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
      failure: { kind: 'outcome-unknown' },
    })
    const before = await loadWithEntries(s.journal.provider, { ...access, execution: execution() })
    expect(before.entries).toHaveLength(outcome === 'applied' ? 1 : 0)
    if (outcome === 'pending') {
      const original = before.unresolved[0]
      if (!original) throw new Error('unresolved original operation expected')
      expect(s.journal.settle(execution(), original, 'applied', access.tenant)).toBe(true)
    }
    const rebuilt = ok(createAgentToolReceiver(dependencies, s.state))
    const replay = await rebuilt.push({ access, delivery: s.delivery, signal: signal() })
    expect(replay).toHaveProperty(
      outcome === 'dropped' ? 'failure.dependency' : 'ok',
      outcome === 'dropped' ? 'responsibility' : expect.anything(),
    )
    expect(commits).toBe(1)
    expect(
      (await loadWithEntries(s.journal.provider, { ...access, execution: execution() })).entries,
    ).toHaveLength(outcome === 'dropped' ? 0 : 1)
  },
)

it('never reports saved for a definite failure before the common publication', async () => {
  const s = await setup()
  const received = s.dependencies.provider.received
  if (!received) throw new Error('joint provider expected')
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              s.journal.receiving.fault(input, 'before-publish')
              return received.commit(input)
            },
          },
        },
      },
      s.state,
    ),
  )
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    failure: { kind: 'unavailable', dependency: 'material' },
  })
  expect(await s.journal.receiving.inspect(access, execution())).toMatchObject({
    entries: 0,
    materials: 0,
  })
})

it('retains actual in-flight work after wait cancellation and saves once', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>()
  const received = s.dependencies.provider.received
  if (!received) throw new Error('joint provider expected')
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        capacity: () => ({ records: 10, bytes: 1000000, attachments: 10, inFlight: 1 }),
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              entered.resolve()
              await released.promise
              return received.commit(input)
            },
          },
        },
      },
      s.state,
    ),
  )
  const stop = new AbortController()
  const pending = receiver.push({ access, delivery: s.delivery, signal: stop.signal })
  await entered.promise
  stop.abort()
  expect(await pending).toEqual({ failure: { kind: 'outcome-unknown' } })
  expect(s.state.tasks.size).toBe(1)
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    failure: { kind: 'backpressured', resource: 'in-flight' },
  })
  released.resolve()
  await Promise.all(s.state.tasks)
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toHaveProperty(
    'ok',
  )
  expect(
    (await loadWithEntries(s.journal.provider, { ...access, execution: execution() })).entries,
  ).toHaveLength(1)
})

it('rechecks current qualification even for a saved key and preserves facts on refusal', async () => {
  const s = await setup()
  ok(await s.push())
  s.revoke()
  expect(await s.push()).toEqual({ failure: { kind: 'denied' } })
  expect(
    await s.receiver.retry({ access, execution: execution(), signal: signal() }),
  ).toHaveProperty('failure.kind', 'denied')
  expect(s.state.receptions.size).toBe(1)
})

it('recovers saved results from the same journal without another commit', async () => {
  const s = await setup()
  const saved = ok(await s.push()),
    received = s.dependencies.provider.received
  if (!received) throw new Error('joint provider expected')
  let commits = 0
  const state = createToolReceiverState<string>()
  const rebuilt = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              commits++
              return received.commit(input)
            },
          },
        },
      },
      state,
    ),
  )
  expect(await rebuilt.recover({ access, execution: execution(), signal: signal() })).toEqual({
    ok: { pending: 0, diagnostics: [] },
  })
  expect(await rebuilt.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    ok: saved,
  })
  expect(commits).toBe(0)
})

it('checks the complete saved payload before returning the provider receipt', async () => {
  const s = await setup()
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          materials: {
            ...s.dependencies.provider.materials,
            async read() {
              return {
                ok: {
                  kind: 'facts',
                  schema: { owner: 'wrong', name: 'wrong', revision: '1', digest: 'wrong' },
                  value: { kind: 'null' },
                },
              }
            },
          },
        },
      },
      s.state,
    ),
  )
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    failure: { kind: 'outcome-unknown' },
  })
  expect(s.state.receptions.size).toBe(1)
  expect(
    (await loadWithEntries(s.journal.provider, { ...access, execution: execution() })).entries,
  ).toHaveLength(1)
})

it('rejects foreign references before querying an association', async () => {
  const s = await setup()
  let lookups = 0
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        targets: {
          ...s.dependencies.targets,
          async resolve(input) {
            lookups++
            return s.dependencies.targets.resolve(input)
          },
        },
      },
      s.state,
    ),
  )
  expect(
    await receiver.push({
      access,
      delivery: {
        ...s.delivery,
        key: { ...s.delivery.key, reference: reference(otherTenant, 'call-1') },
      },
      signal: signal(),
    }),
  ).toEqual({ failure: { kind: 'denied' } })
  expect(lookups).toBe(0)
})

it('checks current receive-result authorization even when the binding provider returned a target', async () => {
  const s = await setup()
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        access: {
          async check() {
            return { kind: 'denied' }
          },
        },
      },
      s.state,
    ),
  )
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    failure: { kind: 'denied' },
  })
  expect(s.state.receptions.size).toBe(0)
})

it('keeps an independent copy before asynchronous authorization', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        access: {
          async check() {
            entered.resolve()
            await release.promise
            return { kind: 'allowed', evidence: evidence('allowed') }
          },
        },
      },
      s.state,
    ),
  )
  const value = structuredClone(s.delivery)
  const pending = receiver.push({ access, delivery: value, signal: signal() })
  await entered.promise
  Object.assign(value.effect, { kind: 'unknown', diagnostic: 'caller changed' })
  release.resolve()
  const saved = ok(await pending)
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    ok: saved,
  })
})

it('retains a later account revision independently and detects conflicting account content', async () => {
  const s = await setup()
  ok(await s.push())
  const account: Extract<ToolDelivery<ContentBlock>, { kind: 'account' }> = {
    kind: 'account',
    consumer,
    key: {
      kind: 'account',
      producer: 'tool',
      reference: s.delivery.key.reference,
      event: 'opaque-meter-event',
      revision: '2',
    },
    account: {
      subject: { kind: 'tool_execution', id: 'call-1' },
      usage: [],
      cost: [{ state: 'unknown', unit: 'USD', source: 'observation' }],
      trimmed: { state: 'known', lexeme: '0', unit: 'token' },
      place: 'fixture',
      duration: 'PT1S',
      receipt: 'late',
      revision: '2',
    },
  }
  const saved = ok(await s.push(account))
  expect(await s.push(account)).toEqual({ ok: saved })
  expect(
    await s.push({ ...account, account: { ...account.account, place: 'conflicting' } }),
  ).toEqual({ failure: { kind: 'conflict' } })
  expect(
    (await loadWithEntries(s.journal.provider, { ...access, execution: execution() })).entries,
  ).toHaveLength(2)
})

it.each(['terminal', 'actualTerminal', 'effect', 'value', 'tenant'] as const)(
  'rejects corrupted persisted %s without trusting the entry alone',
  async field => {
    const s = await setup()
    const expected = toolReceivedDraft(s.delivery, consumption('call-1'))
    const material = toolDeliveryMaterial(access, s.delivery)
    if (material.kind !== 'facts') throw new Error('facts required')
    const decoded = readToolDeliveryMaterial(access, material, expected)
    expect(decoded).toEqual(s.delivery)
    const original = plain(material.value)
    if (!object(original) || !object(original.delivery)) throw new Error('envelope required')
    if (field === 'tenant') Object.assign(original, { tenant: 'foreign' })
    else Object.assign(original.delivery, { [field]: { kind: 'unsupported' } })
    expect(
      readToolDeliveryMaterial(access, { ...material, value: json(original) }, expected),
    ).toBeNull()
  },
)

it('treats a second push of a key that is still being written as unknown without a second commit', async () => {
  const s = await setup(),
    entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>()
  const received = s.dependencies.provider.received
  if (!received) throw new Error('joint provider expected')
  let commits = 0
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              commits++
              entered.resolve()
              await released.promise
              return received.commit(input)
            },
          },
        },
      },
      s.state,
    ),
  )
  const first = receiver.push({ access, delivery: s.delivery, signal: signal() })
  await entered.promise
  const second = receiver.push({ access, delivery: s.delivery, signal: signal() })
  const settled = await Promise.race([
    second,
    new Promise<'still-waiting'>(resolve => setTimeout(resolve, 100, 'still-waiting')),
  ])
  expect(settled).toEqual({ failure: { kind: 'outcome-unknown' } })
  released.resolve()
  const saved = ok(await first)
  expect(commits).toBe(1)
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    ok: saved,
  })
  expect(commits).toBe(1)
})

it('does not report saved when the provider receipt names another execution', async () => {
  const s = await setup()
  const received = s.dependencies.provider.received
  if (!received) throw new Error('joint provider expected')
  const elsewhere = ok(decodeAgentExecutionId('another-execution'))
  const receiver = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          received: {
            ...received,
            async commit(input) {
              const reply = await received.commit(input)
              if ('failure' in reply || reply.ok.kind !== 'committed') return reply
              const { value } = reply.ok
              return {
                ok: {
                  ...reply.ok,
                  value: { ...value, receipt: { ...value.receipt, execution: elsewhere } },
                },
              }
            },
          },
        },
      },
      s.state,
    ),
  )
  expect(await receiver.push({ access, delivery: s.delivery, signal: signal() })).toEqual({
    failure: { kind: 'outcome-unknown' },
  })
  expect([...s.state.receptions.values()].map(item => item.commit.kind)).toEqual(['unknown'])
})

it('recovers only the entries of the bound targets and reads no other material', async () => {
  const s = await setup()
  ok(await s.push())
  const reads: unknown[] = []
  const first = [...s.targets.values()].find(
    target => target.pending.reference === reference(access, 'call-0'),
  )
  if (!first) throw new Error('bound target expected')
  const state = createToolReceiverState<string>()
  const rebuilt = ok(
    createAgentToolReceiver(
      {
        ...s.dependencies,
        provider: {
          ...s.dependencies.provider,
          materials: {
            ...s.dependencies.provider.materials,
            async read(input) {
              reads.push(input.source)
              return s.dependencies.provider.materials.read(input)
            },
          },
        },
        targets: {
          ...s.dependencies.targets,
          async forExecution() {
            return { ok: [first] }
          },
        },
      },
      state,
    ),
  )
  expect(await rebuilt.recover({ access, execution: execution(), signal: signal() })).toEqual({
    ok: { pending: 0, diagnostics: [] },
  })
  expect(reads).toEqual([])
  expect(state.receptions.size).toBe(0)
})

it('keeps the execution of retained material: another execution or other content under the same identity is refused', async () => {
  const s = await setup()
  const unbound: ConsumerRef = { ...consumer, work: 'unbound-work' }
  const value: Material<ContentBlock> = {
    kind: 'facts',
    schema: { owner: 'suite', name: 'payload', revision: '1', digest: 'fixture' },
    value: { kind: 'string', value: 'retained' },
  }
  const stranger = s.strangerAccess
  const materials = s.journal.provider.materials
  s.journal.receiving.qualify(stranger, execution(), 'denied')
  expect(
    await materials.preserve({
      ...stranger,
      execution: execution(),
      identity: 'retained',
      consumer: unbound,
      value,
    }),
  ).toHaveProperty('failure.kind', 'denied')
  const source = ok(
    await materials.preserve({
      ...access,
      execution: execution(),
      identity: 'retained',
      consumer: unbound,
      value,
    }),
  )
  const changed: Material<ContentBlock> = { ...value, value: { kind: 'string', value: 'other' } }
  expect(
    await materials.preserve({
      ...access,
      execution: execution(),
      identity: 'retained',
      consumer: unbound,
      value: changed,
    }),
  ).toHaveProperty('failure.kind', 'invalid')
  expect(
    ok(
      await materials.preserve({
        ...access,
        execution: execution(),
        identity: 'retained',
        consumer: unbound,
        value,
      }),
    ),
  ).toEqual(source)
  expect(await materials.read({ ...stranger, source })).toHaveProperty('failure.kind', 'denied')
  expect(ok(await materials.read({ ...access, source }))).toEqual(value)
})

it.each(['retry', 'recover'] as const)(
  'does not touch unknown receptions outside the bound targets on %s',
  async method => {
    const s = await setup()
    s.journal.failNext('received', { kind: 'commit-unknown', outcome: 'pending' })
    expect(await s.push()).toEqual({ failure: { kind: 'outcome-unknown' } })
    const outside = [...s.state.receptions.values()]
    expect(outside.map(item => item.commit.kind)).toEqual(['unknown'])
    const received = s.dependencies.provider.received
    if (!received) throw new Error('joint provider expected')
    const touched: string[] = []
    const first = [...s.targets.values()].find(
      target => target.pending.reference === reference(access, 'call-0'),
    )
    if (!first) throw new Error('bound target expected')
    const rebuilt = ok(
      createAgentToolReceiver(
        {
          ...s.dependencies,
          provider: {
            ...s.dependencies.provider,
            received: {
              async commit(input) {
                touched.push('commit')
                return received.commit(input)
              },
              async query(input) {
                touched.push('query')
                return received.query(input)
              },
            },
            materials: {
              ...s.dependencies.provider.materials,
              async read(input) {
                touched.push('read')
                return s.dependencies.provider.materials.read(input)
              },
            },
          },
          targets: {
            ...s.dependencies.targets,
            async forExecution() {
              return { ok: [first] }
            },
          },
        },
        s.state,
      ),
    )
    expect(await rebuilt[method]({ access, execution: execution(), signal: signal() })).toEqual({
      ok: { pending: 0, diagnostics: [] },
    })
    expect(touched).toEqual([])
    expect(outside.map(item => item.commit.kind)).toEqual(['unknown'])
  },
)
