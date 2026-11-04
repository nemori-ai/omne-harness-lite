// The sixth group (tools) of the request preparation: the resident bindings of the conditions, each
// with the current availability of the tool it names (SPEC「组六」). The rule is this package's; the
// reading of one tool is the `ToolLookup` port, which the assembly implements over Tool's own read.
import type { Adoption } from '@omne-harness/agent-contract'
import type { Access, SourceRead, ToolAdoption } from '@omne-harness/request-context-contract'
import type { ToolsSource } from './translate.ts'

/** The availability of one tool, with its complete definition, as Request Context takes it. */
export type ToolAvailabilityRead = ToolAdoption['availability']

/**
 * Reads the current availability of the tool that one resident binding names. The value carries
 * the complete definition of the tool: its name, description and parameter schema. A tool that the
 * source does not know, cannot read or may not show answers without a value.
 */
export type ToolLookup<P> = (
  input: Readonly<{ access: Access<P>; binding: Adoption }>,
) => Promise<SourceRead<ToolAvailabilityRead>>

/** The lookup when none was given: every tool is unreadable. */
export const absentToolLookup: ToolLookup<unknown> = async () => ({
  kind: 'unavailable',
  diagnostic: 'tool-lookup-absent',
})

/**
 * The sixth group over a lookup. Without conditions (`derive`, `resume`) the source is absent. An
 * empty set of bindings is no tool, and no lookup is made. Otherwise every binding, in order, must
 * read to the tool of the same name, and each becomes a resident tool with its binding. One binding
 * that does not read closes the whole group: no partial list, no skipped tool.
 */
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
