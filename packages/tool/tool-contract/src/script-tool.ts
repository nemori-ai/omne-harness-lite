import {
  digestBytes,
  readBodyText,
  type JsonValue,
  type PackageLayout,
  type PackageReader,
  type PackageRejection,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export const SCRIPT_TOOL_FILE = 'tool.json'
/** What the body of a tool made from a directory names as its implementation: the script executor of the release. */
export const SCRIPT_EXECUTOR = 'script'
export const SCRIPT_MODULE = '@omne-harness/tool-definitions#scriptToolModule'

const SCRIPT_TIMEOUT_DEFAULT_MS = 60_000
const SCRIPT_TIMEOUT_MAX_MS = 600_000

const PRIMITIVES = ['string', 'number', 'integer', 'boolean'] as const
type Primitive = (typeof PRIMITIVES)[number]

export type ScriptProperty = Readonly<{
  type: Primitive | 'array'
  items?: Primitive
  description?: string
  enum?: readonly (string | number)[]
}>

export type ScriptParameters = Readonly<{
  properties: Readonly<Record<string, ScriptProperty>>
  required: readonly string[]
}>

export type ScriptConstruction = Readonly<{
  summary: string
  parameters: ScriptParameters
  run: Readonly<{ program: string; script: string; args: readonly string[] }>
  effect: 'read' | 'write'
  timeoutMs: number
}>

type Read<Value> = Outcome<Value, Readonly<{ reason: string }>>
type Plain = Readonly<Record<string, unknown>>

const said = (reason: string): Read<never> => fail({ reason })
const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const unread = (value: Plain, known: readonly string[]) =>
  Object.keys(value).find(key => !known.includes(key))

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u
const MAX_PROPERTIES = 32
const SUBSET =
  'a parameter is {type, description?, enum?} with type string, number, integer or boolean, or {type: "array", items: {type}, description?}'

function propertyOf(name: string, value: unknown): Read<ScriptProperty> {
  const at = `parameters.properties.${name}`
  if (!isPlain(value)) return said(`${at} is not an object; ${SUBSET}`)
  const extra = unread(value, ['type', 'description', 'enum', 'items'])
  if (extra !== undefined) return said(`${at} has "${extra}", which is not read; ${SUBSET}`)
  const { type, description, items } = value
  if (description !== undefined && typeof description !== 'string')
    return said(`${at}.description is not text`)
  const described = description === undefined ? {} : { description }
  if (type === 'array') {
    const of = isPlain(items) && unread(items, ['type']) === undefined ? items['type'] : undefined
    if (!PRIMITIVES.some(known => known === of) || value['enum'] !== undefined)
      return said(`${at} is an array whose items are not one plain type; ${SUBSET}`)
    return succeed({ type, items: of as Primitive, ...described })
  }
  if (!PRIMITIVES.some(known => known === type) || items !== undefined)
    return said(`${at}.type is not a type that is read; ${SUBSET}`)
  const allowed = value['enum']
  if (allowed === undefined) return succeed({ type: type as Primitive, ...described })
  const fits = (item: unknown) =>
    type === 'string' ? typeof item === 'string' : typeof item === 'number' && type !== 'boolean'
  if (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every(fits))
    return said(`${at}.enum is not a list of values of its type`)
  return succeed({ type: type as Primitive, enum: allowed as (string | number)[], ...described })
}

function parametersOf(value: unknown): Read<ScriptParameters> {
  if (!isPlain(value) || value['type'] !== 'object')
    return said('parameters is not {type: "object", properties, required?}')
  const extra = unread(value, ['type', 'properties', 'required', 'additionalProperties'])
  if (extra !== undefined) return said(`parameters has "${extra}", which is not read`)
  if (value['additionalProperties'] !== undefined && value['additionalProperties'] !== false)
    return said('parameters.additionalProperties is not false: a call gives only what is declared')
  const declared = value['properties'] ?? {}
  if (!isPlain(declared)) return said('parameters.properties is not an object')
  const names = Object.keys(declared)
  if (names.length > MAX_PROPERTIES)
    return said(`parameters has more than ${String(MAX_PROPERTIES)} properties`)
  const properties: Record<string, ScriptProperty> = {}
  for (const name of names) {
    if (!NAME.test(name)) return said(`the parameter name "${name}" is not letters, digits and _`)
    const property = propertyOf(name, declared[name])
    if (!('ok' in property)) return property
    properties[name] = property.ok
  }
  const required = value['required'] ?? []
  if (!Array.isArray(required) || !required.every(name => names.includes(name as string)))
    return said('parameters.required is not a list of declared parameter names')
  return succeed({ properties, required: required as string[] })
}

function isPackagePath(path: unknown): path is string {
  if (typeof path !== 'string' || path === '' || path.includes('\\') || path.includes('\0'))
    return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function runOf(value: unknown): Read<ScriptConstruction['run']> {
  const shape = 'run is {program, script, args?}: the program that runs it, and the script file'
  if (!isPlain(value) || unread(value, ['program', 'script', 'args']) !== undefined)
    return said(shape)
  const { program, script } = value
  const args = value['args'] ?? []
  if (typeof program !== 'string' || program === '' || /\s/u.test(program)) return said(shape)
  if (!isPackagePath(script))
    return said('run.script is not a path inside the directory of the tool')
  if (!Array.isArray(args) || !args.every(item => typeof item === 'string'))
    return said('run.args is not a list of text')
  return succeed({ program, script, args: args as string[] })
}

function timeoutOf(value: unknown): Read<number> {
  if (value === undefined) return succeed(SCRIPT_TIMEOUT_DEFAULT_MS)
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1000 &&
    value <= SCRIPT_TIMEOUT_MAX_MS
    ? succeed(value)
    : said(`timeoutMs is not a whole number from 1000 to ${String(SCRIPT_TIMEOUT_MAX_MS)}`)
}

/** What the script executor is constructed from: the fields of tool.json besides its name. */
export function readScriptConstruction(value: unknown): Read<ScriptConstruction> {
  if (!isPlain(value)) return said('the construction is not an object')
  const extra = unread(value, ['summary', 'parameters', 'run', 'effect', 'timeoutMs'])
  if (extra !== undefined) return said(`"${extra}" is not read`)
  const { summary, effect } = value
  if (typeof summary !== 'string' || summary.trim() === '' || summary.length > 2000)
    return said('summary is missing, or is not text of 1 to 2000 characters')
  if (effect !== 'read' && effect !== 'write')
    return said('effect is missing: write "read" when the script changes nothing, else "write"')
  const parameters = parametersOf(value['parameters'])
  if (!('ok' in parameters)) return parameters
  const run = runOf(value['run'])
  if (!('ok' in run)) return run
  const timeoutMs = timeoutOf(value['timeoutMs'])
  if (!('ok' in timeoutMs)) return timeoutMs
  return succeed({
    summary,
    parameters: parameters.ok,
    run: run.ok,
    effect,
    timeoutMs: timeoutMs.ok,
  })
}

function fitsType(type: Primitive, value: unknown): boolean {
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  return type === 'number' || Number.isInteger(value)
}

function argumentProblem(name: string, property: ScriptProperty, value: unknown): string | null {
  if (property.type === 'array') {
    const items = property.items ?? 'string'
    return Array.isArray(value) && value.every(item => fitsType(items, item))
      ? null
      : `${name} is not a list of ${items}`
  }
  if (!fitsType(property.type, value)) return `${name} is not ${property.type}`
  return property.enum === undefined || property.enum.includes(value as string | number)
    ? null
    : `${name} is not one of ${JSON.stringify(property.enum)}`
}

/** The arguments of one call, checked against the declared parameters: nothing undeclared, nothing required missing. */
export function checkScriptArguments(parameters: ScriptParameters, value: unknown): Read<Plain> {
  if (!isPlain(value)) return said('the arguments are not an object')
  const undeclared = Object.keys(value).find(name => parameters.properties[name] === undefined)
  if (undeclared !== undefined) return said(`${undeclared} is not a parameter of this tool`)
  const missing = parameters.required.find(name => value[name] === undefined)
  if (missing !== undefined) return said(`${missing} is required`)
  for (const [name, given] of Object.entries(value)) {
    const property = parameters.properties[name]
    const problem = property === undefined ? null : argumentProblem(name, property, given)
    if (problem !== null) return said(problem)
  }
  return succeed(value)
}

export function scriptParametersSchema(parameters: ScriptParameters): Plain {
  const properties = Object.fromEntries(
    Object.entries(parameters.properties).map(([name, property]) => [
      name,
      property.type === 'array'
        ? { type: 'array', items: { type: property.items } }
        : { type: property.type, ...(property.enum === undefined ? {} : { enum: property.enum }) },
    ]),
  )
  return { type: 'object', additionalProperties: false, required: parameters.required, properties }
}

const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const BODY_LIMITS = Object.freeze({
  maxBytes: 256 * 1024,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 8192,
  maxNumberLength: 32,
})
const invalid = (reason: string): Outcome<never, PackageRejection> =>
  fail({ kind: 'invalid-package', reason: `${SCRIPT_TOOL_FILE}: ${reason}` })

/** The body every tool has, from tool.json: its implementation is the script executor, constructed from the rest as written. */
function project(text: string, paths: readonly string[]): Outcome<JsonValue, PackageRejection> {
  let declared: unknown
  try {
    declared = JSON.parse(text)
  } catch {
    return invalid('it is not JSON')
  }
  if (!isPlain(declared)) return invalid('it is not an object')
  const { name, executor, ...rest } = declared
  if (executor !== undefined && executor !== SCRIPT_EXECUTOR)
    return invalid(
      `executor is ${JSON.stringify(executor)}; a tool made here runs a script: leave executor out`,
    )
  if (typeof name !== 'string' || !TOOL_NAME.test(name))
    return invalid('name is missing, or is not letters, digits, - and _ starting with a letter')
  const construction = readScriptConstruction(rest)
  if (!('ok' in construction)) return invalid(construction.failure.reason)
  if (!paths.includes(construction.ok.run.script))
    return invalid(
      `run.script names ${construction.ok.run.script}, which is not a file of the directory`,
    )
  const body = readBodyText(
    JSON.stringify({
      name,
      programmable: false,
      requiredCapabilities: [],
      composes: { skills: [] },
      implementation: { executor: SCRIPT_EXECUTOR, module: SCRIPT_MODULE, construction: rest },
    }),
    BODY_LIMITS,
  )
  return body.kind === 'ok' ? succeed(body.value) : invalid('it is too large or too deep to keep')
}

async function inspect(pkg: PackageReader): Promise<Outcome<JsonValue, PackageRejection>> {
  const manifest = await pkg.manifest()
  if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
  const entry = manifest.ok.entries.find(each => each.path === SCRIPT_TOOL_FILE)
  if (entry === undefined)
    return fail({
      kind: 'invalid-package',
      reason: `the directory has no ${SCRIPT_TOOL_FILE} at its root`,
    })
  const opened = await pkg.open(entry.path, entry.digest)
  if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
  if (digestBytes(opened.ok) !== entry.digest)
    return fail({ kind: 'source-failed', failure: 'material-unavailable' })
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(opened.ok)
  } catch {
    return invalid('it is not UTF-8')
  }
  return project(
    text,
    manifest.ok.entries.map(each => each.path),
  )
}

export const scriptToolLayout: PackageLayout = Object.freeze({
  namespace: 'tools',
  limits: Object.freeze({ files: 64, fileBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024 }),
  inspect,
})

/** The construction of a body the script executor implements; undefined for any other body. */
export function scriptConstructionOf(body: JsonValue): Read<ScriptConstruction> | undefined {
  const plain = JSON.parse(writeJsonText(body)) as Plain
  const implementation = plain['implementation']
  if (!isPlain(implementation) || implementation['executor'] !== SCRIPT_EXECUTOR) return undefined
  if (implementation['module'] !== SCRIPT_MODULE)
    return said('the implementation names a module that is not the script executor')
  return readScriptConstruction(implementation['construction'])
}

export const scriptToolAuthoring = [
  `A tool is a directory with ${SCRIPT_TOOL_FILE} and the script it runs. ${SCRIPT_TOOL_FILE}, whole and minimal:`,
  '{"name":"wordcount","summary":"Count the words of a text. Returns the number.","parameters":{"type":"object","properties":{"text":{"type":"string","description":"The text to count."}},"required":["text"]},"run":{"program":"python3","script":"count.py"},"effect":"read"}',
  'and count.py beside it:',
  'import json, sys',
  'print(len(json.load(sys.stdin)["text"].split()))',
  'A call starts the program with the script, in the working directory of the call. The arguments arrive as one JSON object on standard input; what the script prints on standard output is the result. Exit code 0 is success; any other is a failure, and the end of standard error is shown. Try the script with Shell before you publish: echo \'{"text":"a b"}\' | python3 count.py',
  'name is the name it is published under, the name of its directory, and the name the model calls. summary is what the model reads to decide when to call it: say what it does and what it returns.',
  `parameters: ${SUBSET}. run.args are passed after the script. timeoutMs (default ${String(SCRIPT_TIMEOUT_DEFAULT_MS)}, at most ${String(SCRIPT_TIMEOUT_MAX_MS)}) stops a script that runs too long.`,
  'effect is "read" when the script changes nothing, else "write": a stopped read is a failure, a stopped write is reported as unknown, and neither is run again.',
  'Published, it is found and called with Tools at once; an agent definition can keep it resident. Each call asks the person first unless they allowed it.',
].join('\n')
