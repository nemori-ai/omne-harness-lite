import type { Adoption } from '@omne-harness/agent-contract'
import type { Access, SourceRead, ToolAdoption } from '@omne-harness/request-context-contract'
import type { ToolsSource } from './translate.ts'

export type ToolAvailabilityRead = ToolAdoption['availability']

/** A null value: the tool is not offered where this request is made. */
export type ToolLookup<P> = (
  input: Readonly<{ access: Access<P>; bindings: readonly Adoption[] }>,
) => Promise<SourceRead<readonly (ToolAvailabilityRead | null)[]>>

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
    if (bindings.length === 0) return { kind: 'value', value: [] }
    let read: SourceRead<readonly (ToolAvailabilityRead | null)[]>
    try {
      read = await lookup({ access, bindings })
    } catch {
      return { kind: 'unavailable', diagnostic: 'tool-lookup-failed' }
    }
    if (read.kind !== 'value') return read
    if (read.value.length !== bindings.length)
      return { kind: 'unavailable', diagnostic: 'tool-lookup-mismatch' }
    const tools: ToolAdoption[] = []
    for (const [index, availability] of read.value.entries()) {
      if (availability === null) continue
      const binding = bindings[index]!
      if (availability.definition.name !== binding.name)
        return { kind: 'unavailable', diagnostic: `tool-binding-mismatch: ${binding.name}` }
      tools.push({ resident: true, availability, binding })
    }
    return { kind: 'value', value: tools }
  }
}
