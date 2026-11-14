import type { Adoption } from '@omne-harness/agent-contract'
import type { Access, SourceRead, ToolAdoption } from '@omne-harness/request-context-contract'
import type { ToolsSource } from './translate.ts'

export type ToolAvailabilityRead = ToolAdoption['availability']

export type ToolLookup<P> = (
  input: Readonly<{ access: Access<P>; binding: Adoption }>,
) => Promise<SourceRead<ToolAvailabilityRead>>

export const absentToolLookup: ToolLookup<unknown> = async () => ({
  kind: 'unavailable',
  diagnostic: 'tool-lookup-absent',
})

export function toolsSourceOf<P>(lookup: ToolLookup<P>): ToolsSource<P> {
  return async ({ access, conditions }) => {
    if (conditions === null) return { kind: 'unavailable', diagnostic: 'tools-source-absent' }
    const { bindings } = conditions
    const seen = new Set<string>()
    for (const binding of bindings) {
      if (seen.has(binding.name))
        return { kind: 'unavailable', diagnostic: `tool-binding-duplicate: ${binding.name}` }
      seen.add(binding.name)
    }
    const tools: ToolAdoption[] = []
    for (const binding of bindings) {
      let read: SourceRead<ToolAvailabilityRead>
      try {
        read = await lookup({ access, binding })
      } catch {
        return { kind: 'unavailable', diagnostic: 'tool-lookup-failed' }
      }
      if (read.kind !== 'value') return read
      if (read.value.definition.name !== binding.name)
        return { kind: 'unavailable', diagnostic: `tool-binding-mismatch: ${binding.name}` }
      tools.push({ resident: true, availability: read.value, binding })
    }
    return { kind: 'value', value: tools }
  }
}
