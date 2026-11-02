// J06 on real Cordis 4.0.4: the message admission provider of the Session log combination over the
// node:sqlite double of the storage (real participants, migrations and read handlers). What is
// checked: the invoke and submit branches bind their request through trusted facts (the session
// slot scope, the execution index and the Session snapshot) and save the intent before the
// outcome; the same Ki recalls the original H and outcome with no new write; the execution branch
// recalls the P of the Journal, answers stale-advance for a superseded advance, and a fixed outcome
// is recalled before the advance is judged; the outcome is fixed once; lookup reads and writes
// nothing; a forged scope, another tenant's scope, an execution of no Run and a denied qualification
// are refused with nothing written; another tenant does not read the record.
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeAgentExecutionId,
  decodeInputId,
  decodeActionId,
  type AgentAccessCheck,
  type ExecutionSnapshot,
  type MessageHandoff,
  type PendingHandoff,
} from '@omne-harness/agent-contract'
import {
  AgentAccessCheckService,
  agentMessageHandoffKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { decodeModelCallId } from '@omne-harness/model-contract'
import { succeed } from '@omne-harness/operation-result'
import { assistantMessage, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  decodePreadmissionRecord,
} from '@omne-harness/session-storage-sql/participants'
import { sessionScopeEvidence } from '../src/cordis/agent-drive.ts'
import { createSessionMessageHandoffPlugin } from '../src/cordis/message-handoff.ts'
import {
  evidence,
  instance,
  ok,
  operation,
  operationId,
  submitAcceptance,
} from './fixtures/common-journal.ts'
import { cordisScene, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const PROVIDER = {
  owner: '@omne-harness/session-adapters',
  name: 'session-message-handoff',
  revision: '1',
  digest: 'session-adapters:session-message-handoff/1',
}

/** The Agent access of the scene: its principal and tenant, without the session. */
const agentAccess = (s: SqlScene) => ({ principal: s.access.principal, tenant: s.access.tenant })

const scenes: SqlScene[] = []
const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const s of scenes.splice(0)) await s.close()
})

/** The scene, its Cordis root and the provider; `decision` scripts `agentAccessCheck`. */
async function provided(name: string, decision: 'allowed' | 'denied' = 'allowed') {
  const s = await sqlScene(name)
  scenes.push(s)
  const c = await cordisScene(s)
  disposers.push(() => c.dispose())
  const checked: string[] = []
  class AgentAccess extends AgentAccessCheckService<unknown> {
    readonly check: AgentAccessCheck<unknown>['check'] = input => {
      checked.push(input.operation)
      return Promise.resolve(
        decision === 'allowed'
          ? { kind: 'allowed', evidence: evidence(`agent-access/${input.operation}`) }
          : { kind: 'denied' },
      )
    }
  }
  await c.mount(AgentAccess)
  const fiber = await c.mount(
    createSessionMessageHandoffPlugin<string>({
      coordinator: async () => succeed(s.access.principal),
      principalIdentity: principal => `principal:${principal}`,
      provider: PROVIDER,
    }),
    s.combination,
  )
  const handoff = () => {
    const found = c.ctx.get(agentMessageHandoffKey)
    if (found === undefined) throw new Error('agentMessageHandoff is not provided')
    return found as MessageHandoff<string>
  }
  return { s, c, handoff, checked, fiber }
}

/** The invoke-branch prepare of the scene's initial input, with the session slot scope. */
function invoke(
  s: SqlScene,
  scope = sessionScopeEvidence(s.tenantText(s.access.tenant), s.access.session),
) {
  const request = s.openInput.original.outcome.request
  if (request.kind !== 'input') throw new Error('fixture: an external request')
  return {
    ...agentAccess(s),
    kind: 'invoke' as const,
    request,
    runtime: { ...s.openInput.runtime, scope },
  }
}

/** The submit-branch prepare of a new input into `execution`. */
function submit(s: SqlScene, execution = s.execution) {
  const value = {
    id: ok(decodeInputId('input-2')),
    content: assistantMessage('second'),
    source: evidence('input-2-source'),
    priority: 'ordinary' as const,
  }
  const request = submitAcceptance(execution, operation('submit-2'), value).outcome.request
  if (request.kind !== 'input') throw new Error('fixture: an external request')
  return { ...agentAccess(s), kind: 'submit' as const, request }
}

/** The preadmission records the storage holds, by Ki. */
async function recordOf(s: SqlScene, entry: string) {
  const read = await s.storage.read({
    domain: s.domain,
    handler: EXECUTION_RECORD_HANDLERS.preadmission,
    protocol: EXECUTION_RECORD_PROTOCOL,
    requestKey: `read-${entry}`,
    input: { tenant: s.tenantText(s.access.tenant), entry },
  })
  if (read.kind !== 'read') throw new Error('the preadmission record is not readable')
  return decodePreadmissionRecord(read.output)
}

/** The writes of the preadmission records (commits of the execution-record participant alone). */
const writes = (s: SqlScene) =>
  s.commits.filter(item => item.length === 1 && item[0] === 'execution-record').length

describe('the invoke and submit branches', () => {
  it('invoke: the intent is saved with the request, origin, principal, basis and adoption, then the prepared outcome', async () => {
    const f = await provided('handoff-invoke')
    const input = invoke(f.s)
    const outcome = ok(await f.handoff().prepare(input))
    expect(outcome.decision).toEqual({
      kind: 'prepared',
      message: input.request.entry.kind === 'invoke' ? input.request.entry.initial.content : null,
      admission: evidence('agent-access/invoke'),
    })
    expect(outcome.origin).toEqual({ kind: 'invoke', ...input.runtime })
    expect(outcome.provider).toEqual(PROVIDER)
    const record = await recordOf(
      f.s,
      JSON.stringify([f.s.execution, input.request.reference.entry]),
    )
    if (record === null || record === 'malformed') throw new Error('no record')
    expect(record.session).toBe(f.s.access.session)
    expect(record.intent).toMatchObject({
      principal: `principal:${f.s.access.principal}`,
    })
    expect(record.outcome).not.toBeNull()
    expect(f.checked).toEqual(['invoke'])
  })

  it('the same Ki again recalls the original H and outcome, and writes nothing', async () => {
    const f = await provided('handoff-recall')
    const first = ok(await f.handoff().prepare(invoke(f.s)))
    const before = writes(f.s)
    expect(ok(await f.handoff().prepare(invoke(f.s)))).toEqual(first)
    expect(writes(f.s)).toBe(before)
  })

  it('a later call through another instance recalls the original origin; it does not rewrite it', async () => {
    const f = await provided('handoff-origin')
    const first = ok(await f.handoff().prepare(invoke(f.s)))
    const later = invoke(f.s)
    const moved = { ...later, runtime: { ...later.runtime, instance: instance('instance-2') } }
    expect(ok(await f.handoff().prepare(moved))).toEqual(first)
    expect(first.origin).toMatchObject({ kind: 'invoke', instance: later.runtime.instance })
  })

  it('a forged scope and the scope of another tenant are denied, and nothing is written', async () => {
    const f = await provided('handoff-forged')
    const other = memoryOtherAccess('handoff-forged')
    const foreign = sessionScopeEvidence(f.s.tenantText(other.tenant), f.s.access.session)
    const forged = {
      ...sessionScopeEvidence(f.s.tenantText(f.s.access.tenant), f.s.access.session),
      digest: '0'.repeat(64),
    }
    for (const scope of [foreign, forged])
      expect(await f.handoff().prepare(invoke(f.s, scope))).toEqual({
        failure: { kind: 'denied', action: 'invoke' },
      })
    expect(writes(f.s)).toBe(0)
  })

  it('submit binds the original execution by the execution index; an execution of no Run is denied', async () => {
    const f = await provided('handoff-submit')
    const outcome = ok(await f.handoff().prepare(submit(f.s)))
    expect(outcome.decision.kind).toBe('prepared')
    expect(outcome.origin).toMatchObject({ kind: 'submit', delivery: { kind: 'durable-view' } })
    const before = writes(f.s)
    const never = ok(decodeAgentExecutionId('run_never/execution'))
    expect(await f.handoff().prepare(submit(f.s, never))).toEqual({
      failure: { kind: 'denied', action: 'submit' },
    })
    expect(writes(f.s)).toBe(before)
  })

  for (const branch of ['invoke', 'submit'] as const)
    it(`${branch}: an execution the index holds but no active Run holds is denied, and nothing is written`, async () => {
      const f = await provided(`handoff-ended-${branch}`)
      const snapshot = ok(await f.s.port.readWork(f.s.sessionAccess))
      if (snapshot.run.kind !== 'active') throw new Error('fixture: an active Run is expected')
      // Session ends the Run; the execution index still names the execution and the session.
      ok(
        await f.s.port.commit({
          access: f.s.sessionAccess,
          command: {
            kind: 'control',
            input: {
              tenant: f.s.access.tenant,
              session: f.s.access.session,
              operation: operationId('cancel-run'),
              intent: { kind: 'cancel-run', run: snapshot.run.run, urgency: 'force' },
            },
          },
          guards: [],
        }),
      )
      expect(ok(await f.s.port.readWork(f.s.sessionAccess)).run.kind).toBe('terminal')
      const before = writes(f.s)
      expect(await f.handoff().prepare(branch === 'invoke' ? invoke(f.s) : submit(f.s))).toEqual({
        failure: { kind: 'denied', action: branch },
      })
      // The qualification is the Session snapshot, so the access check is never asked.
      expect(f.checked).toEqual([])
      expect(writes(f.s)).toBe(before)
    })

  it('a qualification that is denied answers denied and writes nothing', async () => {
    const f = await provided('handoff-denied', 'denied')
    expect(await f.handoff().prepare(invoke(f.s))).toEqual({
      failure: { kind: 'denied', action: 'invoke' },
    })
    expect(writes(f.s)).toBe(0)
  })

  it('a malformed candidate is invalid, and nothing is written', async () => {
    const f = await provided('handoff-rejected')
    const input = submit(f.s)
    const bad = {
      ...input,
      request: {
        ...input.request,
        entry:
          input.request.entry.kind === 'submit'
            ? {
                ...input.request.entry,
                value: { ...input.request.entry.value, content: { role: 'assistant' } as never },
              }
            : input.request.entry,
      },
    }
    // The shape check of the branch already reads the candidate: a malformed one never reaches
    // the provider's records.
    expect(await f.handoff().prepare(bad)).toMatchObject({ failure: { kind: 'invalid' } })
    expect(writes(f.s)).toBe(0)
  })
})

describe('the execution branch', () => {
  async function prepared(name: string) {
    const f = await provided(name)
    const opened = ok(await f.c.journal().open(f.s.openInput))
    const loaded = ok(await f.c.journal().load({ ...agentAccess(f.s), execution: f.s.execution }))
    const request = replyRequest(f.s, loaded, 'reply-01')
    ok(
      await f.c.journal().commit({
        ...agentAccess(f.s),
        execution: f.s.execution,
        operation: operation('prepare-h'),
        authority: opened.authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, position: 'Q2', currentHandoff: request.reference },
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: { kind: 'prepare', request },
        finish: null,
      }),
    )
    return { ...f, request, advance: opened.authority }
  }

  it('the P of the Journal with the current advance is prepared, and the same call recalls it', async () => {
    const f = await prepared('handoff-p')
    const input = {
      ...agentAccess(f.s),
      kind: 'execution' as const,
      request: f.request,
      advance: f.advance,
    }
    const outcome = ok(await f.handoff().prepare(input))
    expect(outcome.decision).toMatchObject({ kind: 'prepared', message: f.request.candidate })
    expect(outcome.origin).toBeNull()
    expect(f.checked).toEqual([])
    expect(ok(await f.handoff().prepare(input))).toEqual(outcome)
  })

  it('a superseded advance is stale-advance before the outcome, and the fixed outcome is recalled before the advance afterwards', async () => {
    const f = await prepared('handoff-stale')
    const stale = { ...f.advance, executionAttachment: 'attachment-superseded' as never }
    const input = {
      ...agentAccess(f.s),
      kind: 'execution' as const,
      request: f.request,
      advance: stale,
    }
    const before = writes(f.s)
    expect(await f.handoff().prepare(input)).toEqual({ failure: { kind: 'stale-advance' } })
    expect(writes(f.s)).toBe(before)
    const fixed = ok(await f.handoff().prepare({ ...input, advance: f.advance }))
    expect(ok(await f.handoff().prepare(input))).toEqual(fixed)
  })

  it('a request that is not the P the Journal saved is invalid', async () => {
    const f = await prepared('handoff-not-p')
    const input = {
      ...agentAccess(f.s),
      kind: 'execution' as const,
      request: { ...f.request, candidate: assistantMessage('another candidate') },
      advance: f.advance,
    }
    expect(await f.handoff().prepare(input)).toMatchObject({
      failure: { kind: 'invalid', field: 'request' },
    })
  })
})

describe('lookup', () => {
  it('reads the recorded outcome, answers unknown for an entry it never saw, and writes nothing', async () => {
    const f = await provided('handoff-lookup')
    const input = invoke(f.s)
    const outcome = ok(await f.handoff().prepare(input))
    const before = writes(f.s)
    expect(
      ok(
        await f.handoff().lookup({
          ...agentAccess(f.s),
          kind: 'input-entry',
          execution: f.s.execution,
          operation: input.request.reference.entry,
        }),
      ),
    ).toEqual({ kind: 'recorded', outcome })
    expect(
      ok(
        await f.handoff().lookup({
          ...agentAccess(f.s),
          kind: 'input-entry',
          execution: f.s.execution,
          operation: operation('never'),
        }),
      ),
    ).toEqual({ kind: 'unknown', original: null })
    expect(writes(f.s)).toBe(before)
  })

  it('another tenant does not read the record of the same Ki', async () => {
    const f = await provided('handoff-other')
    const input = invoke(f.s)
    ok(await f.handoff().prepare(input))
    const other = memoryOtherAccess('handoff-other')
    const answer = await f.handoff().lookup({
      principal: other.principal,
      tenant: other.tenant,
      kind: 'input-entry',
      execution: f.s.execution,
      operation: input.request.reference.entry,
    })
    expect('ok' in answer && answer.ok.kind === 'recorded').toBe(false)
  })
})

/** The internal request of a main reply: P of the snapshot's step. */
function replyRequest(s: SqlScene, snapshot: ExecutionSnapshot, name: string): PendingHandoff {
  const call = ok(decodeModelCallId(`mcall_${'0'.repeat(20)}${name.slice(-2).padStart(2, '0')}`))
  return {
    kind: 'execution',
    reference: { kind: 'execution', execution: s.execution, operation: operation(name) },
    predecessor: snapshot.revision,
    position: { step: snapshot.checkpoint.step, node: 'I3', slot: null },
    source: {
      kind: 'model-reply',
      step: snapshot.checkpoint.step,
      action: ok(decodeActionId(`action-${name}`)),
      call,
      result: {
        producer: { kind: 'model', call },
        version: 'v1',
        delivery: null,
        source: evidence(`result/${name}`),
      },
    },
    candidate: assistantMessage(`reply ${name}`),
    originalAdvance: snapshot.executionAttachment ?? (null as never),
    predecessorHandoff: null,
  }
}
