import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  Adoption,
  ParameterContract,
  ToolProgramAccess,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import {
  defineToolOperation,
  describedAdoption,
  isProgramCall,
  type ParameterCodec,
  type ToolExecutionContext,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
  type ToolProgramOutput,
} from '@omne-harness/tool-contract/provider'
import { adoption as vocabulary, tree } from './protocol.ts'
import { textBody, textReturns } from './returns.ts'
import { bounded, utf8Length } from './text.ts'

/** How one command faces a program: it gives a value of `schema`, gives none, or is closed. */
export type ProgramSide =
  | Readonly<{ kind: 'data'; schema: object; external: boolean; unless?: readonly string[] }>
  | Readonly<{ kind: 'void'; unless?: readonly string[] }>
  | Readonly<{ kind: 'closed' }>

/** What a command answers: the text a reader gets and, when the answer has one, the value a program gets. */
export type Answer = Readonly<{ text: string; data?: unknown }>

/** The most one value handed to a program may take as JSON text. */
export const PROGRAM_DATA_MAX_BYTES = 8 * 1024 * 1024

const programContract = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'program-data-json',
  revision: '1',
  changes: 'The value a command gives a program, as one JSON value described by its schema.',
})
const answerCodec = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'answer-json',
  revision: '1',
  changes: 'An answer as UTF-8 JSON: the text for a reader and the value for a program.',
})

export function programAccess(side: ProgramSide): ToolProgramAccess {
  return side.kind === 'closed' ? side : { kind: 'open', unless: side.unless ?? [] }
}

function toJson(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number' && Number.isFinite(value))
    return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(toJson) }
  if (typeof value !== 'object') throw new TypeError('A program value must be JSON')
  const entries = Object.entries(value).filter(([, member]) => member !== undefined)
  return {
    kind: 'object',
    entries: entries.map(([key, member]) => ({ key, value: toJson(member) })),
  }
}

type Data = Extract<ProgramSide, { kind: 'data' }>
const idOf = (name: string) => `@omne-harness/tool-definitions/program/${name}`

function declared(name: string, side: Data): Extract<ToolProgramDeclaration, { kind: 'json' }> {
  const id = idOf(name)
  return {
    kind: 'json',
    contract: programContract,
    schema: {
      id,
      revision: '1',
      digest: canonicalDigest({ id, revision: '1', document: side.schema }),
    },
    definition: { schema: tree(side.schema), vocabulary, descriptions: [] },
    maxBytes: PROGRAM_DATA_MAX_BYTES,
    external: side.external,
  }
}

function answerReturns(
  name: string,
  side: Data,
): Extract<ToolReturnDeclaration, { kind: 'ordinary' }> {
  const id = `${idOf(name)}/answer`
  const document = { type: 'object', required: ['text'], properties: { text: { type: 'string' } } }
  return {
    kind: 'ordinary',
    value: {
      kind: 'encoded-value',
      codec: answerCodec,
      value: {
        identity: { id, revision: '1', digest: canonicalDigest({ id, revision: '1', document }) },
        definition: { schema: tree(document), vocabulary, descriptions: [] },
      },
    },
    program: declared(name, side),
    body: textBody,
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  }
}

function isAnswer(value: unknown): value is Answer {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'text') === 'string'
  )
}

function answerParts(name: string, side: Data, maximum: number) {
  const identity = declared(name, side).schema
  const program: ToolProgramOutput<Answer> = {
    kind: 'json',
    adoption: programContract,
    schema: {
      identity,
      maxBytes: PROGRAM_DATA_MAX_BYTES,
      ref: defineSchema<unknown>({
        id: identity.id,
        load: async () =>
          jsonSchemaDefinition<unknown>({
            document: side.schema as Readonly<Record<string, unknown>>,
            numbers: 'exact-or-reject',
          }),
      }),
    },
    encode: value => succeed(value.data === undefined ? null : toJson(value.data)),
  }
  return {
    codec: {
      adoption: answerCodec,
      encode: (value: unknown) =>
        isAnswer(value)
          ? succeed(new TextEncoder().encode(JSON.stringify(value)))
          : fail({ reason: 'answer-required' }),
      decode: (bytes: Uint8Array) => {
        try {
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          return isAnswer(value) ? succeed(value) : fail({ reason: 'answer-required' })
        } catch {
          return fail({ reason: 'invalid-answer' })
        }
      },
    },
    output: {
      adoption: answerCodec,
      check: ({ value }: { value: unknown }) =>
        isAnswer(value) && utf8Length(value.text) <= maximum
          ? succeed(value)
          : fail({ reason: 'bounded-answer-required' }),
    },
    renderer: { render: (value: Answer) => succeed(value.text) },
    program,
  }
}

function textParts(adoption: Adoption, maximum: number) {
  return {
    codec: {
      adoption,
      encode: (value: unknown) =>
        typeof value === 'string'
          ? succeed(new TextEncoder().encode(value))
          : fail({ reason: 'text-required' }),
      decode: (bytes: Uint8Array) => {
        try {
          return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        } catch {
          return fail({ reason: 'invalid-utf8' })
        }
      },
    },
    output: {
      adoption,
      check: ({ value }: { value: unknown }) =>
        typeof value === 'string' && utf8Length(value) <= maximum
          ? succeed(value)
          : fail({ reason: 'bounded-text-required' }),
    },
    renderer: { render: (value: string) => succeed(value) },
    program: { kind: 'none' } as const,
  }
}

export type CommandOperationSpec<A, E> = Readonly<{
  /** `Tool.command`: it names the schema of the value a program is given. */
  entry: string
  parameters: ParameterContract
  arguments: ParameterCodec<A>
  /** The adoption of the text this tool returns: its codec and its check. */
  text: Adoption
  side: ProgramSide | undefined
  maximum: number
  run(args: A, environment: E, execution: ToolExecutionContext): Promise<Answer>
}>

export function commandReturns(entry: string, text: Adoption, side: ProgramSide | undefined) {
  return side?.kind === 'data' ? answerReturns(entry, side) : textReturns(text)
}

/** One command as an operation: its text is bounded; a command with a value keeps the value whole. */
type Declared = Extract<ToolOperationParameters, { kind: 'declared' }>
type Rejected = Readonly<{ field: string; reason: string }>

export function commandOperation<A, E>(
  spec: CommandOperationSpec<A, E>,
): Outcome<ToolOperation<E, ToolMessageContentBlock, Declared>, Rejected> {
  const { entry, side, maximum, run } = spec
  const parameters = { kind: 'declared', value: spec.parameters } as const
  const common = { kind: 'ordinary', parameters: spec.arguments, waits: [] } as const
  const bound = async (args: A, environment: E, execution: ToolExecutionContext) => {
    const { text, data } = await run(args, environment, execution)
    const shown = bounded(text, maximum)
    return isProgramCall(execution) && data !== undefined ? { text: shown, data } : { text: shown }
  }
  if (side?.kind === 'data')
    return defineToolOperation<A, Answer, E, ToolMessageContentBlock, Declared>({
      parameters,
      returns: answerReturns(entry, side),
      author: { ...common, executor: { execute: bound }, ...answerParts(entry, side, maximum) },
    })
  return defineToolOperation<A, string, E, ToolMessageContentBlock, Declared>({
    parameters,
    returns: textReturns(spec.text),
    author: {
      ...common,
      executor: { execute: async (...call) => (await bound(...call)).text },
      ...textParts(spec.text, maximum),
    },
  })
}
