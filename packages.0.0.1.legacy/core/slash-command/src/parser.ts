import type {
  CommandInvocation,
  SessionCommandSet,
  SlashCommandDefinition,
  ParameterDeclaration,
  CommandArguments,
  ParseFailure,
  ParseFailureReason,
  ParseResult,
  Span,
} from './types.ts'
import { recognize, whitespace } from './recognize.ts'
import { isCommandInvocation, isSlashCommandDefinition, judgeSlashCommand } from './judge.ts'
import { snapshot, object } from './json.ts'
import { substitute } from './template.ts'

interface Token {
  readonly text: string
  readonly at: Span
}
const explanations: Readonly<Record<ParseFailureReason, string>> = Object.freeze({
  unknown_command: 'This session has no command with this name.',
  unterminated_quote: 'The quoted argument is not closed.',
  missing_required: 'A required argument value is missing.',
  type_mismatch: 'The argument does not match its declared type.',
  unexpected_argument: 'This argument is not declared or was already provided.',
  enum_out_of_range: 'The argument is outside its declared choices.',
})
function failed(reason: ParseFailureReason, at?: Span): ParseFailure {
  if (reason !== 'missing_required') {
    if (at === undefined) throw new Error('this parsing failure requires a span')
    return Object.freeze({
      kind: 'failed',
      reason,
      at: Object.freeze({ start: at.start, end: at.end }),
      explanation: explanations[reason],
    })
  }
  return Object.freeze({
    kind: 'failed',
    reason,
    ...(at === undefined ? {} : { at: Object.freeze({ start: at.start, end: at.end }) }),
    explanation: explanations[reason],
  })
}
function tokenize(invocation: CommandInvocation): readonly Token[] | ParseFailure {
  const points = Array.from(invocation.raw)
  let i = Array.from(invocation.name).length + 1
  while (i < points.length && whitespace(points[i] ?? '')) i++
  // Ignore trailing W exactly as CommandInvocation.argumentText does.
  let limit = points.length
  while (limit > i && whitespace(points[limit - 1] ?? '')) limit--
  const tokens: Token[] = []
  while (i < limit) {
    if (whitespace(points[i] ?? '')) {
      i++
      continue
    }
    const start = i
    let text = ''
    while (i < limit && !whitespace(points[i] ?? '')) {
      const char = points[i]
      if (char === '\\') {
        if (i + 1 < limit) {
          text += points[i + 1]
          i += 2
        } else {
          text += char
          i++
        }
      } else if (char === "'" || char === '"') {
        const quote = char,
          quoteStart = i++
        let closed = false
        while (i < limit) {
          const next = points[i]
          if (next === quote) {
            closed = true
            i++
            break
          }
          if (quote === '"' && next === '\\' && (points[i + 1] === '\\' || points[i + 1] === '"')) {
            text += points[i + 1]
            i += 2
          } else {
            text += next
            i++
          }
        }
        if (!closed) return failed('unterminated_quote', { start: quoteStart, end: points.length })
      } else {
        text += char
        i++
      }
    }
    tokens.push(Object.freeze({ text, at: Object.freeze({ start, end: i }) }))
  }
  return Object.freeze(tokens)
}
function valueOf(
  parameter: ParameterDeclaration,
  text: string,
): string | number | boolean | ParseFailureReason {
  switch (parameter.kind) {
    case 'string':
      return text
    case 'enum':
      return parameter.values.includes(text) ? text : 'enum_out_of_range'
    case 'boolean':
      return text === 'true' ? true : text === 'false' ? false : 'type_mismatch'
    case 'integer': {
      if (!/^-?[0-9]+(?![\s\S])/u.test(text)) return 'type_mismatch'
      const integer = BigInt(text)
      return integer >= -9007199254740991n && integer <= 9007199254740991n
        ? Number(integer)
        : 'type_mismatch'
    }
  }
}
interface Bound {
  readonly arguments: CommandArguments
  readonly positional: readonly string[]
}
function bind(
  invocation: CommandInvocation,
  parameters: readonly ParameterDeclaration[],
): Bound | ParseFailure {
  const tokens = tokenize(invocation)
  if ('kind' in tokens) return tokens
  const positional = parameters.filter(item => item.positional === true)
  const named = parameters.filter(item => item.positional !== true)
  const values = new Map<string, string | number | boolean>()
  const texts: string[] = []
  let position = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === undefined) throw new Error('missing token')
    let parameter: ParameterDeclaration | undefined
    let text = token.text
    let at = token.at
    if (text.startsWith('--') && Array.from(text).length > 2) {
      const tail = text.slice(2),
        equals = tail.indexOf('=')
      const name = equals < 0 ? tail : tail.slice(0, equals)
      parameter = named.find(item => item.name === name)
      if (parameter === undefined || values.has(name)) return failed('unexpected_argument', at)
      if (parameter.kind === 'boolean') text = equals < 0 ? 'true' : tail.slice(equals + 1)
      else if (equals >= 0) text = tail.slice(equals + 1)
      else {
        const next = tokens[++i]
        if (next === undefined) return failed('missing_required', at)
        text = next.text
        at = next.at
      }
    } else {
      parameter = positional[position++]
      if (parameter === undefined) return failed('unexpected_argument', at)
      texts.push(text)
    }
    const value = valueOf(parameter, text)
    // Error strings may also be legitimate string/enum values, so classify by declared kind.
    if ((parameter.kind === 'integer' || parameter.kind === 'boolean') && value === 'type_mismatch')
      return failed('type_mismatch', at)
    if (parameter.kind === 'enum' && !parameter.values.includes(text))
      return failed('enum_out_of_range', at)
    values.set(parameter.name, value)
  }
  for (const parameter of parameters)
    if (parameter.required && !values.has(parameter.name)) return failed('missing_required')
  return Object.freeze({
    arguments: Object.freeze(Object.fromEntries(values)),
    positional: Object.freeze(texts),
  })
}
/** Pure expansion of a checked prompt definition; no block identity, visibility or effects. */
export function expandPrompt(
  definition: SlashCommandDefinition,
  invocation: CommandInvocation,
): Extract<ParseResult, { readonly kind: 'expanded' }> | ParseFailure {
  if (
    definition.binding.kind !== 'prompt' ||
    !isSlashCommandDefinition(definition) ||
    !isCommandInvocation(invocation)
  )
    throw new TypeError('valid prompt definition and invocation required')
  const bound =
    definition.parameters === undefined ? undefined : bind(invocation, definition.parameters)
  if (bound !== undefined && 'kind' in bound) return bound
  return Object.freeze({
    kind: 'expanded',
    text: substitute(
      definition.binding.template,
      invocation.argumentText,
      bound?.positional ?? [],
      definition.parameters !== undefined,
    ),
  })
}
/** Preconditions: valid invocation, unique own names and checked command definitions supplied by the registry. */
export function parseInvocation(
  invocation: CommandInvocation,
  commandSet: SessionCommandSet,
): ParseResult {
  const capturedInvocation = snapshot(invocation)
  const capturedSet = snapshot(commandSet)
  if (!isCommandInvocation(capturedInvocation) || !object(capturedSet))
    throw new TypeError('valid invocation and command set required')
  for (const [name, definition] of Object.entries(capturedSet)) {
    if (
      !isSlashCommandDefinition(definition) ||
      'rejected' in
        judgeSlashCommand(definition, {
          capabilityName: name,
          origin: definition.binding.kind === 'command' ? 'official' : 'customized',
        })
    )
      throw new TypeError('command set contains an invalid definition')
  }
  if (!Object.hasOwn(capturedSet, capturedInvocation.name))
    return failed('unknown_command', capturedInvocation.span)
  const definition = capturedSet[capturedInvocation.name]
  if (!isSlashCommandDefinition(definition))
    throw new Error('checked command set lost its definition')
  if (definition.binding.kind === 'prompt') return expandPrompt(definition, capturedInvocation)
  const bound =
    definition.parameters === undefined
      ? undefined
      : bind(capturedInvocation, definition.parameters)
  if (bound !== undefined && 'kind' in bound) return bound
  if (definition.binding.kind === 'skill')
    return Object.freeze({
      kind: 'skill',
      skill: Object.freeze({ category: 'skill', name: definition.binding.skill.name }),
    })
  return Object.freeze({
    kind: 'command',
    service: definition.binding.service,
    ...(bound === undefined ? {} : { arguments: bound.arguments }),
  })
}
