import type { ContentBlock } from '@omne-harness/content-block'
import {
  encodeToolInvocationRef,
  type Access,
  type ToolInvokeOutcome,
} from '@omne-harness/tool-contract'
import type {
  ToolForwardRuntime,
  ToolForwardSource,
  ToolForwardSourceOutcome,
} from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { admitResolvedInvocation } from './runtime-admission.ts'

export function createToolForwardRuntime<P, B extends ContentBlock, E>(
  dependencies: Pick<ToolDependencies<P, B, E>, 'admissions' | 'reads' | 'instances'>,
  source: ToolForwardSource<P>,
): ToolForwardRuntime<P> {
  const admit = async (
    input: Access<P>,
    bound: ToolForwardSourceOutcome,
  ): Promise<ToolInvokeOutcome> => {
    if (bound.kind === 'association-unknown' || bound.kind === 'rejected') return bound
    if (bound.kind === 'issuance-unknown') {
      const reference = encodeToolInvocationRef({
        ...input,
        call: bound.call,
        admission: bound.admission,
      })
      return 'failure' in reference
        ? { kind: 'association-unknown' }
        : { kind: 'commit-unknown', reference: reference.ok }
    }
    return admitResolvedInvocation(dependencies, { ...input, ...bound })
  }
  return {
    async invoke(input) {
      let bound: ToolForwardSourceOutcome
      try {
        bound = await source.resolve(input)
      } catch {
        return { kind: 'association-unknown' }
      }
      return admit(input, bound)
    },
    async resume(input) {
      let found: Awaited<ReturnType<typeof source.lookup>>
      try {
        found = await source.lookup(input)
      } catch {
        return { kind: 'association-unknown' }
      }
      if ('failure' in found)
        return found.failure.kind === 'commit-unknown'
          ? { kind: 'association-unknown' }
          : { kind: 'rejected', failure: found.failure }
      return found.ok.kind === 'unresolved'
        ? { kind: 'association-unknown' }
        : admit(input, { kind: 'bound', ...found.ok.binding })
    },
  }
}
