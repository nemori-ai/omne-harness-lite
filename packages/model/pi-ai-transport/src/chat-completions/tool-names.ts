import type { Adoption, ToolDeclaration, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ChatMessage, WireProfile } from './vocabulary.ts'

export const TOOL_NAME_RULES = [
  'underscore/1',
] as const satisfies readonly WireProfile['toolNames']['rule'][]

const OUTSIDE = /[^A-Za-z0-9_-]/gu

export function wireToolName(rule: WireProfile['toolNames']['rule'], name: string): string {
  switch (rule) {
    case 'underscore/1':
      return name.replace(OUTSIDE, '_')
    default: {
      const _exhaustive: never = rule
      return _exhaustive
    }
  }
}

export type ToolNames = Readonly<{
  wire(name: string): string
  canonical(wire: string): string
}>

export type ToolNamesInput = Readonly<{
  profile: WireProfile['toolNames']
  tools: readonly ToolDeclaration[]
  messages: readonly ChatMessage[]
  adapter: Adoption
}>

export function toolNamesOf(input: ToolNamesInput): Outcome<ToolNames, TransportFailure> {
  const forward = new Map<string, string>()
  const back = new Map<string, string>()
  const take = (name: string, field: string): TransportFailure | null => {
    const known = forward.get(name)
    if (known !== undefined) return null
    const wire = wireToolName(input.profile.rule, name)
    const taken = back.get(wire)
    if (wire.length === 0 || wire.length > input.profile.maxLength || taken !== undefined)
      return { kind: 'unsupported', field, adapter: input.adapter }
    forward.set(name, wire)
    back.set(wire, name)
    return null
  }
  for (const [index, tool] of input.tools.entries()) {
    const failure = take(tool.name, `/tools/${index}/name`)
    if (failure !== null) return { failure }
  }
  for (const [index, message] of input.messages.entries()) {
    if (message.role !== 'assistant') continue
    for (const [offset, block] of message.blocks.entries()) {
      if (!block.visibility.toModel) continue
      if (block.kind !== 'tool_call' && block.kind !== 'tool_call_unparsed') continue
      const failure = take(block.name, `/messages/${index}/blocks/${offset}`)
      if (failure !== null) return { failure }
    }
  }
  return {
    ok: Object.freeze({
      wire(name: string): string {
        const wire = forward.get(name)
        if (wire === undefined) throw new Error('the tool name is not a name of this request')
        return wire
      },
      canonical: (wire: string): string => back.get(wire) ?? wire,
    }),
  }
}

export function declarationName(
  profile: WireProfile['toolNames'],
  name: string,
  adapter: Adoption,
): Outcome<string, TransportFailure> {
  const wire = wireToolName(profile.rule, name)
  if (wire.length === 0 || wire.length > profile.maxLength)
    return { failure: { kind: 'unsupported', field: 'name', adapter } }
  return { ok: wire }
}
