import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolLedgerStore } from '@omne-harness/tool'
import type {
  Access,
  Reply,
  ToolAvailability,
  ToolAvailabilityReference,
  ToolDefiniteFailure,
  ToolDefinition,
} from '@omne-harness/tool-contract'
import { namesDefinition, toolAvailabilityOf } from '@omne-harness/tool-contract/provider'

export type LocalCurrentDefinitions<P> = Readonly<{
  current(input: Access<P> & Readonly<{ name: string }>): Reply<ToolDefinition | null>
}>

export type ResolveDefinition<P> = (
  access: Access<P>,
  reference: ToolAvailabilityReference,
) => Promise<Outcome<ToolAvailability, ToolDefiniteFailure>>

const UNKNOWN_TOOL: ToolDefiniteFailure = {
  kind: 'invalid',
  field: 'name',
  reason: 'unknown-tool',
}

const THROWN = 'threw an exception; its message is not reported'

export function createDefinitionResolution<P>(
  store: ToolLedgerStore,
  definitions: LocalCurrentDefinitions<P>,
): ResolveDefinition<P> {
  const stored = async (
    access: Access<P>,
    reference: ToolAvailabilityReference,
  ): Promise<Outcome<ToolDefinition | null, ToolDefiniteFailure>> => {
    try {
      const read = await store.definition(access.tenant, reference.definition)
      return read.kind === 'complete'
        ? succeed(read.definition)
        : fail({ kind: 'unavailable', dependency: 'ledger-store', diagnostic: read.diagnostic })
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'ledger-store',
        diagnostic: `the store ${THROWN}`,
      })
    }
  }
  const current = async (
    access: Access<P>,
    reference: ToolAvailabilityReference,
  ): Promise<Outcome<ToolDefinition | null, ToolDefiniteFailure>> => {
    try {
      const found = await definitions.current({ ...access, name: reference.name })
      if ('ok' in found) return found
      return found.failure.kind === 'commit-unknown'
        ? fail({ kind: 'unavailable', dependency: 'tool-catalog', diagnostic: 'no answer' })
        : fail(found.failure)
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'tool-catalog',
        diagnostic: `the catalog ${THROWN}`,
      })
    }
  }
  return async (access, reference) => {
    const kept = await stored(access, reference)
    if ('failure' in kept) return kept
    if (kept.ok !== null && namesDefinition(reference, kept.ok))
      return succeed(toolAvailabilityOf(reference, kept.ok))
    const listed = await current(access, reference)
    if ('failure' in listed) return listed
    return listed.ok !== null && namesDefinition(reference, listed.ok)
      ? succeed(toolAvailabilityOf(reference, listed.ok))
      : fail(UNKNOWN_TOOL)
  }
}
