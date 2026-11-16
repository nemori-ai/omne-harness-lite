import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ResponseRecord, ToolFailure, ToolStartRecord } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type {
  PreparationRecord,
  ToolLiveExecution,
  ToolRecovery,
  ToolStartLookup,
} from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { tenantKey } from './boundary.ts'
import { digestOf as canonicalDigest } from './evidence.ts'

type Invocation =
  | Readonly<{ kind: 'port-failed'; failure: ToolFailure }>
  | Readonly<{ kind: 'binding-failed' }>
  | Readonly<{ kind: 'binding-unanswered'; failure: ToolFailure }>
  | Readonly<{ kind: 'binding-threw' }>
  | Readonly<{ kind: 'live' }>

function resumeInput(
  recovery: ToolRecovery,
  start: Extract<ToolStartRecord, { kind: 'resume' }>,
): Outcome<Readonly<{ state: string; response: ResponseRecord }>, ToolFailure> {
  const checkpoint = canonicalDigest(start.checkpoint)
  const kept = recovery.checkpointState
  if (kept === null || canonicalDigest(kept.payload) !== checkpoint)
    return fail({ kind: 'invalid', field: 'checkpoint', reason: 'no-kept-state' })
  const wait = recovery.waits.find(
    record => record.phase === 'responding' && canonicalDigest(record.intent.resume) === checkpoint,
  )
  if (wait?.phase !== 'responding')
    return fail({ kind: 'invalid', field: 'checkpoint', reason: 'no-responding-wait' })
  return succeed({ state: kept.state, response: wait.response })
}

const UNANSWERED: ReadonlySet<ToolFailure['kind']> = new Set(['unavailable', 'commit-unknown'])

function failedStart(failure: ToolFailure): Invocation {
  return UNANSWERED.has(failure.kind)
    ? { kind: 'binding-unanswered', failure }
    : { kind: 'binding-failed' }
}

export function createBindingInvoker<P, B extends ContentBlock, E>(
  { authority, bindings }: Pick<ToolDependencies<P, B, E>, 'authority' | 'bindings'>,
  environmentOf: (
    access: CallAccess<P>,
    recovery: ToolRecovery,
    preparation: PreparationRecord,
  ) => Promise<Outcome<E, ToolFailure>>,
) {
  const lives = new Map<string, ToolLiveExecution>()
  const startKey = (access: CallAccess<P>, start: ToolStartRecord) =>
    JSON.stringify([tenantKey(access.tenant), access.call, start.operation])
  const invoke = async (
    step: CallAccess<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
  ): Promise<Invocation> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const permit = await authority.prepare({ ...access, start, request: recovery.request })
    if ('failure' in permit) return { kind: 'port-failed', failure: permit.failure }
    const binding = await bindings.resolve({ ...access, request: recovery.request })
    if ('failure' in binding) return { kind: 'port-failed', failure: binding.failure }
    const preparation = recovery.preparations.at(-1)
    if (preparation === undefined)
      return {
        kind: 'port-failed',
        failure: { kind: 'invalid', field: 'call', reason: 'no-preparation' },
      }
    const environment = await environmentOf(step, recovery, preparation)
    if ('failure' in environment) return { kind: 'port-failed', failure: environment.failure }
    const bound = binding.ok
    if (start.kind === 'resume' && bound.kind !== 'checkpointed')
      return {
        kind: 'port-failed',
        failure: { kind: 'invalid', field: 'binding', reason: 'not-checkpointed' },
      }
    const resumed = start.kind === 'resume' ? resumeInput(recovery, start) : null
    if (resumed !== null && 'failure' in resumed)
      return { kind: 'port-failed', failure: resumed.failure }
    try {
      const input = { ...access, permit: permit.ok, request: recovery.request }
      const live =
        start.kind === 'start'
          ? await bound.start({ ...input, start }, environment.ok)
          : bound.kind === 'checkpointed' && resumed !== null
            ? await bound.resume({ ...input, start, ...resumed.ok }, environment.ok)
            : null
      if (live === null) return { kind: 'binding-failed' }
      if ('failure' in live) return failedStart(live.failure)
      lives.set(startKey(step, start), live.ok)
      return { kind: 'live' }
    } catch {
      return { kind: 'binding-threw' }
    }
  }

  const inspectBinding = async (
    step: CallAccess<P>,
    recovery: ToolRecovery,
    start: ToolStartRecord,
  ): Promise<Outcome<ToolStartLookup, ToolFailure>> => {
    const access = { principal: step.principal, tenant: step.tenant, call: step.call }
    const binding = await bindings.resolve({ ...access, request: recovery.request })
    if ('failure' in binding) return binding
    const found = await binding.ok.inspectStart({ ...access, start })
    if ('ok' in found && found.ok.kind === 'live')
      lives.set(startKey(step, start), found.ok.execution)
    return found
  }

  return {
    invoke,
    inspect: inspectBinding,
    live: (access: CallAccess<P>, start: ToolStartRecord) => lives.get(startKey(access, start)),
    recover: (access: CallAccess<P>, start: ToolStartRecord) =>
      bindings.recover({ ...access, start }),
    hasLive: (access: CallAccess<P>, start: ToolStartRecord) => lives.has(startKey(access, start)),
  }
}
