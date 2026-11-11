import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolFailure, ToolStartRecord } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type {
  PreparationRecord,
  ToolLiveExecution,
  ToolRecovery,
  ToolStartLookup,
} from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { tenantKey } from './boundary.ts'

type Invocation =
  | Readonly<{ kind: 'port-failed'; failure: ToolFailure }>
  | Readonly<{ kind: 'binding-failed' }>
  | Readonly<{ kind: 'binding-threw' }>
  | Readonly<{ kind: 'live' }>

export function createBindingInvoker<P, B extends ContentBlock, E>(
  { authority, bindings }: Pick<ToolDependencies<P, B, E>, 'authority' | 'bindings'>,
  environmentOf: (
    access: CallAccess<P>,
    preparation: PreparationRecord,
  ) => Promise<Outcome<E, ToolFailure>>,
) {
  const lives = new Map<string, ToolLiveExecution<B>>()
  const startKey = (access: CallAccess<P>, start: ToolStartRecord) =>
    JSON.stringify([tenantKey(access.tenant), access.call, start.operation])
  const invoke = async (
    step: CallAccess<P>,
    recovery: ToolRecovery<B>,
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
    const environment = await environmentOf(step, preparation)
    if ('failure' in environment) return { kind: 'port-failed', failure: environment.failure }
    const bound = binding.ok
    // A resume runs the next segment of a checkpointed author (P07); a live-only binding has none.
    if (start.kind === 'resume' && bound.kind !== 'checkpointed')
      return {
        kind: 'port-failed',
        failure: { kind: 'invalid', field: 'binding', reason: 'not-checkpointed' },
      }
    try {
      const input = { ...access, permit: permit.ok, request: recovery.request }
      const live =
        start.kind === 'start'
          ? await bound.start({ ...input, start }, environment.ok)
          : bound.kind === 'checkpointed'
            ? await bound.resume({ ...input, start }, environment.ok)
            : null
      if (live === null || 'failure' in live) return { kind: 'binding-failed' }
      lives.set(startKey(step, start), live.ok)
      return { kind: 'live' }
    } catch {
      return { kind: 'binding-threw' }
    }
  }

  const inspectBinding = async (
    step: CallAccess<P>,
    recovery: ToolRecovery<B>,
    start: ToolStartRecord,
  ): Promise<Outcome<ToolStartLookup<B>, ToolFailure>> => {
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
