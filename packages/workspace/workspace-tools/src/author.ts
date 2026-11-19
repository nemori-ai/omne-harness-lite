import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { workspaceSwitchOf, type SwitchAnswer, type SwitchTarget } from './port.ts'
import { switchAdoption, switchContract, switchParameterCodec, tree } from './protocol.ts'

const OWNER = '@omne-harness/workspace-tools'
const NAME = 'SwitchWorkspace'
const stringSchema = describedAdoption({
  owner: OWNER,
  name: 'string-output',
  revision: '1',
  schema: { type: 'string' },
})
const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: switchAdoption,
    value: {
      identity: {
        id: stringSchema.name,
        revision: stringSchema.revision,
        digest: stringSchema.digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: switchAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: OWNER,
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

export const SWITCH_DESCRIPTION =
  'Change the workspace this session works in. Give exactly one target: directory, workspace, or none. The change takes effect from your next step: every call of this step still runs in the directory it was given. A result is one line, <kind> then fields, then what it means: done, refused (nothing changed), half-done (a directory was made an instance but the session was not switched: call again with the same directory), unavailable (try again later).'

const NEXT_STEP =
  'This takes effect from your next step. Calls already made in this step, and any made before it ends, still run in the directory they were given.'

/** One line the model can match on, then what it means for what it does next. */
export function answerText(answer: SwitchAnswer): string {
  switch (answer.kind) {
    case 'switched':
      return `done ${NAME} directory=${answer.directory ?? 'none'} associated=${answer.associated ? 'yes' : 'no'}\n${NEXT_STEP}`
    case 'refused':
      return `refused reason=${answer.reason}\nNothing changed.`
    case 'half-done':
      return `half-done associated=${answer.associated} reason=${answer.reason}\nThe directory is now an instance of the workspace, but the session was not switched. Call ${NAME} again with the same directory to finish.`
    case 'unavailable':
      return `unavailable reason=${answer.diagnostic}\nIt could not be done now. Call ${NAME} again later.`
  }
}

const utf8 = (text: string) => new TextEncoder().encode(text)

/** A result past the bound is a failure that says so; it is never cut and passed off as whole. */
function bounded(text: string, maximum: number): string {
  if (utf8(text).byteLength <= maximum) return text
  const failure = `too-large reason=the result has ${String(utf8(text).byteLength)} bytes, more than ${String(maximum)}`
  return utf8(failure).byteLength <= maximum ? failure : 'too-large'
}

function resultMaxBytesOf(construction: JsonValue): number | undefined {
  if (construction.kind !== 'object' || construction.entries.length !== 1) return undefined
  const [entry] = construction.entries
  if (entry?.key !== 'resultMaxBytes' || entry.value.kind !== 'number') return undefined
  const value = Number(entry.value.lexeme)
  return Number.isSafeInteger(value) && value >= 16 ? value : undefined
}

function operationOf(maximum: number) {
  return defineToolOperation<
    SwitchTarget,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: switchContract },
    returns,
    author: {
      kind: 'ordinary',
      parameters: switchParameterCodec(),
      waits: [],
      executor: {
        async execute(target, _environment, execution) {
          const bound = workspaceSwitchOf(execution)
          const answer: SwitchAnswer =
            bound === undefined
              ? {
                  kind: 'unavailable',
                  diagnostic: 'the workspace switch is not attached to this call',
                }
              : await bound.switch(target)
          return bounded(answerText(answer), maximum)
        },
      },
      codec: {
        adoption: switchAdoption,
        encode: (value: unknown) =>
          typeof value === 'string' ? succeed(utf8(value)) : fail({ reason: 'text-required' }),
        decode(bytes) {
          try {
            return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          } catch {
            return fail({ reason: 'invalid-utf8' })
          }
        },
      },
      output: {
        adoption: switchAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'bounded-text-required' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createSwitchWorkspaceAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({ field: 'construction', reason: `${NAME} takes only resultMaxBytes, at least 16` })
  const operation = operationOf(maximum)
  if ('failure' in operation)
    return fail({ field: 'operation', reason: JSON.stringify(operation.failure) })
  const author = defineFunctionTool<null, ToolMessageContentBlock>({
    implementation: {
      description: SWITCH_DESCRIPTION,
      backgroundAllowed: false,
      declarations: {
        adoption: switchAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    operation: operation.ok,
  })
  return 'failure' in author
    ? fail({ field: 'operation', reason: JSON.stringify(author.failure) })
    : author
}

export const switchWorkspaceToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: OWNER,
    name: NAME,
    revision: '1',
    changes: 'One function over an attached switch port; bounded text.',
  }),
  createAuthor: createSwitchWorkspaceAuthor,
}
