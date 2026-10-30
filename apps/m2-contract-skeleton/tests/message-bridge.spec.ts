// The message bridge of the path as the Agent sees it through `MessageHandoff`: every H that
// `prepare` decides keeps its outcome, `lookup` reads that outcome back, and `exclude` never
// turns a fixed outcome or a request it cannot fence into an exclusion. The cases take the bridge
// that the path hands to the Agent and the calls the Agent made, then call the port directly.
import { describe, expect, it } from 'vitest'
import type { HandoffPrepare, MessageHandoff, PendingHandoff } from '@omne-harness/agent-contract'
import { decodeAgentOperationId } from '@omne-harness/agent-contract'
import { runFirstTenantPath, type PathPrincipal } from '../src/path.ts'
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

function decodeOperation(raw: string) {
  const decoded = decodeAgentOperationId(raw)
  if (!('ok' in decoded)) throw new Error(`not an Agent operation id: ${raw}`)
  return decoded.ok
}
