import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolWaitId } from '@omne-harness/tool-contract'
import type { PendingCall } from '@omne-harness/tool'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type BridgeScript,
} from './checkpoint-values.ts'
import {
  callId,
  evidence,
  ok,
  operationId,
  principalA,
  principalB,
  referenceFor,
  tenantA,
  tenantB,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  testAuthority,
  type StartOptions,
} from './start-values.ts'

afterEach(auditQueues)

const FIRST = 'op-c1/start/wait' as ToolWaitId
const ACCESS = { principal: principalA, tenant: tenantA } as const

function setup(script: BridgeScript = 'registers', options: StartOptions = {}) {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const bridge = scriptedBridge(script)
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    environmentsPort: releasing,
    ...options,
  })
  return { harness, checkpoint, bridge, authority }
}

function releasing(base: Parameters<NonNullable<StartOptions['environmentsPort']>>[0]) {
  const released = { kind: 'released', evidence: evidence('environment-released') } as const
  return Object.assign(base, {
    release: () => Promise.resolve(succeed(released)),
    inspectRelease: () => Promise.resolve(succeed(released)),
  })
}

type Harness = ReturnType<typeof setup>['harness']

async function settle(harness: Harness): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

async function scanned(harness: Harness, limit = 10): Promise<string[]> {
  const calls: string[] = []
  let after: string | null = null
  for (let round = 0; round < 50; round += 1) {
    const page: Readonly<{ calls: readonly string[]; next: string | null }> = ok(
      await harness.commands.scanPending({ ...ACCESS, after, limit }),
    )
    expect(page.calls.length).toBeLessThanOrEqual(limit)
    calls.push(...page.calls)
    if (page.next === null) return calls
    after = page.next
  }
  throw new Error('the scan did not end')
}

async function tasksOf(harness: Harness, call: string) {
  const read = ok(await harness.commands.loadRecovery({ ...ACCESS, call: callId(call) }))
  return {
    tasks: read.tasks.filter(task => task.state === 'pending').map(task => task.kind),
    waits: read.waits.map(wait => wait.phase),
  }
}

async function suspend(harness: Harness, call: string): Promise<void> {
  await admitCall(harness, call)
  await harness.drive(call)
  await settle(harness)
}

describe('the pending marker of a call domain', () => {
  it('lists a suspended call while its wait is open, and drops it once the settled call owes nothing', async () => {
    const { harness, bridge } = setup()
    expect(await scanned(harness)).toEqual([])
    await suspend(harness, 'c1')
    expect(await tasksOf(harness, 'c1')).toEqual({ tasks: [], waits: ['open'] })
    expect(await scanned(harness)).toEqual(['c1'])
    bridge.decide(FIRST, { kind: 'answer', value: { kind: 'string', value: 'a.txt' } })
    await harness.drive('c1')
    await settle(harness)
    const state = await harness.state('c1')
    if (state.phase !== 'settled' || state.delivery?.kind !== 'pending')
      throw new Error('c1 must settle with its delivery owed')
    expect(await tasksOf(harness, 'c1')).toEqual({ tasks: ['deliver'], waits: ['closed'] })
    expect(await scanned(harness)).toEqual(['c1'])
    const { delivery, consumer } = state.delivery
    expect(
      await harness.runtime.commands.releaseDelivery({
        ...ACCESS,
        reference: referenceFor('c1', 'op-c1'),
        result: state.result,
        delivery,
        consumer,
        evidence: { kind: 'processed', completion: evidence('consumer-processed', consumer.owner) },
      }),
    ).toMatchObject({ kind: 'released' })
    expect(await tasksOf(harness, 'c1')).toEqual({ tasks: [], waits: ['closed'] })
    const left = ok(await harness.commands.loadRecovery({ ...ACCESS, call: callId('c1') })).tasks
    expect(left.map(task => [task.kind, task.state])).toEqual([['clock', 'blocked']])
    expect(await scanned(harness)).toEqual([])
  })

  it('lists a call whose registration duty is still open', async () => {
    const { harness, bridge } = setup('registers')
    const unanswered = setup('registers', {
      decisions: {
        ...bridge,
        ensure: () =>
          Promise.resolve(
            fail({ kind: 'unavailable', dependency: 'decisions', diagnostic: 'injected' }),
          ),
      },
    })
    await admitCall(unanswered.harness, 'c1')
    await unanswered.harness.drive('c1')
    expect(await tasksOf(unanswered.harness, 'c1')).toEqual({
      tasks: ['wait-registration'],
      waits: ['opening'],
    })
    expect(await scanned(unanswered.harness)).toEqual(['c1'])
    expect(await scanned(harness)).toEqual([])
  })

  it('lists a call whose wait stays opening after the decision owner refused its registration', async () => {
    const { harness } = setup('refuses')
    await suspend(harness, 'c1')
    expect(await tasksOf(harness, 'c1')).toEqual({ tasks: [], waits: ['opening'] })
    expect(await scanned(harness)).toEqual(['c1'])
  })

  it('lists a call whose decision was accepted: the wait is responding and a queue task is open', async () => {
    const { harness, bridge } = setup()
    await suspend(harness, 'c1')
    bridge.decide(FIRST, { kind: 'answer', value: { kind: 'string', value: 'a.txt' } })
    ok(
      await harness.commands.acceptDecision({
        ...ACCESS,
        call: callId('c1'),
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
    )
    expect(await tasksOf(harness, 'c1')).toEqual({
      tasks: ['queue', 'prepare'],
      waits: ['responding'],
    })
    expect(await scanned(harness)).toEqual(['c1'])
  })

  it('pages with the cursor it answers, each call once, and lists the calls of the asked tenant only', async () => {
    const { harness } = setup()
    for (const call of ['c1', 'c2', 'c3']) await suspend(harness, call)
    const first = ok(await harness.commands.scanPending({ ...ACCESS, after: null, limit: 2 }))
    expect(first.calls).toEqual(['c1', 'c2'])
    expect(first.next).not.toBeNull()
    const second = ok(
      await harness.commands.scanPending({ ...ACCESS, after: first.next, limit: 2 }),
    )
    expect(second).toEqual({ calls: ['c3'], next: null })
    expect(await scanned(harness, 1)).toEqual(['c1', 'c2', 'c3'])
    expect(
      ok(
        await harness.commands.scanPending({
          principal: principalB,
          tenant: tenantB,
          after: null,
          limit: 10,
        }),
      ),
    ).toEqual({ calls: [], next: null })
  })

  it('denies a principal that may not recover a listed call', async () => {
    const { harness } = setup()
    await suspend(harness, 'c1')
    expect(
      await harness.commands.scanPending({
        principal: principalB,
        tenant: tenantA,
        after: null,
        limit: 10,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'recover' } })
  })

  it.each([0, -1, 1.5, 1001, Number.NaN, '2'])('refuses the limit %s', async limit => {
    const { harness } = setup()
    expect(
      await harness.commands.scanPending({ ...ACCESS, after: null, limit: limit as number }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'limit' } })
  })

  it('refuses a cursor that it did not answer', async () => {
    const { harness } = setup()
    expect(await harness.commands.scanPending({ ...ACCESS, after: '', limit: 10 })).toMatchObject({
      failure: { kind: 'invalid', field: 'after' },
    })
  })

  it('answers unavailable when the scan of the store fails', async () => {
    const failing = setup('registers', {
      store: memory => ({
        ...memory,
        scanPending: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'injected' }),
      }),
    })
    expect(
      await failing.harness.commands.scanPending({ ...ACCESS, after: null, limit: 10 }),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'injected' },
    })
  })
})

describe('the boundary of scanPending and of the trusted scan', () => {
  type Store = Parameters<NonNullable<StartOptions['store']>>[0]
  const over = (scan: Store['scanPending']) =>
    setup('registers', { store: memory => ({ ...memory, scanPending: scan }) }).harness

  it.each([null, 'scan', 7])('refuses the input %s, which is no object', async input => {
    const { harness } = setup()
    const type = { failure: { kind: 'invalid', field: 'input', reason: 'type' } }
    expect(await harness.commands.scanPending(input as never)).toEqual(type)
    expect(await harness.ledger.recovery.scan(input as never)).toEqual(type)
  })

  it('denies a scan without a tenant or without a principal, before it reads', async () => {
    const { harness } = setup()
    const reads = harness.memory.reads
    const denied = { failure: { kind: 'denied', action: 'recover' } }
    expect(
      await harness.commands.scanPending({
        principal: principalA,
        tenant: 'tenant-a',
        after: null,
        limit: 10,
      } as never),
    ).toEqual(denied)
    expect(
      await harness.commands.scanPending({ tenant: tenantA, after: null, limit: 10 } as never),
    ).toEqual(denied)
    expect(harness.memory.reads).toBe(reads)
  })

  it('takes the limits 1 and 1000, and names the range when it refuses one', async () => {
    const { harness } = setup()
    for (const limit of [1, 1000])
      expect(await harness.commands.scanPending({ ...ACCESS, after: null, limit })).toEqual({
        ok: { calls: [], next: null },
      })
    const range = {
      failure: { kind: 'invalid', field: 'limit', reason: 'expected an integer from 1 to 1000' },
    }
    expect(await harness.commands.scanPending({ ...ACCESS, after: null, limit: 0 })).toEqual(range)
    expect(await harness.ledger.recovery.scan({ after: null, limit: 0 })).toEqual(range)
  })

  it('refuses a trusted cursor that names no tenant or no call', async () => {
    const { harness } = setup()
    const scan = (after: unknown) => harness.ledger.recovery.scan({ after, limit: 10 } as never)
    const noTenant = { failure: { kind: 'invalid', field: 'after', reason: 'tenant' } }
    expect(await scan('c1')).toEqual(noTenant)
    expect(await scan({ tenant: 'tenant-a', call: 'c1' })).toEqual(noTenant)
    const noCall = await scan({ tenant: tenantA, call: '' })
    expect(noCall).toMatchObject({ failure: { kind: 'invalid', field: 'after' } })
    expect(noCall).not.toEqual(noTenant)
  })

  it('answers unavailable for a store that throws, without the text of the exception', async () => {
    const harness = over(() => Promise.reject(new Error('secret of the store')))
    for (const answer of [
      await harness.commands.scanPending({ ...ACCESS, after: null, limit: 10 }),
      await harness.ledger.recovery.scan({ after: null, limit: 10 }),
    ]) {
      expect(answer).toMatchObject({ failure: { kind: 'unavailable', dependency: 'ledger-store' } })
      expect(JSON.stringify(answer)).not.toContain('secret')
    }
  })

  it('answers unsupported with the reason of a store that cannot scan', async () => {
    const harness = over(() => Promise.resolve({ kind: 'unsupported', reason: 'no tenant source' }))
    for (const answer of [
      await harness.commands.scanPending({ ...ACCESS, after: null, limit: 10 }),
      await harness.ledger.recovery.scan({ after: null, limit: 10 }),
    ])
      expect(answer).toMatchObject({
        failure: {
          kind: 'unsupported',
          adoption: { name: 'tool-ledger' },
          reason: 'no tenant source',
        },
      })
  })

  it('answers no cursor for an empty page, even when the store says there is more', async () => {
    const harness = over(() => Promise.resolve({ kind: 'page', calls: [], more: true }))
    expect(await harness.commands.scanPending({ ...ACCESS, after: null, limit: 10 })).toEqual({
      ok: { calls: [], next: null },
    })
    expect(await harness.ledger.recovery.scan({ after: null, limit: 10 })).toEqual({
      ok: { calls: [], next: null },
    })
  })

  it('answers no cursor on the last page of the trusted scan', async () => {
    const { harness } = setup()
    await suspend(harness, 'c1')
    await suspend(harness, 'c2')
    const first = ok(await harness.ledger.recovery.scan({ after: null, limit: 1 }))
    expect(first.next).toMatchObject({ call: 'c1' })
    const last = ok(await harness.ledger.recovery.scan({ after: first.next, limit: 1 }))
    expect(last.calls.map(entry => entry.call)).toEqual(['c2'])
    expect(last.next).toBeNull()
  })
})

describe('the trusted recovery scan of the ledger', () => {
  it('lists the pending calls of every tenant with their tenants, page by page', async () => {
    const { harness } = setup()
    await suspend(harness, 'c1')
    await suspend(harness, 'c2')
    const seen: PendingCall[] = []
    let after: PendingCall | null = null
    for (let round = 0; round < 10; round += 1) {
      const page: Readonly<{ calls: readonly PendingCall[]; next: PendingCall | null }> = ok(
        await harness.ledger.recovery.scan({ after, limit: 1 }),
      )
      seen.push(...page.calls)
      if (page.next === null) break
      after = page.next
    }
    expect(seen.map(entry => [entry.tenant.account.text, entry.call])).toEqual([
      [tenantA.account.text, 'c1'],
      [tenantA.account.text, 'c2'],
    ])
  })
})
