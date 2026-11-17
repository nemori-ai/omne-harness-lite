import type { JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { intentFault, type CommandCall } from './command-call.ts'
import type { ParameterContract, ToolDefinition } from './definitions.ts'
import { filled, nullable, record, reject, text, type Check } from './shape.ts'

/** How a person and the model recognise a call. Fixed at admission; no decision reads it. */
export type ToolCallLabel = Readonly<{
  intent: string | null
  tool: string
  command: string | null
  preview: string
}>

/** The upper bound of the action preview in code points. */
export const PREVIEW_MAX_CHARS = 120

type CallParts = Pick<CommandCall, 'intent' | 'params'> & Readonly<{ command: string | null }>

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function parametersOf(
  definition: ToolDefinition,
  command: string | null,
): ParameterContract | null {
  if (definition.kind === 'function') return definition.parameters
  const declared = definition.commands.find(entry => entry.name === command)?.parameters
  return declared?.kind === 'declared' ? declared.value : null
}

/** The first line of the first required text parameter the call gives, cut to the bound. */
export function actionPreview(
  parameters: ParameterContract | null,
  params: CallParts['params'],
): string {
  const schema = parameters?.schema
  const required = member(schema, 'required')
  const properties = member(schema, 'properties')
  if (required?.kind !== 'array' || properties?.kind !== 'object') return ''
  for (const name of required.items) {
    if (name.kind !== 'string') continue
    if (member(member(properties, name.value), 'type')?.kind !== 'string') continue
    const given = member(params, name.value)
    if (given?.kind !== 'string') continue
    const line = given.value.split(/\r\n|[\r\n\u2028\u2029]/u)[0] ?? ''
    const points = [...line]
    return points.length > PREVIEW_MAX_CHARS
      ? `${points.slice(0, PREVIEW_MAX_CHARS - 1).join('')}…`
      : line
  }
  return ''
}

export function callLabel(definition: ToolDefinition, call: CallParts): ToolCallLabel {
  return {
    intent: call.intent,
    tool: definition.name,
    command: call.command,
    preview: actionPreview(parametersOf(definition, call.command), call.params),
  }
}

const intent: Check<string> = (value, at) => {
  const fault = intentFault(value)
  return fault === null ? succeed(value as string) : reject(at, fault)
}
const preview: Check<string> = (value, at) => {
  const checked = text(value, at)
  if ('failure' in checked) return checked
  return [...checked.ok].length > PREVIEW_MAX_CHARS ? reject(at, 'too-long') : checked
}

export const toolCallLabel: Check<ToolCallLabel> = record({
  intent: nullable(intent),
  tool: filled,
  command: nullable(filled),
  preview,
})
