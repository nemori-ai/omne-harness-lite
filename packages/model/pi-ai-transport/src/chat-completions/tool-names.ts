// The tool names of one request on the gateway. A tool name is the identity that the Tool domain
// gives; the gateway takes only function names of `[A-Za-z0-9_-]` up to a length. The record
// names the rule and the length, so a change of either changes the adoption. Encode maps each
// name of the request with the rule; the decoder of the same request maps a returned name back.
import type { Adoption, ToolDeclaration, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ChatMessage, WireProfile } from './vocabulary.ts'

/** Every tool name rule of the engine. */
export const TOOL_NAME_RULES = [
  'underscore/1',
] as const satisfies readonly WireProfile['toolNames']['rule'][]

/** A code point that a gateway function name cannot hold. */
const OUTSIDE = /[^A-Za-z0-9_-]/gu

/** `underscore/1`: each code point outside `[A-Za-z0-9_-]` becomes `_`. Names that fit stay as they are. */
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

/** The tool names of one request, both ways. */
export type ToolNames = Readonly<{
  /** The gateway name of a name of the request. Throws for a name that the request does not hold. */
  wire(name: string): string
  /** The request name of a gateway name. A name that no request name maps to stays as it is. */
  canonical(wire: string): string
}>

export type ToolNamesInput = Readonly<{
  profile: WireProfile['toolNames']
  tools: readonly ToolDeclaration[]
  messages: readonly ChatMessage[]
  adapter: Adoption
}>

/**
 * The names of the declared tools, in order, then the names of the model-visible tool calls of
 * the history, in message order. Each maps with the rule of the record. A name whose gateway name
 * is empty or longer than `maxLength`, or whose gateway name another name of the request already
 * has, is `unsupported`. The field is `/tools/<k>/name` or `/messages/<i>/blocks/<j>`. No name is
 * cut and no other name is changed to make room.
 */
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

/**
 * The gateway name of one declaration alone, as `binding.tools.convertToModelPayload` writes it.
 * `unsupported` (`name`) when it is empty or longer than `maxLength`.
 */
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
