// The staging table: the group values of the port calls in flight, keyed by tenant and candidate.
// A call stages its values before it asks Request Context and removes them when it ends. The group
// reads of every source set that agent-context registers answer from this table, so Request
// Context reads the input of the call it serves. Internal to agent-context.
import {
  decodeGroupToken,
  type AssemblyCall,
  type CandidateRef,
  type ContextGroupSources,
  type GroupName,
  type GroupSource,
  type GroupToken,
  type SourceGroupValue,
  type SourceRead,
} from '@omne-harness/request-context-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { digest, tenantText } from './records.ts'

export type SourceGroup = Exclude<GroupName, 'identity'>
/** The value of each group for one call, or the answer its read gives instead of a value. */
export type StagedGroups<P> = { readonly [K in SourceGroup]: SourceRead<SourceGroupValue<P, K>> }

export interface Staging<P> {
  /**
   * Stages the values of one call and returns the function that removes them, or null when a call
   * with the same tenant and candidate is in flight.
   */
  stage(tenant: TenantId, candidate: CandidateRef, groups: StagedGroups<P>): (() => void) | null
  /** The group reads of a source set registered under `generation`. */
  sources(generation: string): ContextGroupSources<P>
  /** How many calls are staged now. */
  size(): number
}

function key(tenant: TenantId, candidate: CandidateRef): string | null {
  const text = tenantText(tenant)
  return text === null ? null : `${text}|${candidate}`
}

export function createStaging<P>(): Staging<P> {
  const table = new Map<string, StagedGroups<P>>()

  function staged<K extends SourceGroup>(
    group: K,
    call: AssemblyCall<P>,
  ): SourceRead<SourceGroupValue<P, K>> {
    const name = key(call.access.tenant, call.candidate)
    const groups = name === null ? undefined : table.get(name)
    if (groups === undefined) return { kind: 'unavailable', diagnostic: 'call-input-absent' }
    return groups[group]
  }

  function source<K extends SourceGroup>(group: K, generation: string): GroupSource<P, K> {
    return {
      async readCount(call): Promise<SourceRead<GroupToken>> {
        const read = staged(group, call)
        if (read.kind !== 'value') return read
        // The token covers the value and the registration generation: equal values under one
        // generation share a token, and a new generation never reuses one.
        const token = decodeGroupToken(`${group}_${generation}_${digest(read.value)}`)
        return 'failure' in token
          ? { kind: 'unavailable', diagnostic: 'group-token' }
          : { kind: 'value', value: token.ok }
      },
      async readSource(call) {
        return staged(group, call)
      },
    }
  }

  return {
    stage(tenant, candidate, groups) {
      const name = key(tenant, candidate)
      if (name === null || table.has(name)) return null
      table.set(name, groups)
      return () => {
        if (table.get(name) === groups) table.delete(name)
      }
    },
    sources(generation) {
      return {
        history: source('history', generation),
        context: source('context', generation),
        prompt: source('prompt', generation),
        model: source('model', generation),
        tools: source('tools', generation),
        control: source('control', generation),
      }
    },
    size: () => table.size,
  }
}
