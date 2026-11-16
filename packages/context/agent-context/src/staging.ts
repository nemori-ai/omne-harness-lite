import {
  callIdentity,
  decodeGroupToken,
  type AssemblyCall,
  type ContextGroupSources,
  type GroupName,
  type GroupSource,
  type GroupToken,
  type SourceGroupValue,
  type SourceRead,
} from '@omne-harness/request-context-contract'
import { canonical, digest, tenantText } from './records.ts'

export type SourceGroup = Exclude<GroupName, 'identity'>
export type StagedGroups<P> = { readonly [K in SourceGroup]: SourceRead<SourceGroupValue<P, K>> }

export interface Staging<P> {
  stage(tenant: string, call: AssemblyCall<P>, groups: StagedGroups<P>): (() => void) | null
  sources(generation: string): ContextGroupSources<P>
  size(): number
}

function keyOf(tenant: string, call: AssemblyCall<unknown>): string {
  return `${tenant}|${canonical(callIdentity(call))}`
}

export function createStaging<P>(): Staging<P> {
  const table = new Map<string, StagedGroups<P>>()

  function staged<K extends SourceGroup>(
    group: K,
    call: AssemblyCall<P>,
  ): SourceRead<SourceGroupValue<P, K>> {
    const tenant = tenantText(call.access.tenant)
    const groups = tenant === null ? undefined : table.get(keyOf(tenant, call))
    if (groups === undefined) return { kind: 'unavailable', diagnostic: 'call-input-absent' }
    return groups[group]
  }

  function source<K extends SourceGroup>(group: K, generation: string): GroupSource<P, K> {
    return {
      async readCount(call): Promise<SourceRead<GroupToken>> {
        const read = staged(group, call)
        if (read.kind !== 'value') return read
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
    stage(tenant, call, groups) {
      const name = keyOf(tenant, call)
      if (table.has(name)) return null
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
