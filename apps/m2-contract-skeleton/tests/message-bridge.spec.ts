// The message bridge of the path as the Agent sees it through `MessageHandoff`: every H that
// `prepare` decides keeps its outcome, `lookup` reads that outcome back, and `exclude` never
// turns a fixed outcome or a request it cannot fence into an exclusion. The cases take the bridge
// that the path hands to the Agent and the calls the Agent made, then call the port directly.
import { describe, expect, it } from 'vitest'
import type { HandoffPrepare, MessageHandoff, PendingHandoff } from '@omne-harness/agent-contract'
import { decodeAgentOperationId } from '@omne-harness/agent-contract'
import type { SessionFailure } from '@omne-harness/session-contract'
import {
  evidence,
  inputId,
  operationId as sessionOperationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  emptyLog,
  messageBridge,
  roundsOf,
  runFirstTenantPath,
  PATH_SESSIONS,
  type MessageWriter,
  type PathPrincipal,
} from '../src/path.ts'
import { agentDouble, pathDependencies } from './first-path-doubles.ts'

type Prepared = Parameters<MessageHandoff<PathPrincipal>['prepare']>[0]

/** Runs the path once and keeps the bridge of the main session with every `prepare` call. */
async function bridgeOfOnePath() {
  const calls: Prepared[] = []
  let bridge: MessageHandoff<PathPrincipal> | null = null
  const agent = agentDouble()
  await runFirstTenantPath(
    pathDependencies({
      agent: async input => {
        const original = input.handoff
        bridge ??= original
        return agent({
          ...input,
          handoff: {
            ...original,
            prepare: async call => {
              if (original === bridge) calls.push(call)
              return original.prepare(call)
            },
          },
        })
      },
    }),
  )
  if (bridge === null) throw new Error('the path built no Agent')
  return { bridge: bridge as MessageHandoff<PathPrincipal>, calls }
}

const ofKind = <K extends HandoffPrepare['kind']>(calls: readonly Prepared[], kind: K) => {
  const call = calls.find(item => item.kind === kind)
  if (call === undefined) throw new Error(`the Agent made no ${kind} prepare`)
  return call as Extract<Prepared, { kind: K }>
}

describe('the message bridge (MessageHandoff of the path)', () => {
  it('answers the same outcome to a second prepare of the same H, and conflict to another request', async () => {
    const { bridge, calls } = await bridgeOfOnePath()
    const invoke = ofKind(calls, 'invoke')
    const first = await bridge.prepare(invoke)
    if (!('ok' in first)) throw new Error(JSON.stringify(first.failure))
    expect(first.ok.decision.kind).toBe('prepared')
    expect(first.ok.request).toEqual(invoke.request)
    expect(first.ok.origin).toEqual({ kind: 'invoke', ...invoke.runtime })
    expect(await bridge.prepare(invoke)).toEqual(first)

    const execution = ofKind(calls, 'execution')
    const reply = await bridge.prepare(execution)
    if (!('ok' in reply)) throw new Error(JSON.stringify(reply.failure))
    expect(reply.ok.decision.kind).toBe('prepared')
    expect(reply.ok.origin).toBeNull()

    const changed: typeof execution = {
      ...execution,
      request: {
        ...execution.request,
        position: { ...execution.request.position, slot: 'another-slot' },
      },
    }
    expect(await bridge.prepare(changed)).toEqual({
      failure: { kind: 'conflict', operation: execution.request.reference.operation },
    })
  })

  it('reads back the fixed outcome by the entry index and by the internal H, and unknown otherwise', async () => {
    const { bridge, calls } = await bridgeOfOnePath()
    const invoke = ofKind(calls, 'invoke')
    const execution = ofKind(calls, 'execution')
    const access = { principal: invoke.principal, tenant: invoke.tenant }
    const byEntry = await bridge.lookup({
      ...access,
      kind: 'input-entry',
      execution: invoke.request.reference.execution,
      operation: invoke.request.reference.entry,
    })
    expect(byEntry).toMatchObject({
      ok: { kind: 'recorded', outcome: { request: invoke.request } },
    })
    const byHandoff = await bridge.lookup({
      ...access,
      kind: 'execution',
      execution: execution.request.reference.execution,
      handoff: execution.request.reference,
    })
    expect(byHandoff).toMatchObject({
      ok: { kind: 'recorded', outcome: { request: execution.request } },
    })
    const never = await bridge.lookup({
      ...access,
      kind: 'execution',
      execution: execution.request.reference.execution,
      handoff: { ...execution.request.reference, operation: decodeOperation('never-prepared') },
    })
    expect(never).toEqual({ ok: { kind: 'unknown', original: null } })
  })

  it('keeps a fixed outcome under exclude, and does not exclude a request it never decided', async () => {
    const { bridge, calls } = await bridgeOfOnePath()
    const execution = ofKind(calls, 'execution')
    const access = { principal: execution.principal, tenant: execution.tenant }
    const control = decodeOperation('cancel-1')
    const kept = await bridge.exclude({ ...access, request: execution.request, control })
    expect(kept).toMatchObject({
      ok: { kind: 'recorded', outcome: { request: execution.request } },
    })
    const undecided: PendingHandoff = {
      ...execution.request,
      reference: { ...execution.request.reference, operation: decodeOperation('never-prepared') },
    }
    expect(await bridge.exclude({ ...access, request: undecided, control })).toEqual({
      failure: { kind: 'unsupported' },
    })
  })

  it('answers unsupported to a submit and fixes no outcome for its entry', async () => {
    const { bridge, calls } = await bridgeOfOnePath()
    const invoke = ofKind(calls, 'invoke')
    const entry = invoke.request.entry
    if (entry.kind !== 'invoke') throw new Error('the invoke prepare carries no invoke entry')
    const submitOperation = decodeOperation('submit-direct')
    const submit = {
      principal: invoke.principal,
      tenant: invoke.tenant,
      kind: 'submit',
      request: {
        ...invoke.request,
        reference: { ...invoke.request.reference, entry: submitOperation },
        entry: {
          kind: 'submit',
          operation: submitOperation,
          execution: entry.execution,
          value: entry.initial,
        },
      },
    } satisfies Prepared
    expect(await bridge.prepare(submit)).toEqual({ failure: { kind: 'unsupported' } })
    expect(
      await bridge.lookup({
        principal: invoke.principal,
        tenant: invoke.tenant,
        kind: 'input-entry',
        execution: entry.execution,
        operation: submitOperation,
      }),
    ).toEqual({ ok: { kind: 'unknown', original: null } })
  })
})

/**
 * A bridge of its own over the H of one path run: one round for the execution of those H, and a
 * Session writer that answers each `recordMessage` from `script` in turn (then commits), counts the
 * writes, and can hold the next answer until `release` is called.
 */
async function directBridge(script: (SessionFailure | 'commit')[] = []) {
  const { calls } = await bridgeOfOnePath()
  const invoke = ofKind(calls, 'invoke')
  const execution = ofKind(calls, 'execution')
  const rounds = roundsOf()
  const round = {
    sessionInput: inputId(String(invoke.request.source.input)),
    written: 0,
    log: emptyLog(),
  }
  rounds.open(String(execution.request.reference.execution), round)
  const writes: unknown[] = []
  let hold: Promise<void> | null = null
  let release = () => {}
  const writer: MessageWriter = {
    access: {
      principal: invoke.principal,
      tenant: invoke.tenant,
      session: sessionId(PATH_SESSIONS.main),
    },
    async recordMessage(input) {
      writes.push(input)
      if (hold !== null) await hold
      const next = script.shift() ?? 'commit'
      return next === 'commit'
        ? { ok: evidence(`session/message/${writes.length}`) }
        : { failure: next }
    },
  }
  const held = () => {
    hold = new Promise(resolve => {
      release = resolve
    })
  }
  return {
    bridge: messageBridge(writer, rounds),
    invoke,
    execution,
    round,
    writes,
    held,
    release: () => release(),
  }
}

describe('the message bridge decides each H once and fixes only a decided outcome', () => {
  it('a second prepare of the same H does not admit again or write the Session message again', async () => {
    const d = await directBridge()
    const first = await d.bridge.prepare(d.invoke)
    expect(await d.bridge.prepare(d.invoke)).toEqual(first)
    expect(d.round.log.admitted).toBe(1)
    const reply = await d.bridge.prepare(d.execution)
    expect(reply).toMatchObject({ ok: { decision: { kind: 'prepared' } } })
    expect(await d.bridge.prepare(d.execution)).toEqual(reply)
    expect(d.writes).toHaveLength(1)
    expect(d.round.log.replies).toBe(1)
  })

  it('an unavailable or unknown Session write answers the same class of failure and fixes nothing; the retry decides the H', async () => {
    const d = await directBridge([
      { kind: 'unavailable', owner: 'session-history', diagnostic: 'store down' },
      { kind: 'commit-unknown', operation: sessionOperationId('message') },
    ])
    expect(await d.bridge.prepare(d.execution)).toEqual({
      failure: { kind: 'unavailable', owner: 'session-history', diagnostic: 'store down' },
    })
    const access = { principal: d.execution.principal, tenant: d.execution.tenant }
    const lookup = () =>
      d.bridge.lookup({
        ...access,
        kind: 'execution',
        execution: d.execution.request.reference.execution,
        handoff: d.execution.request.reference,
      })
    expect(await lookup()).toEqual({ ok: { kind: 'unknown', original: null } })
    expect(await d.bridge.prepare(d.execution)).toEqual({
      failure: { kind: 'commit-unknown', operation: d.execution.request.reference.operation },
    })
    expect(await lookup()).toEqual({ ok: { kind: 'unknown', original: null } })
    const retried = await d.bridge.prepare(d.execution)
    expect(retried).toMatchObject({ ok: { decision: { kind: 'prepared' } } })
    expect(d.writes).toHaveLength(3)
    expect(await lookup()).toMatchObject({ ok: { kind: 'recorded' } })
  })

  it('a validation refusal of the Session write fixes the rejection', async () => {
    const d = await directBridge([{ kind: 'invalid', field: 'value', reason: 'not a message' }])
    const first = await d.bridge.prepare(d.execution)
    expect(first).toMatchObject({ ok: { decision: { kind: 'rejected' } } })
    expect(await d.bridge.prepare(d.execution)).toEqual(first)
    expect(d.writes).toHaveLength(1)
  })

  it('a prepare of an H in progress waits for it and does not write twice', async () => {
    const d = await directBridge()
    d.held()
    const first = d.bridge.prepare(d.execution)
    const second = d.bridge.prepare(d.execution)
    await Promise.resolve()
    d.release()
    const [one, two] = await Promise.all([first, second])
    expect(one).toMatchObject({ ok: { decision: { kind: 'prepared' } } })
    expect(two).toEqual(one)
    expect(d.writes).toHaveLength(1)
  })

  it('exclude of a fixed H with another request is invalid', async () => {
    const d = await directBridge()
    ok(await d.bridge.prepare(d.execution))
    const access = { principal: d.execution.principal, tenant: d.execution.tenant }
    const control = decodeOperation('cancel-1')
    const other: PendingHandoff = {
      ...d.execution.request,
      position: { ...d.execution.request.position, slot: 'another-slot' },
    }
    expect(await d.bridge.exclude({ ...access, request: other, control })).toMatchObject({
      failure: { kind: 'invalid', field: 'request' },
    })
    expect(
      await d.bridge.exclude({ ...access, request: d.execution.request, control }),
    ).toMatchObject({ ok: { kind: 'recorded' } })
  })

  it('a source this bridge does not decide is unsupported and an execution without a Session round is unavailable; neither fixes an outcome', async () => {
    const d = await directBridge()
    const source = d.execution.request.source
    if (source.kind !== 'model-reply') throw new Error('a model-reply source is expected')
    const denied: typeof d.execution = {
      ...d.execution,
      request: {
        ...d.execution.request,
        source: { kind: 'action-denied', action: source.action, evidence: evidence('denied') },
      },
    }
    expect(await d.bridge.prepare(denied)).toEqual({ failure: { kind: 'unsupported' } })
    const elsewhere = messageBridge(
      {
        access: {
          principal: d.execution.principal,
          tenant: d.execution.tenant,
          session: sessionId('elsewhere'),
        },
        recordMessage: async () => ({ ok: evidence('elsewhere') }),
      },
      roundsOf(),
    )
    expect(await elsewhere.prepare(d.execution)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'no-session-run' },
    })
    expect(d.writes).toHaveLength(0)
    expect(await d.bridge.prepare(d.execution)).toMatchObject({
      ok: { decision: { kind: 'prepared' } },
    })
  })
})

function ok<T>(outcome: Readonly<{ ok: T }> | Readonly<{ failure: unknown }>): T {
  if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}

function decodeOperation(raw: string) {
  const decoded = decodeAgentOperationId(raw)
  if (!('ok' in decoded)) throw new Error(`not an Agent operation id: ${raw}`)
  return decoded.ok
}
