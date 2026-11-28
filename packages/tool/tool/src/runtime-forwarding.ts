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
  ToolProgramRuntime,
  ToolProgramSource,
} from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { admitResolvedInvocation } from './runtime-admission.ts'

type Admitting<P, B extends ContentBlock, E> = Pick<
  ToolDependencies<P, B, E>,
  'admissions' | 'reads' | 'instances'
>

/** Hands the call a source bound to the ledger; an unknown binding stays unknown. */
async function admitBound<P, B extends ContentBlock, E>(
  dependencies: Admitting<P, B, E>,
  input: Access<P>,
  bound: ToolForwardSourceOutcome,
): Promise<ToolInvokeOutcome> {
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

/** The child call of one program position: resolved by its source, then handed to the ledger. */
export function createToolProgramRuntime<P, B extends ContentBlock, E>(
  dependencies: Admitting<P, B, E>,
  source: ToolProgramSource<P>,
): ToolProgramRuntime<P> {
  return {
    async invoke(input) {
      const bound = await source
        .resolve(input)
        .catch(() => ({ kind: 'association-unknown' as const }))
      return admitBound(dependencies, input, bound)
    },
  }
}

export function createToolForwardRuntime<P, B extends ContentBlock, E>(
  dependencies: Admitting<P, B, E>,
  source: ToolForwardSource<P>,
): ToolForwardRuntime<P> {
  const admit = (input: Access<P>, bound: ToolForwardSourceOutcome) =>
    admitBound(dependencies, input, bound)
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
    presented(parent) {
      source.presented?.(parent)
    },
  }
}
