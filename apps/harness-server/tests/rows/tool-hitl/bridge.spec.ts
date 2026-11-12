// 决策方（`rows/tool-hitl/bridge.ts`）对它两侧端口的用法：Tool 一侧是调用的恢复读（含等待的请求原文）与会话读，HITL 一侧
// 是准备、登记、原操作查询、请求读、接收者绑定、接手与失效。两侧都是替身；真实组合见同目录的 release-ask.spec.ts 与
// release-reply.spec.ts。
import { describe, expect, it } from 'vitest'
import type {
  CommandResult,
  InvalidateWait,
  RegisterRequest,
} from '@omne-harness/human-intervention'
import { hitlCommandBinding } from '@omne-harness/human-intervention-local'
import { inProcessPrincipalAuthority, standingPrincipalRef } from '@omne-harness/identity'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolCallId, ToolOperationId, ToolWaitId } from '@omne-harness/tool-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { hitlCardAudience, hitlEntryRef } from '../../../src/entry/hitl-entry-principals.ts'
import { createToolHitlBridge } from '../../../src/rows/tool-hitl/bridge.ts'
import type { ToolHitlHost } from '../../../src/rows/tool-hitl/host.ts'
import type { HitlAudience } from '../../../src/rows/tool-hitl/holder.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenant = testingTenant(`org_${'1'.repeat(26)}`, `acc_${'2'.repeat(26)}`)
const authority = inProcessPrincipalAuthority()
const unwrap = <T>(value: { ok: T } | { failure: unknown }): T => {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const issue = (component: string, work: Readonly<{ owner: string; work: string }>) =>
  unwrap(
    authority.issuer.issueActingForTenant({
      actor: unwrap(authority.issuer.issueSystem({ component })),
      tenant,
      work,
    }),
  )
const caller = issue(SESSION_WORK_COMPONENT, { owner: 'session', work: 'session-1' })
const registrar = issue('toolDecisions', { owner: 'harness.tool-decisions', work: 'ask' })
const reader = 'principal/1/reader'

const call = 'call-1' as ToolCallId
const wait = 'call-1/start/1/wait' as ToolWaitId
const duty = `${wait}/ensure` as ToolOperationId
/** The invalidation duty that the settlement of a suspended call writes. */
const undo = `${wait}/invalidate` as ToolOperationId
const evidence = (record: string) => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const terminal = evidence('terminal')
const card = {
  cardId: 'q1',
  kind: 'question',
  title: 'Which port?',
  description: 'Pick one.',
  options: [
    { id: 'o1', label: '8081', description: 'Free.' },
    { id: 'o2', label: '3000', description: 'Default.' },
  ],
  declineConsequence: '跳过此题，不作答',
}
/** The request original that the ledger keeps for the wait: the JSON text of the Ask request. */
const ORIGINAL = JSON.stringify({ questions: [card] })
/** The request evidence of the wait binds the digest of the original. */
const requestEvidence = { ...evidence('request'), digest: canonicalDigest(ORIGINAL) }

type Registered = Extract<CommandResult<'registerRequest'>, { kind: 'registered' }>

function world(
  options: Readonly<{
    /** The request original the call keeps; null when it keeps none. The Ask request by default. */
    kept?: string | null
    audience?: HitlAudience | undefined
    register?: CommandResult<'registerRequest'>
    /** The cards of the HITL request, as `getRequest` reads them. */
    cards?: readonly unknown[]
    consume?: (command: { decisionRef: unknown }) => unknown
    /** How the wait of the call closed; null while it is open. A control closed it by default. */
    closed?: 'cancelled' | 'terminal' | 'continued' | null
  }> = {},
) {
  const calls = {
    prepared: [] as unknown[],
    registered: [] as RegisterRequest[],
    bound: [] as Record<string, unknown>[],
    consumed: [] as Record<string, unknown>[],
    invalidated: [] as Record<string, unknown>[],
    acknowledged: [] as Record<string, unknown>[],
    /** The queries of getOperation: the binding of the operation that was asked. */
    operations: [] as unknown[],
  }
  const operationRef = {
    tenantRef: 't',
    actorRef: standingPrincipalRef(registrar),
    operationId: 'x',
  }
  const answer = (options.register ?? {
    kind: 'registered',
    operationRef,
    requestRef: { tenantRef: 't', requestId: 'request-1' },
    revision: '0',
    cards: [{ request: { tenantRef: 't', requestId: 'request-1' }, cardId: 'q1' }],
  }) as CommandResult<'registerRequest'>
  let inspected: unknown = { kind: 'unknown', operationRef }
  let invalidation: unknown = { kind: 'invalidated', affected: 1, revision: '3', operationRef }
  const request = {
    ref: { tenantRef: 't', requestId: 'request-1' },
    revision: '1',
    cards: options.cards ?? [{ ref: cardRef('q1'), kind: 'pending' }],
  }
  const application = {
    registerRequest: async (_access: unknown, command: RegisterRequest) => {
      calls.registered.push(command)
      return answer
    },
    getOperation: async (_access: unknown, query: unknown) => {
      calls.operations.push(query)
      return inspected
    },
    getRequest: async () => ({ kind: 'found', request }),
    bindReceiver: async (_access: unknown, command: Record<string, unknown>) => {
      calls.bound.push(command)
      return { kind: 'bound', receiverGeneration: '1', operationRef }
    },
    consumeDecision: async (_access: unknown, command: Record<string, unknown>) => {
      calls.consumed.push(command)
      return (
        options.consume?.(command as { decisionRef: unknown }) ?? {
          kind: 'accepted',
          operationRef,
          receipt: { decision: command['decisionRef'], outcome: 'accepted' },
        }
      )
    },
    acknowledgeDelivery: async (_access: unknown, command: Record<string, unknown>) => {
      calls.acknowledged.push(command)
      return { kind: 'acknowledged', operationRef }
    },
    invalidateWait: async (_access: unknown, command: Record<string, unknown>) => {
      calls.invalidated.push(command)
      return invalidation
    },
  }
  const host = {
    tenant: async () => ({ kind: 'ready', tenant: { domain: {}, application, destination: {} } }),
    prepare: async (_at: unknown, command: unknown) => {
      calls.prepared.push(command)
      return { kind: 'committed' }
    },
  } as unknown as ToolHitlHost
  const bridge = createToolHitlBridge({
    host: () => host,
    audience: () =>
      'audience' in options
        ? options.audience
        : () => ({ readers: [reader], responders: [reader] }),
    registrar: () => registrar,
    recoveryOf: async () =>
      succeed({
        request: {
          consumer: { owner: 'agent', work: 'exec-1', position: 'a1', purpose: 'action' },
        },
        waitRequest: options.kept === null ? null : { wait, request: options.kept ?? ORIGINAL },
        waits: [
          {
            intent: { kind: 'ask', wait, request: requestEvidence },
            ...(options.closed === null
              ? { phase: 'open' }
              : { phase: 'closed', cause: options.closed ?? 'cancelled' }),
          },
        ],
        tasks: [
          {
            kind: 'wait-registration',
            action: 'ensure',
            operation: duty,
            wait,
            evidence: requestEvidence,
          },
          {
            kind: 'wait-registration',
            action: 'invalidate',
            operation: undo,
            wait,
            evidence: terminal,
          },
        ],
      } as never),
    readWork: async () =>
      succeed({
        run: { kind: 'active', run: 'run-1', execution: { execution: 'exec-1' } },
      } as never),
  })
  const access = { principal: caller, tenant, call, operation: duty }
  return {
    bridge,
    calls,
    answer,
    ensure: () => bridge.ensure({ ...access, wait, request: requestEvidence }),
    inspect: (value: unknown, operation: ToolOperationId = duty) => {
      inspected = value
      return bridge.inspectOperation({ ...access, operation })
    },
    /** The original registration committed: inspect and resolve find it through getOperation. */
    committed: () => {
      inspected = { kind: 'committed', method: 'registerRequest', result: answer }
    },
    request,
    invalidating: (value: unknown) => {
      invalidation = value
    },
    access,
  }
}

const cardRef = (cardId: string) => ({
  request: { tenantRef: 't', requestId: 'request-1' },
  cardId,
})
const decided = (cardId: string, reply: unknown) => ({
  ref: cardRef(cardId),
  kind: 'decided',
  decision: {
    ref: {
      card: cardRef(cardId),
      decisionId: `decision-${cardId}`,
      submission: { operationId: cardId },
    },
    reply,
    basisRef: 'basis',
    commitReceipt: 'commit',
  },
})
/** The plain JSON of a decision value's tree. */
const plain = (value: JsonValue): unknown => JSON.parse(writeJsonText(value))

describe('the Tool decision owner over HITL', () => {
  it('registers the kept batch under a tool origin of the call, its session and its Run', async () => {
    const w = world()
    const answer = unwrap(await w.ensure())
    expect(answer).toMatchObject({ record: 'hitl-request/request-1', revision: '0' })
    expect(w.calls.registered).toHaveLength(1)
    const registered = w.calls.registered[0]
    expect(registered?.origin).toMatchObject({
      kind: 'tool',
      toolCallRef: call,
      sessionRef: 'session-1',
      runRef: 'run-1',
      wait: { owner: 'tool', waitId: wait },
    })
    expect(registered?.questions).toEqual([card])
    // The preparation fixes the same registration and the injected audience, with the registrar.
    expect(w.calls.prepared).toMatchObject([
      {
        kind: 'prepare',
        preparation: {
          registration: registered,
          readers: [standingPrincipalRef(registrar), reader],
          responders: [reader],
        },
      },
    ])
    // A second ensure derives the same identities: HITL recalls the original operations.
    unwrap(await w.ensure())
    expect(w.calls.registered[1]).toEqual(registered)
    expect(w.calls.prepared[1]).toEqual(w.calls.prepared[0])
  })

  it('with the release audience the tenant entry principal reads and answers, the registrar only reads', async () => {
    const given: unknown[] = []
    const w = world({
      audience: input => {
        given.push(input)
        return hitlCardAudience(input)
      },
    })
    unwrap(await w.ensure())
    // The audience gets the tenant of the call and the origin that the registration carries.
    expect(given).toEqual([{ tenant, origin: w.calls.registered[0]?.origin }])
    expect(w.calls.prepared).toMatchObject([
      {
        preparation: {
          readers: [standingPrincipalRef(registrar), hitlEntryRef(tenant)],
          responders: [hitlEntryRef(tenant)],
        },
      },
    ])
  })

  it('refuses a kept request that the request evidence of the wait does not bind, or a call that keeps none, without writing to HITL', async () => {
    for (const kept of [JSON.stringify({ questions: [] }), null]) {
      const w = world({ kept })
      expect(await w.ensure()).toMatchObject({ failure: { kind: 'invalid', field: 'request' } })
      expect(w.calls.prepared).toEqual([])
      expect(w.calls.registered).toEqual([])
    }
  })

  it('answers unavailable while no audience is installed, without writing to HITL', async () => {
    const w = world({ audience: undefined })
    expect(await w.ensure()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(w.calls.prepared).toEqual([])
  })

  it('reads a rejection by the original work guard as a definite conflict', async () => {
    const w = world({
      register: {
        kind: 'conflict',
        reason: 'guard-rejected',
        operationRef: { tenantRef: 't', actorRef: 'a', operationId: 'x' },
      } as never,
    })
    expect(await w.ensure()).toMatchObject({ failure: { kind: 'conflict', operation: duty } })
  })

  it('recalls the original registration by the duty of the call, with the evidence that ensure gave', async () => {
    const w = world()
    const given = unwrap(await w.ensure())
    const committed = await w.inspect({
      kind: 'committed',
      method: 'registerRequest',
      result: w.answer as Registered,
    })
    expect(committed).toEqual(succeed({ kind: 'committed', operation: duty, receipt: given }))
    // It asks HITL for the registration operation, not for another operation of the wait.
    const registration = hitlCommandBinding('registerRequest', w.calls.registered[0]!)
    expect(w.calls.operations[0]).toEqual({ protocol: 'hitl/1', ...registration })
    expect(unwrap(await w.inspect({ kind: 'not-committed', sealReceipt: 's' }))).toMatchObject({
      kind: 'excluded',
      operation: duty,
    })
    expect(unwrap(await w.inspect({ kind: 'unknown' }))).toMatchObject({ kind: 'unknown' })
  })

  it('inspect recalls the original registration and gives no decision while a card waits', async () => {
    const w = world()
    const given = unwrap(await w.ensure())
    w.committed()
    expect(unwrap(await w.bridge.inspect({ ...w.access, wait }))).toEqual({
      registration: given,
      decision: null,
    })
  })

  it('inspect gives the same decision evidence for the decided batch, also after the revision moved', async () => {
    const w = world({ cards: [decided('q1', { kind: 'decline' })] })
    w.committed()
    const first = unwrap(await w.bridge.inspect({ ...w.access, wait }))
    expect(first.decision).toMatchObject({ record: 'hitl-decisions/request-1', revision: '1' })
    w.request.revision = '7'
    expect(unwrap(await w.bridge.inspect({ ...w.access, wait }))).toEqual(first)
  })

  it('inspect answers unavailable while the original registration is not found', async () => {
    const w = world({ cards: [decided('q1', { kind: 'decline' })] })
    expect(await w.bridge.inspect({ ...w.access, wait })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('resolve takes the batch over in HITL and gives the answers in card order as a JSON tree', async () => {
    const w = world({
      register: {
        kind: 'registered',
        operationRef: {
          tenantRef: 't',
          actorRef: standingPrincipalRef(registrar),
          operationId: 'x',
        },
        requestRef: { tenantRef: 't', requestId: 'request-1' },
        revision: '0',
        cards: [cardRef('q1'), cardRef('q2'), cardRef('q3')],
      } as never,
      // getRequest lists the cards in another order: the order of the registration counts.
      cards: [
        decided('q3', { kind: 'decline' }),
        decided('q1', { kind: 'selection', optionId: 'o2' }),
        decided('q2', { kind: 'text', text: 'my words' }),
      ],
    })
    w.committed()
    const { decision } = unwrap(await w.bridge.inspect({ ...w.access, wait }))
    const resolved = unwrap(await w.bridge.resolve({ ...w.access, wait, decision: decision! }))
    expect(resolved.kind).toBe('answer')
    expect(plain((resolved as { value: JsonValue }).value)).toEqual({
      answers: [
        { cardId: 'q1', kind: 'selection', optionId: 'o2' },
        { cardId: 'q2', kind: 'text', text: 'my words' },
        { cardId: 'q3', kind: 'no-answer' },
      ],
    })
    // The receiver is bound from generation 0, and each card is consumed under its own identity.
    expect(w.calls.bound).toMatchObject([{ expectedGeneration: '0', waitRef: { waitId: wait } }])
    expect(w.calls.consumed.map(command => command['decisionRef'])).toEqual(
      ['q1', 'q2', 'q3'].map(id => ({
        card: cardRef(id),
        decisionId: `decision-${id}`,
        submission: { operationId: id },
      })),
    )
    const ids = w.calls.consumed.map(command => command['consumeOperationId'])
    expect(new Set(ids).size).toBe(3)
    // Each receipt is acknowledged, so the cards show the delivery as accepted.
    expect(w.calls.acknowledged.map(command => command['consumerReceipt'])).toEqual(
      w.calls.consumed.map(command => ({ decision: command['decisionRef'], outcome: 'accepted' })),
    )
    // A second resolve derives the same identities: HITL recalls the original operations.
    unwrap(await w.bridge.resolve({ ...w.access, wait, decision: decision! }))
    expect(w.calls.bound[1]).toEqual(w.calls.bound[0])
    expect(w.calls.consumed.slice(3)).toEqual(w.calls.consumed.slice(0, 3))
  })

  it('resolve gives no-answer when every card was skipped', async () => {
    const w = world({ cards: [decided('q1', { kind: 'decline' })] })
    w.committed()
    const { decision } = unwrap(await w.bridge.inspect({ ...w.access, wait }))
    expect(unwrap(await w.bridge.resolve({ ...w.access, wait, decision: decision! }))).toEqual({
      kind: 'no-answer',
    })
  })

  it('resolve refuses evidence that is not the decided batch, without taking anything over', async () => {
    const w = world({ cards: [decided('q1', { kind: 'decline' })] })
    w.committed()
    expect(
      await w.bridge.resolve({ ...w.access, wait, decision: evidence('another-batch') }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'decision' } })
    expect(w.calls.bound).toEqual([])
    expect(w.calls.consumed).toEqual([])
  })

  it('resolve does not give a decision that HITL superseded', async () => {
    const w = world({
      cards: [decided('q1', { kind: 'selection', optionId: 'o1' })],
      consume: () => ({ kind: 'superseded', operationRef: {} }),
    })
    w.committed()
    const { decision } = unwrap(await w.bridge.inspect({ ...w.access, wait }))
    expect(await w.bridge.resolve({ ...w.access, wait, decision: decision! })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('invalidate asks HITL to invalidate the wait under a derived identity, and recalls it', async () => {
    const w = world()
    const terminal = evidence('terminal')
    const cause = 'cancelled' as const
    const answer = unwrap(await w.bridge.invalidate({ ...w.access, wait, terminal, cause }))
    expect(answer).toMatchObject({ revision: '3' })
    // A wait that a control closed is invalidated as cancelled, not as the end of the original work.
    expect(w.calls.invalidated).toMatchObject([
      {
        waitRef: { owner: 'tool', waitId: wait },
        reason: 'cancelled',
        operation: { actorRef: standingPrincipalRef(registrar) },
      },
    ])
    unwrap(await w.bridge.invalidate({ ...w.access, wait, terminal, cause }))
    expect(w.calls.invalidated[1]).toEqual(w.calls.invalidated[0])
    w.invalidating({ kind: 'unknown', operationRef: {} })
    expect(await w.bridge.invalidate({ ...w.access, wait, terminal, cause })).toMatchObject({
      failure: { kind: 'commit-unknown', operation: duty },
    })
  })

  it('invalidates a wait whose original execution ended on its own as origin-terminal', async () => {
    const w = world()
    unwrap(await w.bridge.invalidate({ ...w.access, wait, terminal, cause: 'terminal' }))
    expect(w.calls.invalidated).toMatchObject([{ reason: 'origin-terminal' }])
  })

  it('recalls an invalidation with the cause the closed wait of the call names', async () => {
    const committed = {
      kind: 'committed',
      method: 'invalidateWait',
      result: { kind: 'invalidated', affected: 1, revision: '3', operationRef: {} },
    } as const
    const ended = world({ closed: 'terminal' })
    unwrap(
      await ended.bridge.invalidate({
        ...ended.access,
        operation: undo,
        wait,
        terminal,
        cause: 'terminal',
      }),
    )
    unwrap(await ended.inspect(committed, undo))
    // The recall asks for the same input as the invalidation of that cause.
    expect(ended.calls.operations).toEqual([
      {
        protocol: 'hitl/1',
        ...hitlCommandBinding('invalidateWait', ended.calls.invalidated[0] as InvalidateWait),
      },
    ])
    // A wait that is not closed by a control or a terminal has no invalidation to recall.
    for (const closed of [null, 'continued'] as const) {
      const open = world({ closed })
      expect(unwrap(await open.inspect(committed, undo))).toMatchObject({ kind: 'unknown' })
      expect(open.calls.operations).toEqual([])
    }
  })

  it('recalls an invalidation whose answer was lost as committed, with the receipt that invalidate gives', async () => {
    const w = world()
    const given = unwrap(
      await w.bridge.invalidate({
        ...w.access,
        operation: undo,
        wait,
        terminal,
        cause: 'cancelled',
      }),
    )
    const command = w.calls.invalidated[0] as InvalidateWait
    const recalled = await w.inspect(
      {
        kind: 'committed',
        method: 'invalidateWait',
        result: { kind: 'invalidated', affected: 1, revision: '3', operationRef: {} },
      },
      undo,
    )
    expect(recalled).toEqual(succeed({ kind: 'committed', operation: undo, receipt: given }))
    // It asks HITL for the original invalidation: the same operation and the same input.
    expect(w.calls.operations).toEqual([
      { protocol: 'hitl/1', ...hitlCommandBinding('invalidateWait', command) },
    ])
    // A committed registration of the same wait is not the invalidation.
    expect(
      unwrap(
        await w.inspect({ kind: 'committed', method: 'registerRequest', result: w.answer }, undo),
      ),
    ).toMatchObject({ kind: 'unknown', operation: undo })
  })

  it('recalls an invalidation that did not commit as excluded, and an unknown one as unknown', async () => {
    const w = world()
    expect(
      unwrap(await w.inspect({ kind: 'not-committed', sealReceipt: 's' }, undo)),
    ).toMatchObject({
      kind: 'excluded',
      operation: undo,
    })
    expect(unwrap(await w.inspect({ kind: 'unknown' }, undo))).toMatchObject({
      kind: 'unknown',
      operation: undo,
    })
    // Both recalls ask for the invalidation operation of the wait.
    expect(w.calls.operations).toMatchObject([
      { operationRef: { operationId: expect.stringMatching(/\/invalidate$/) } },
      { operationRef: { operationId: expect.stringMatching(/\/invalidate$/) } },
    ])
    // The recall does not write: no registration, no invalidation.
    expect(w.calls.registered).toEqual([])
    expect(w.calls.invalidated).toEqual([])
  })
})
