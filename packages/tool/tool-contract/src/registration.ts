// Author registration (P13 multi-command): operation handles and the definitions they project.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ToolAuthor,
  ToolImplementation,
  ToolImplementationDeclaration,
  ToolOperation,
  ToolOperationParameters,
  ToolOperationSpec,
} from './authoring.ts'
import type {
  ToolImplementationFacts,
  ToolImplementationShape,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
} from './definitions.ts'
import {
  commandName,
  commandSummary,
  implementationDeclaration,
  judgeImplementationFacts,
  parameterContract,
  returnDeclaration,
} from './judge-definition.ts'
import {
  inheritedSlot,
  judgeUnknown,
  list,
  literal,
  member,
  nonBlank,
  record,
  reject,
  slot,
  variant,
  type Check,
  type Checked,
  type ShapeRejection,
} from './shape.ts'
import { adoption, sameAdoption, sameSchemaIdentity } from './value-shapes.ts'
import { isToolWaitContract, valueSchema } from './wait-contract.ts'

type Rejection = Readonly<{ field: string; reason: string }>
type AnyAuthor = ToolAuthor<unknown, unknown, unknown, ContentBlock>

const fn: Check<unknown> = (value, at) =>
  typeof value === 'function' ? succeed(value) : reject(at, 'type')

/**
 * Reads a member of an author capability. A class instance keeps its methods on its prototype,
 * so the read follows the prototype chain. It never runs a getter: an accessor is rejected.
 */
function capabilityMember(value: object, at: string, key: string): Checked<unknown> {
  const read = inheritedSlot(value, key)
  if (read.kind === 'accessor') return reject(member(at, key), 'accessor')
  // An absent member reads as undefined, which the member check rejects as `type`.
  return succeed(read.kind === 'value' ? read.value : undefined)
}

/**
 * An author capability such as an executor or a codec. It may be a class instance, so its
 * methods may come from its prototype. The reference is kept, not copied.
 */
function capability(...methods: readonly string[]): Check<unknown> {
  return (value, at) => {
    if (typeof value !== 'object' || value === null) return reject(at, 'type')
    for (const method of methods) {
      const read = capabilityMember(value, at, method)
      if ('failure' in read) return read
      if (typeof read.ok !== 'function') return reject(member(at, method), 'type')
    }
    return succeed(value)
  }
}

/** A capability that also names its exact adoption, such as a codec or a return check. */
function adopted(check: Check<unknown>): Check<unknown> {
  return (value, at) => {
    const checked = check(value, at)
    if ('failure' in checked) return checked
    // `check` accepted an object, so the adoption can be read from it.
    const read = capabilityMember(value as object, at, 'adoption')
    if ('failure' in read) return read
    const named = adoption(read.ok, member(at, 'adoption'))
    return 'failure' in named ? named : checked
  }
}

const waitHandle: Check<unknown> = (value, at) =>
  isToolWaitContract(value) ? succeed(value) : reject(at, 'type')

const authorCommon = {
  parameters: adopted(capability('parse')),
  waits: list(waitHandle),
  executor: capability('execute'),
  codec: adopted(capability('encode', 'decode')),
  output: adopted(capability('check')),
}

const author: Check<unknown> = variant('kind', {
  ordinary: record({
    ...authorCommon,
    kind: literal('ordinary'),
    renderer: capability('render'),
    program: variant('kind', {
      none: record({ kind: literal('none') }),
      json: record({ kind: literal('json'), adoption, schema: valueSchema, encode: fn }),
    }),
  }),
  structured: record({
    ...authorCommon,
    kind: literal('structured'),
    program: variant('kind', {
      none: record({ kind: literal('none') }),
      json: record({ kind: literal('json'), adoption, schema: valueSchema }),
    }),
  }),
})

const operationParameters: Check<ToolOperationParameters> = variant('kind', {
  declared: record({ kind: literal('declared'), value: parameterContract }),
  'executor-owned': record({
    kind: literal('executor-owned'),
    usage: nonBlank,
    protocol: adoption,
  }),
})

const operationSpec = record({
  parameters: operationParameters,
  returns: returnDeclaration,
  author,
})

type Program = AnyAuthor['program']

/** P13: the program contract of the author matches the declared program of the operation. */
function programMismatch(
  declared: ToolProgramDeclaration,
  program: Program,
): ShapeRejection | undefined {
  if (declared.kind !== program.kind)
    return { field: 'author.program.kind', reason: 'program-mismatch' }
  if (declared.kind === 'none' || program.kind === 'none') return undefined
  if (!sameAdoption(declared.contract, program.adoption))
    return { field: 'author.program.adoption', reason: 'program-mismatch' }
  if (!sameSchemaIdentity(declared.schema, program.schema.identity))
    return { field: 'author.program.schema.identity', reason: 'program-mismatch' }
  if (declared.maxBytes !== program.schema.maxBytes)
    return { field: 'author.program.schema.maxBytes', reason: 'program-mismatch' }
  return undefined
}

type OperationRule = (
  spec: Readonly<{ returns: ToolReturnDeclaration; author: AnyAuthor }>,
) => ShapeRejection | undefined

/** Agreement between the declaration and the author that a type check cannot prove at run time. */
const OPERATION_RULES: readonly OperationRule[] = [
  spec =>
    spec.returns.kind === spec.author.kind
      ? undefined
      : { field: 'author.kind', reason: 'mode-mismatch' },
  spec => programMismatch(spec.returns.program, spec.author.program),
]

/** What an operation handle keeps for the binding: the author and the checked declarations. */
export type ToolOperationSlot = Readonly<{
  author: AnyAuthor
  parameters: ToolOperationParameters
  returns: ToolReturnDeclaration
}>
/** What a registration keeps for the binding: one operation, or one per command name. */
export type ToolRegistrationSlot =
  | Readonly<{ kind: 'function'; operation: ToolOperationSlot }>
  | Readonly<{ kind: 'commands'; operations: readonly (readonly [string, ToolOperationSlot])[] }>

const operationMark: unique symbol = Symbol('tool-operation')
const registrationMark: unique symbol = Symbol('tool-author-registration')

function marked<T extends object>(value: T, mark: symbol, content: unknown): T {
  Object.defineProperty(value, mark, { value: content })
  return Object.freeze(value)
}

function readMark(value: unknown, mark: symbol): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  const read = slot(value, mark)
  return read.kind === 'value' ? read.value : undefined
}

/** The slot of a handle that `defineToolOperation` made, or undefined for any other value. */
export function readToolOperation(value: unknown): ToolOperationSlot | undefined {
  // Only this module writes the mark, and it always writes a ToolOperationSlot.
  return readMark(value, operationMark) as ToolOperationSlot | undefined
}

/** The slot of an implementation that this module made. The binding provider reads it (G7). */
export function readToolRegistration(value: unknown): ToolRegistrationSlot | undefined {
  // Only this module writes the mark, and it always writes a ToolRegistrationSlot.
  return readMark(value, registrationMark) as ToolRegistrationSlot | undefined
}

const operationHandle: Check<ToolOperationSlot> = (value, at) => {
  const read = readToolOperation(value)
  return read === undefined ? reject(at, 'type') : succeed(read)
}

/**
 * Wraps one author with its parameter and return declarations (P13). It checks the shapes, that
 * the return mode of the declaration is the kind of the author, and that the program contracts
 * agree. It loads no schema, starts nothing and grants no permission. The handle hides the
 * executor.
 */
export function defineToolOperation<
  A,
  R,
  E,
  B extends ContentBlock,
  P extends ToolOperationParameters,
>(input: ToolOperationSpec<A, R, E, B, P>): Outcome<ToolOperation<E, B, P>, Rejection> {
  const checked = judgeUnknown(operationSpec, input, 'input')
  if ('failure' in checked) return checked
  // The author passed the closed check of its kind above.
  const spec = { ...checked.ok, author: checked.ok.author as AnyAuthor }
  const broken = OPERATION_RULES.map(rule => rule(spec)).find(failure => failure !== undefined)
  if (broken !== undefined) return fail(broken)
  const handle = marked(
    { parameters: spec.parameters, returns: spec.returns },
    operationMark,
    Object.freeze(spec),
  )
  // The mark holds the author; the phantom brand of ToolOperation has no run-time value.
  return succeed(handle as unknown as ToolOperation<E, B, P>)
}

/**
 * Builds the implementation from the checked declaration and the projected shape. The facts pass
 * the closed judgment once more as a whole, so a projection this module could get wrong is caught
 * here and not at the loader.
 */
function implement<E, B extends ContentBlock>(
  declaration: ToolImplementationDeclaration,
  implementsShape: ToolImplementationShape,
  content: ToolRegistrationSlot,
): Outcome<ToolImplementation<E, B>, Rejection> {
  const facts: ToolImplementationFacts = { ...declaration, implements: implementsShape }
  const judged = judgeImplementationFacts(facts)
  if ('failure' in judged) return judged
  const implementation = marked({ facts: judged.ok }, registrationMark, Object.freeze(content))
  // The mark holds the operations; the phantom brand of the implementation has no run-time value.
  return succeed(implementation as unknown as ToolImplementation<E, B>)
}

/**
 * Defines a function tool from one operation with declared parameters (P13). The input carries
 * implementation-side fields only: the name, the adoption and the governance come from the asset
 * when the loader derives the definition.
 */
export function defineFunctionTool<E, B extends ContentBlock>(
  input: Readonly<{
    implementation: ToolImplementationDeclaration
    operation: ToolOperation<E, B, Extract<ToolOperationParameters, { kind: 'declared' }>>
  }>,
): Outcome<ToolImplementation<E, B>, Rejection> {
  const checked = judgeUnknown(
    record({ implementation: implementationDeclaration, operation: operationHandle }),
    input,
    'input',
  )
  if ('failure' in checked) return checked
  const { implementation, operation } = checked.ok
  if (operation.parameters.kind !== 'declared')
    return reject('operation.parameters.kind', 'executor-owned')
  return implement(
    implementation,
    { kind: 'function', parameters: operation.parameters.value, returns: operation.returns },
    { kind: 'function', operation },
  )
}

const commandEntry = record({ summary: commandSummary, operation: operationHandle })
type CommandEntry = readonly [string, Readonly<{ summary: string; operation: ToolOperationSlot }>]

/**
 * The command table. Its own keys are the only source of command names; the prototype chain is
 * not read. An empty table, an illegal name or a symbol key is rejected.
 */
const commandTable: Check<readonly CommandEntry[]> = (value, at) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return reject(at, 'type')
  const keys = Reflect.ownKeys(value)
  if (keys.length === 0) return reject(at, 'empty')
  const entries: CommandEntry[] = []
  for (const key of keys) {
    if (typeof key !== 'string') return reject(member(at, String(key)), 'unknown-field')
    const field = `${at}[${JSON.stringify(key)}]`
    const name = commandName(key, field)
    if ('failure' in name) return name
    const read = slot(value, key)
    if (read.kind !== 'value') return reject(field, 'accessor')
    const entry = commandEntry(read.value, field)
    if ('failure' in entry) return entry
    entries.push([name.ok, entry.ok])
  }
  return succeed(entries)
}

/** Defines a multi-command tool. Each command keeps its own operation and return mode (P13). */
export function defineCommandTool<E, B extends ContentBlock>(
  input: Readonly<{
    implementation: ToolImplementationDeclaration
    commands: Readonly<
      Record<string, Readonly<{ summary: string; operation: ToolOperation<E, B> }>>
    >
  }>,
): Outcome<ToolImplementation<E, B>, Rejection> {
  const checked = judgeUnknown(
    record({ implementation: implementationDeclaration, commands: commandTable }),
    input,
    'input',
  )
  if ('failure' in checked) return checked
  const { implementation, commands } = checked.ok
  return implement(
    implementation,
    {
      kind: 'commands',
      commands: commands.map(([name, { summary, operation }]) => ({
        name,
        summary,
        parameters:
          operation.parameters.kind === 'declared'
            ? { kind: 'declared', value: operation.parameters.value }
            : { kind: 'executor-owned' },
        returns: operation.returns,
      })),
    },
    {
      kind: 'commands',
      operations: commands.map(([name, { operation }]) => [name, operation] as const),
    },
  )
}
