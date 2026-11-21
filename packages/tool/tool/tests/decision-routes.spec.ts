import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Adoption, ToolFailure, ToolWaitId, WaitRecord } from '@omne-harness/tool-contract'
import type {
  ToolDecisionBridge,
  ToolRecovery,
  ToolTask,
} from '@omne-harness/tool-contract/provider'
import {
  memoryToolDecisionBridgeFixture,
  runConformanceCase,
  toolDecisionBridgeConformance,
} from '@omne-harness/tool-contract/testing'
import { routeToolDecisions, type ToolDecisionRoute } from '../src/decision-routes.ts'
import { scriptedBridge } from './checkpoint-values.ts'
import { adoption, callId, evidence, operationId, principalA, tenantA } from './runtime-values.ts'

const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
const PERSON = adoption('person-decision')
const REPORT = { ...adoption('agent-report'), owner: 'another-owner' }
const wait = (text: string) => text as ToolWaitId

type Facts = Pick<ToolRecovery, 'waits' | 'tasks'>

function asking(id: string, contract: Adoption): WaitRecord {
  return { phase: 'open', intent: { kind: 'ask', wait: wait(id), schemas: { contract } } } as never
}

function duty(operation: string, id: string, action: 'ensure' | 'invalidate'): ToolTask {
  return {
    kind: 'wait-registration',
    operation: operationId(operation),
    wait: wait(id),
    action,
  } as never
}

function routed(
  facts: Facts,
  routes: readonly ToolDecisionRoute<typeof principalA>[],
): ToolDecisionBridge<typeof principalA> {
  return routeToolDecisions({
    recoveryOf: () => Promise.resolve(succeed(facts)),
    routes: () => routes,
  })
}

const FACTS: Facts = {
  waits: [asking('w-person', PERSON), asking('w-report', REPORT)],
  tasks: [
    duty('ensure-report', 'w-report', 'ensure'),
    duty('close-person', 'w-person', 'invalidate'),
  ],
}

function two() {
  const person = scriptedBridge('registers')
  const report = scriptedBridge('registers')
  const bridge = routed(FACTS, [
    { contract: PERSON, bridge: () => person },
    { contract: REPORT, bridge: () => report },
  ])
  return { person, report, bridge }
}

const mutation = (operation: string) => ({ ...ACCESS, operation: operationId(operation) })

describe('the decisions of a wait go to the bridge of its request contract', () => {
  it('registers, inspects and resolves a wait at the bridge of its contract and at no other', async () => {
    const { person, report, bridge } = two()
    await bridge.ensure({
      ...mutation('ensure-report'),
      wait: wait('w-report'),
      request: evidence('r'),
    })
    expect(report.ensured.map(item => item.wait)).toEqual(['w-report'])
    expect(person.ensured).toEqual([])
    report.decide(wait('w-report'), { kind: 'no-answer' })
    const decision = evidence('decision/w-report', 'test-decisions')
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-report') })).toMatchObject({
      ok: { decision },
    })
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-person') })).toMatchObject({
      failure: { reason: 'not-registered' },
    })
    expect(await bridge.resolve({ ...ACCESS, wait: wait('w-report'), decision })).toEqual({
      ok: { kind: 'no-answer' },
    })
    expect(report.resolved).toEqual(['w-report'])
    expect(person.resolved).toEqual([])
  })

  it('tells only the bridge of the contract that a wait is closed', async () => {
    const { person, report, bridge } = two()
    await bridge.invalidate({
      ...mutation('close-person'),
      wait: wait('w-person'),
      terminal: evidence('terminal'),
      cause: 'cancelled',
    })
    expect(person.invalidated.map(item => item.wait)).toEqual(['w-person'])
    expect(report.invalidated).toEqual([])
  })

  it('finds the bridge of an operation by the wait duty that carries the operation', async () => {
    const asked: string[] = []
    const answering = (name: string): ToolDecisionBridge<typeof principalA> => ({
      ...scriptedBridge('registers'),
      inspectOperation: input => {
        asked.push(name)
        return Promise.resolve(
          succeed({ kind: 'pending' as const, operation: input.operation, diagnostic: name }),
        )
      },
    })
    const bridge = routed(FACTS, [
      { contract: PERSON, bridge: () => answering('person') },
      { contract: REPORT, bridge: () => answering('report') },
    ])
    expect(await bridge.inspectOperation(mutation('ensure-report'))).toMatchObject({
      ok: { kind: 'pending', diagnostic: 'report' },
    })
    expect(await bridge.inspectOperation(mutation('close-person'))).toMatchObject({
      ok: { kind: 'pending', diagnostic: 'person' },
    })
    expect(asked).toEqual(['report', 'person'])
    expect(await bridge.inspectOperation(mutation('no-duty'))).toMatchObject({
      ok: { kind: 'unknown', operation: 'no-duty' },
    })
  })

  it.each([
    ['of the same name from another owner', { ...PERSON, owner: 'someone-else' }],
    ['of another name from the same owner', { ...PERSON, name: 'another-wait' }],
  ])('does not take a contract %s for the contract of a route', async (_name, contract) => {
    const person = scriptedBridge('registers')
    const bridge = routed({ waits: [asking('w', contract)], tasks: [] }, [
      { contract: PERSON, bridge: () => person },
    ])
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w') })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-decisions',
        diagnostic: `no decision bridge is mounted for the wait contract ${contract.owner}/${contract.name}`,
      },
    })
  })

  it('reads the call with the access of the call, and with nothing else of the request', async () => {
    const read: unknown[] = []
    const bridge = routeToolDecisions<typeof principalA>({
      recoveryOf: access => {
        read.push(access)
        return Promise.resolve(succeed(FACTS))
      },
      routes: () => [{ contract: PERSON, bridge: () => scriptedBridge('registers') }],
    })
    await bridge.inspect({ ...ACCESS, wait: wait('w-person') })
    await bridge.inspectOperation(mutation('close-person'))
    expect(read).toEqual([ACCESS, ACCESS])
  })

  it('does not take a task of another kind with the same operation for a wait duty', async () => {
    const delivery = { kind: 'deliver', operation: operationId('ensure-report') } as never
    const bridge = routed({ ...FACTS, tasks: [delivery, ...FACTS.tasks] }, [
      { contract: REPORT, bridge: () => scriptedBridge('registers') },
    ])
    expect(await bridge.inspectOperation(mutation('ensure-report'))).toMatchObject({
      ok: { kind: 'excluded', operation: 'ensure-report' },
    })
    const only = routed({ ...FACTS, tasks: [delivery] }, [
      { contract: REPORT, bridge: () => scriptedBridge('registers') },
    ])
    expect(await only.inspectOperation(mutation('ensure-report'))).toEqual({
      ok: {
        kind: 'unknown',
        operation: 'ensure-report',
        diagnostic: 'the bridge of the operation is not found: invalid',
      },
    })
  })

  it('answers that the basis is unavailable while no bridge is mounted for the contract, and reads the routes at each call', async () => {
    const report = scriptedBridge('registers')
    let mounted: ToolDecisionBridge<typeof principalA> | undefined
    const bridge = routed(FACTS, [{ contract: REPORT, bridge: () => mounted }])
    const unmounted = { failure: { kind: 'unavailable', dependency: 'tool-decisions' } }
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-report') })).toMatchObject(unmounted)
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-person') })).toMatchObject(unmounted)
    expect(await bridge.inspectOperation(mutation('ensure-report'))).toMatchObject({
      ok: { kind: 'unknown' },
    })
    mounted = report
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-report') })).toMatchObject({
      failure: { reason: 'not-registered' },
    })
  })

  it('refuses a wait that the call does not have, and a wait that is not for a decision', async () => {
    const bridge = routed(
      {
        waits: [{ phase: 'open', intent: { kind: 'resource', wait: wait('w-res') } } as never],
        tasks: [],
      },
      [{ contract: PERSON, bridge: () => scriptedBridge('registers') }],
    )
    for (const id of ['w-res', 'w-absent'])
      expect(await bridge.inspect({ ...ACCESS, wait: wait(id) })).toEqual({
        failure: {
          kind: 'invalid',
          field: 'wait',
          reason: 'the call has no such wait for a decision',
        },
      })
  })

  it('hands on the failure of the read of the call, and leaves an operation unknown', async () => {
    const failure: ToolFailure = { kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' }
    const bridge = routeToolDecisions<typeof principalA>({
      recoveryOf: () => Promise.resolve(fail(failure)),
      routes: () => [{ contract: PERSON, bridge: () => scriptedBridge('registers') }],
    })
    expect(await bridge.inspect({ ...ACCESS, wait: wait('w-person') })).toEqual({ failure })
    expect(await bridge.inspectOperation(mutation('ensure-report'))).toMatchObject({
      ok: { kind: 'unknown', operation: 'ensure-report' },
    })
  })
})

describe('a conforming bridge behind the routes still conforms', () => {
  const contract = adoption('memory')
  function fixture() {
    const base = memoryToolDecisionBridgeFixture()
    const duties = new Map<string, ToolWaitId>()
    const inner = base.bridge
    const routes = routeToolDecisions<string>({
      recoveryOf: () =>
        Promise.resolve(
          succeed({
            waits: [...new Set(duties.values())].map(id => asking(id, contract)),
            tasks: [...duties].map(([operation, id]) => duty(operation, id, 'ensure')),
          }),
        ),
      routes: () => [{ contract, bridge: () => inner }],
    })
    const known = <T extends { wait: ToolWaitId; operation?: string }>(input: T): T => {
      duties.set(input.operation ?? `read/${input.wait}`, input.wait)
      return input
    }
    const bridge: ToolDecisionBridge<string> = {
      inspectOperation: input => routes.inspectOperation(input),
      ensure: input => routes.ensure(known(input)),
      inspect: input => routes.inspect(known(input)),
      invalidate: input => routes.invalidate(known(input)),
      resolve: input => routes.resolve(known(input)),
    }
    return { ...base, bridge }
  }

  it.each(toolDecisionBridgeConformance<string>().map(item => [item.name, item] as const))(
    '%s',
    async (_name, item) => {
      await runConformanceCase(item, fixture())
    },
  )
})
