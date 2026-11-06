import type { ContentBlock } from '@omne-harness/content-block'
import {
  encodeToolInvocationRef,
  type Access,
  type FixedToolRequest,
  type ToolCallId,
  type ToolOperationId,
  type ToolInvokeOutcome,
} from '@omne-harness/tool-contract'
import type { CallAccess, ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'

export async function scheduleAcceptedCallBestEffort<P>(
  host: ToolInstanceHost<P>,
  tenant: CallAccess<P>['tenant'],
  call: ToolCallId,
): Promise<void> {
  try {
    await host.schedule({ tenant, call })
  } catch {}
}

/** Admission shared by ordinary invocation and provider-only source forwarding. */
export async function admitResolvedInvocation<P, B extends ContentBlock, E>(
  dependencies: Pick<ToolDependencies<P, B, E>, 'admissions' | 'reads' | 'instances'>,
  input: Access<P> &
    Readonly<{
      call: ToolCallId
      admission: ToolOperationId
      request: FixedToolRequest
      recovered: boolean
    }>,
): Promise<ToolInvokeOutcome> {
  const { admissions, reads, instances } = dependencies
  const { principal, tenant, call, admission, request, recovered } = input
  const encoded = encodeToolInvocationRef({ tenant, call, admission })
  if ('failure' in encoded) return { kind: 'association-unknown' }
  const reference = encoded.ok
  let admitted: Awaited<ReturnType<typeof admissions.admit>>
  try {
    admitted = await admissions.admit({
      principal,
      tenant,
      call,
      operation: admission,
      request,
    })
  } catch {
    return { kind: 'commit-unknown', reference }
  }
  if ('failure' in admitted)
    return admitted.failure.kind === 'commit-unknown'
      ? { kind: 'commit-unknown', reference }
      : { kind: 'rejected', failure: admitted.failure }
  if (admitted.ok.state.phase === 'accepted') {
    let needsWake = true
    if (admitted.ok.recovered) {
      try {
        const current = await reads.lookup({
          principal,
          tenant,
          call,
          admission,
        })
        if ('ok' in current && current.ok.kind === 'found')
          needsWake = ['accepted', 'preparing', 'queued', 'starting'].includes(
            current.ok.state.phase,
          )
      } catch {}
    }
    if (needsWake) await scheduleAcceptedCallBestEffort(instances, tenant, call)
  }
  return {
    kind: 'accepted',
    reference,
    state: admitted.ok.state,
    recovered: recovered || admitted.ok.recovered,
  }
}
