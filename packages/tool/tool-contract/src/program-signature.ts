import { isProgramEntry } from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { ToolDefinition, ToolProgramAccess, ToolReturnDeclaration } from './definitions.ts'

/** The class of the error a program sees for a call that did not complete. No tool takes this name. */
export const PROGRAM_FAILURE = 'ToolError'

export type ProgramFunction = Readonly<{
  /** `Tool.command`, or `Tool` for a function tool: what the program writes. */
  entry: string
  tool: string
  command: string | null
  summary: string
  unless: readonly string[]
  /** `null`: the executor owns the parameters and publishes no schema. */
  parameters: JsonValue | null
  returns: ToolReturnDeclaration
  external: boolean
}>

export function isProgramName(tool: string, command?: string): boolean {
  return (
    tool !== PROGRAM_FAILURE && isProgramEntry(command === undefined ? tool : `${tool}.${command}`)
  )
}

/** The functions one definition gives a program; none unless the tool is programmable. */
export function programFunctions(definition: ToolDefinition): readonly ProgramFunction[] {
  if (definition.programmable !== true) return []
  const one = (
    command: string | null,
    summary: string,
    access: ToolProgramAccess | undefined,
    parameters: JsonValue | null,
    returns: ToolReturnDeclaration,
  ): readonly ProgramFunction[] =>
    access?.kind !== 'open'
      ? []
      : [
          {
            entry: command === null ? definition.name : `${definition.name}.${command}`,
            tool: definition.name,
            command,
            summary,
            unless: access.unless,
            parameters,
            returns,
            external: returns.program.kind === 'json' && returns.program.external,
          },
        ]
  if (definition.kind === 'function')
    return one(
      null,
      definition.description,
      definition.program,
      definition.parameters.schema,
      definition.returns,
    )
  return definition.commands.flatMap(command =>
    one(
      command.name,
      command.summary,
      command.program,
      command.parameters.kind === 'declared' ? command.parameters.value.schema : null,
      command.returns,
    ),
  )
}

const member = (schema: JsonValue, key: string): JsonValue | undefined =>
  schema.kind === 'object' ? schema.entries.find(entry => entry.key === key)?.value : undefined
const literal = (value: JsonValue): string =>
  value.kind === 'string'
    ? JSON.stringify(value.value)
    : value.kind === 'number'
      ? value.lexeme
      : value.kind === 'boolean'
        ? String(value.value)
        : value.kind === 'null'
          ? 'null'
          : 'unknown'
const key = (name: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)

function objectType(schema: JsonValue, omit: readonly string[]): string {
  const properties = member(schema, 'properties')
  const required = member(schema, 'required')
  const needed = new Set(
    required?.kind === 'array'
      ? required.items.flatMap(one => (one.kind === 'string' ? [one.value] : []))
      : [],
  )
  const fields =
    properties?.kind === 'object'
      ? properties.entries
          .filter(entry => !omit.includes(entry.key))
          .map(
            entry => `${key(entry.key)}${needed.has(entry.key) ? '' : '?'}: ${typeOf(entry.value)}`,
          )
      : []
  const extra = member(schema, 'additionalProperties')
  if (fields.length > 0) return `{ ${fields.join('; ')} }`
  return `Record<string, ${extra?.kind === 'object' ? typeOf(extra) : 'unknown'}>`
}

function namedType(name: string, schema: JsonValue): string {
  switch (name) {
    case 'string':
    case 'boolean':
    case 'null':
      return name
    case 'integer':
    case 'number':
      return 'number'
    case 'array': {
      const items = member(schema, 'items')
      const parts = items === undefined ? ['unknown'] : alternatives(items)
      return parts.length > 1 ? `(${parts.join(' | ')})[]` : `${parts.join('')}[]`
    }
    case 'object':
      return objectType(schema, [])
    default:
      return 'unknown'
  }
}

/** The alternatives of the TypeScript type of what a JSON Schema accepts, as far as a type can say it. */
function alternatives(schema: JsonValue): readonly string[] {
  const choices = member(schema, 'enum')
  const fixed = member(schema, 'const')
  const any = member(schema, 'anyOf') ?? member(schema, 'oneOf')
  const type = member(schema, 'type')
  const parts =
    choices?.kind === 'array'
      ? choices.items.map(literal)
      : fixed !== undefined
        ? [literal(fixed)]
        : any?.kind === 'array'
          ? any.items.flatMap(alternatives)
          : type?.kind === 'string'
            ? [namedType(type.value, schema)]
            : type?.kind === 'array'
              ? type.items.map(one =>
                  one.kind === 'string' ? namedType(one.value, schema) : 'unknown',
                )
              : [member(schema, 'properties') === undefined ? 'unknown' : objectType(schema, [])]
  return parts.length === 0 ? ['never'] : [...new Set(parts)]
}
const typeOf = (schema: JsonValue) => alternatives(schema).join(' | ')

function callOf(one: ProgramFunction): string {
  const params =
    one.parameters === null ? 'Record<string, unknown>' : objectType(one.parameters, one.unless)
  const program = one.returns.program
  const value = program.kind === 'json' ? typeOf(program.definition.schema) : 'void'
  return `(params: ${params}): Promise<${value}>`
}

/** The TypeScript declaration of what a program may call on one definition; empty when it may call nothing. */
export function programSignature(definition: ToolDefinition): string {
  const functions = programFunctions(definition)
  const [only] = functions
  if (only === undefined) return ''
  const doc = (text: string) => `/** ${text.replaceAll('*/', '* /').replaceAll(/\s+/g, ' ')} */`
  if (only.command === null)
    return `${doc(only.summary)}\ndeclare function ${only.tool}${callOf(only)}`
  const lines = functions.flatMap(one => [
    `  ${doc(one.summary)}`,
    `  ${one.command ?? ''}${callOf(one)}`,
  ])
  return [`declare const ${definition.name}: {`, ...lines, '}'].join('\n')
}
