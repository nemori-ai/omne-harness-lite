import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { CHECKPOINT_STATE_MAX_BYTES, type CheckpointedToolExecutor } from './checkpointed-author.ts'
import type { ToolExecutor } from './execution.ts'
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
  positiveSafeInteger,
  record,
  reject,
  slot,
  variant,
  type Check,
  type Checked,
  type ShapeRejection,
} from './shape.ts'
import { COMMAND_CALL_ENCODINGS, type CommandCallEncoding } from './command-call.ts'
import { adoption, sameAdoption, sameSchemaIdentity, schemaIdentity } from './value-shapes.ts'
import {
  isToolWaitContract,
  valueSchema,
  WAIT_REQUEST_MAX_BYTES,
  WAIT_RESPONSE_MAX_BYTES,
} from './wait-contract.ts'

type Rejection = Readonly<{ field: string; reason: string }>
type AnyAuthor = ToolAuthor<unknown, unknown, unknown, ContentBlock>

const fn: Check<unknown> = (value, at) =>
  typeof value === 'function' ? succeed(value) : reject(at, 'type')

function capabilityMember(value: object, at: string, key: string): Checked<unknown> {
  const read = inheritedSlot(value, key)
  if (read.kind === 'accessor') return reject(member(at, key), 'accessor')
  return succeed(read.kind === 'value' ? read.value : undefined)
}

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

function adopted(check: Check<unknown>): Check<unknown> {
  return (value, at) => {
    const checked = check(value, at)
    if ('failure' in checked) return checked
    const read = capabilityMember(value as object, at, 'adoption')
    if ('failure' in read) return read
    const named = adoption(read.ok, member(at, 'adoption'))
    return 'failure' in named ? named : checked
  }
}

const waitHandle: Check<unknown> = (value, at) =>
  isToolWaitContract(value) ? succeed(value) : reject(at, 'type')

const checkpointMaxBytes: Check<number> = (value, at) => {
  const checked = positiveSafeInteger(value, at)
  if ('failure' in checked || checked.ok <= CHECKPOINT_STATE_MAX_BYTES) return checked
  return reject(at, 'range')
}

const checkpointDeclaration = record({
  schema: schemaIdentity,
  codec: adoption,
  maxBytes: checkpointMaxBytes,
})

const executor: Check<unknown> = (value, at) => {
  if (typeof value !== 'object' || value === null) return reject(at, 'type')
  const declared = capabilityMember(value, at, 'checkpoint')
  if ('failure' in declared) return declared
  if (declared.ok === undefined) return capability('execute')(value, at)
  const methods = capability('initial', 'resume')(value, at)
  if ('failure' in methods) return methods
  const checkpoint = checkpointDeclaration(declared.ok, member(at, 'checkpoint'))
  return 'failure' in checkpoint ? checkpoint : succeed(value)
}

const authorCommon = {
  parameters: adopted(capability('parse')),
  waits: list(waitHandle),
  executor,
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

const OPERATION_RULES: readonly OperationRule[] = [
  spec =>
    spec.returns.kind === spec.author.kind
      ? undefined
      : { field: 'author.kind', reason: 'mode-mismatch' },
  spec =>
    spec.returns.kind === 'ordinary' &&
    !sameAdoption(spec.returns.value.codec, spec.author.codec.adoption)
      ? { field: 'author.codec.adoption', reason: 'value-codec-mismatch' }
      : undefined,
  spec => programMismatch(spec.returns.program, spec.author.program),
]

type AnyCheckpointed = CheckpointedToolExecutor<unknown, unknown, unknown>

export type ToolOperationSlot = Readonly<{
  author: AnyAuthor
  parameters: ToolOperationParameters
  returns: ToolReturnDeclaration
  segments: AnyCheckpointed | null
}>

const runsInSegments: ToolExecutor<unknown, unknown, unknown> = Object.freeze({
  execute: () =>
    Promise.reject(
      new TypeError('this author runs in segments: only a checkpointed binding runs it'),
    ),
})

function isCheckpointed(value: unknown): value is AnyCheckpointed {
  return (
    typeof value === 'object' &&
    value !== null &&
    inheritedSlot(value, 'checkpoint').kind === 'value'
  )
}
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

export function readToolOperation(value: unknown): ToolOperationSlot | undefined {
  return readMark(value, operationMark) as ToolOperationSlot | undefined
}

export function readToolRegistration(value: unknown): ToolRegistrationSlot | undefined {
  return readMark(value, registrationMark) as ToolRegistrationSlot | undefined
}

const operationHandle: Check<ToolOperationSlot> = (value, at) => {
  const read = readToolOperation(value)
  return read === undefined ? reject(at, 'type') : succeed(read)
}

export function defineToolOperation<
  A,
  R,
  E,
  B extends ContentBlock,
  P extends ToolOperationParameters,
>(input: ToolOperationSpec<A, R, E, B, P>): Outcome<ToolOperation<E, B, P>, Rejection> {
  const checked = judgeUnknown(operationSpec, input, 'input')
  if ('failure' in checked) return checked
  const given = checked.ok.author as Omit<AnyAuthor, 'executor'> & Readonly<{ executor: unknown }>
  const segments = isCheckpointed(given.executor) ? given.executor : null
  const author = (segments === null ? given : { ...given, executor: runsInSegments }) as AnyAuthor
  const spec = { ...checked.ok, author }
  if (segments !== null && !given.waits.some(wait => wait.kind === 'ask'))
    return reject('input.author.waits', 'checkpointed-without-ask')
  if (
    segments !== null &&
    given.waits.some(
      wait =>
        wait.kind === 'ask' &&
        (wait.request.maxBytes > WAIT_REQUEST_MAX_BYTES ||
          wait.response.maxBytes > WAIT_RESPONSE_MAX_BYTES),
    )
  )
    return reject('input.author.waits', 'checkpointed-ask-over-bound')
  const broken = OPERATION_RULES.map(rule => rule(spec)).find(failure => failure !== undefined)
  if (broken !== undefined) return fail(broken)
  const slot: ToolOperationSlot = {
    author,
    parameters: spec.parameters,
    returns: spec.returns,
    segments,
  }
  const handle = marked(
    { parameters: spec.parameters, returns: spec.returns },
    operationMark,
    Object.freeze(slot),
  )
  return succeed(handle as unknown as ToolOperation<E, B, P>)
}

function implement<E, B extends ContentBlock>(
  declaration: ToolImplementationDeclaration,
  implementsShape: ToolImplementationShape,
  content: ToolRegistrationSlot,
): Outcome<ToolImplementation<E, B>, Rejection> {
  const facts: ToolImplementationFacts = { ...declaration, implements: implementsShape }
  const judged = judgeImplementationFacts(facts)
  if ('failure' in judged) return judged
  const implementation = marked({ facts: judged.ok }, registrationMark, Object.freeze(content))
  return succeed(implementation as unknown as ToolImplementation<E, B>)
}

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

export function defineCommandTool<E, B extends ContentBlock>(
  input: Readonly<{
    implementation: ToolImplementationDeclaration
    encoding: CommandCallEncoding
    guide?: string
    commands: Readonly<
      Record<string, Readonly<{ summary: string; operation: ToolOperation<E, B> }>>
    >
  }>,
): Outcome<ToolImplementation<E, B>, Rejection> {
  const checked = judgeUnknown(
    record(
      {
        implementation: implementationDeclaration,
        encoding: literal(...COMMAND_CALL_ENCODINGS),
        commands: commandTable,
      },
      { guide: nonBlank },
    ),
    input,
    'input',
  )
  if ('failure' in checked) return checked
  const { implementation, encoding, guide, commands } = checked.ok
  return implement(
    implementation,
    {
      kind: 'commands',
      encoding,
      ...(guide === undefined ? {} : { guide }),
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
