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
const items = (value: JsonValue | undefined): readonly JsonValue[] | null =>
  value?.kind === 'array' ? value.items : null
const text = (value: JsonValue): string | null => (value.kind === 'string' ? value.value : null)
const LITERALS: Readonly<Record<JsonValue['kind'], (value: never) => string>> = {
  string: (value: Extract<JsonValue, { kind: 'string' }>) => JSON.stringify(value.value),
  number: (value: Extract<JsonValue, { kind: 'number' }>) => value.lexeme,
  boolean: (value: Extract<JsonValue, { kind: 'boolean' }>) => String(value.value),
  null: () => 'null',
  array: () => 'unknown',
  object: () => 'unknown',
}
const literal = (value: JsonValue): string => LITERALS[value.kind](value as never)
const key = (name: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)

function objectType(schema: JsonValue, omit: readonly string[]): string {
  const properties = member(schema, 'properties')
  const needed = new Set((items(member(schema, 'required')) ?? []).map(text))
  const fields = (properties?.kind === 'object' ? properties.entries : [])
    .filter(entry => !omit.includes(entry.key))
    .map(
      entry => `${key(entry.key)}${needed.has(entry.key) ? '' : '?'}: ${schemaType(entry.value)}`,
    )
  if (fields.length > 0) return `{ ${fields.join('; ')} }`
  const extra = member(schema, 'additionalProperties')
  return `Record<string, ${extra?.kind === 'object' ? schemaType(extra) : 'unknown'}>`
}

function arrayType(schema: JsonValue): string {
  const element = member(schema, 'items')
  const parts = element === undefined ? ['unknown'] : alternatives(element)
  return parts.length > 1 ? `(${parts.join(' | ')})[]` : `${parts.join('')}[]`
}

const NAMED: Readonly<Record<string, (schema: JsonValue) => string>> = {
  string: () => 'string',
  boolean: () => 'boolean',
  null: () => 'null',
  integer: () => 'number',
  number: () => 'number',
  array: arrayType,
  object: schema => objectType(schema, []),
}
const named = (name: JsonValue, schema: JsonValue): string =>
  (NAMED[text(name) ?? ''] ?? (() => 'unknown'))(schema)

const WAYS: readonly ((schema: JsonValue) => readonly string[] | null)[] = [
  schema => items(member(schema, 'enum'))?.map(literal) ?? null,
  schema => {
    const fixed = member(schema, 'const')
    return fixed === undefined ? null : [literal(fixed)]
  },
  schema =>
    items(member(schema, 'anyOf') ?? member(schema, 'oneOf'))?.flatMap(alternatives) ?? null,
  schema => {
    const type = member(schema, 'type')
    if (type === undefined) return null
    return (items(type) ?? [type]).map(one => named(one, schema))
  },
  schema => (member(schema, 'properties') === undefined ? null : [objectType(schema, [])]),
]

function alternatives(schema: JsonValue): readonly string[] {
  for (const way of WAYS) {
    const parts = way(schema)
    if (parts !== null) return parts.length === 0 ? ['never'] : [...new Set(parts)]
  }
  return ['unknown']
}

/** The TypeScript type of the values a JSON Schema accepts, as far as a type can say it. */
export function schemaType(schema: JsonValue): string {
  return alternatives(schema).join(' | ')
}

function callOf(one: ProgramFunction): string {
  const params =
    one.parameters === null ? 'Record<string, unknown>' : objectType(one.parameters, one.unless)
  const program = one.returns.program
  const value = program.kind === 'json' ? schemaType(program.definition.schema) : 'void'
  return `(params: ${params}): Promise<${value}>`
}

/** The TypeScript declaration of what a program may call on one definition; empty when it may call nothing. */
export function programSignature(definition: ToolDefinition): string {
  return functionsSignature(programFunctions(definition))
}

export function functionsSignature(functions: readonly ProgramFunction[]): string {
  const [only] = functions
  if (only === undefined) return ''
  const doc = (text: string) => `/** ${text.replaceAll('*/', '* /').replaceAll(/\s+/g, ' ')} */`
  if (only.command === null)
    return `${doc(only.summary)}\ndeclare function ${only.tool}${callOf(only)}`
  const lines = functions.flatMap(one => [
    `  ${doc(one.summary)}`,
    `  ${one.command ?? ''}${callOf(one)}`,
  ])
  return [`declare const ${only.tool}: {`, ...lines, '}'].join('\n')
}

export const PROGRAM_RUN_CAPABILITY = 'program.run'
export const PROGRAM_CATALOGUE_BYTES = 6144

export function isProgramExecutor(definition: ToolDefinition): boolean {
  return definition.requiredCapabilities.includes(PROGRAM_RUN_CAPABILITY)
}

const BYTES = new TextEncoder()

export function programCatalogue(
  definitions: readonly ToolDefinition[],
  maxBytes: number = PROGRAM_CATALOGUE_BYTES,
): string {
  const shown: string[] = []
  const left: string[] = []
  let used = 0
  for (const definition of definitions) {
    const signature = programSignature(definition)
    if (signature === '') continue
    const size = BYTES.encode(signature).length + 1
    if (left.length === 0 && used + size <= maxBytes) {
      shown.push(signature)
      used += size
    } else left.push(definition.name)
  }
  if (shown.length === 0 && left.length === 0) return ''
  const rest =
    left.length === 0
      ? []
      : [
          `${left.length} more ${left.length === 1 ? 'tool is' : 'tools are'} callable and not shown: ${left.join(', ')}. help with name set to one of them gives its functions.`,
        ]
  const head = shown.length === 0 ? [] : ['Functions a program can call:', ...shown]
  return [...head, ...rest].join('\n')
}

/** TL-71: why a program may not make this call, or null when it may. `given` names the arguments it gives. */
export function programCallRefusal(
  definition: ToolDefinition,
  command: string | null,
  given: readonly string[],
): string | null {
  if (definition.programmable !== true) return `${definition.name} is not open to programs`
  const open = programFunctions(definition).find(one => one.command === command)
  if (open === undefined) return `${definition.name} ${command ?? ''} is not open to programs`
  const closed = open.unless.find(name => given.includes(name))
  return closed === undefined ? null : `${open.entry} with ${closed} is not open to programs`
}
