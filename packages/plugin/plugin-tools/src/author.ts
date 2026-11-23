import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable, ToolGate } from '@omne-harness/tool-contract'
import { z } from 'zod'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { HANDLERS, type Handler, type Reading } from './commands.ts'
import { extensionSightOf } from './port.ts'
import {
  extensionPointsAdoption,
  extensionPointsCommandNames,
  extensionPointsContract,
  extensionPointsParameterCodec,
  extensionPointsSummaries,
  tree,
  type ExtensionPointsArguments,
  type ExtensionPointsCommandName,
} from './protocol.ts'
import { TOOL, done, unavailable, type Answer } from './results.ts'

const GATES: readonly ToolGate[] = [{ id: 'read', title: '查看', default: 'auto' }]
const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const description =
  'See where this system can be extended: the named places in its interface and behaviour that accept contributions, what each one accepts, and what is placed there now. Look here before changing how the app itself looks or works. Reads only.'

const guide = [
  'A point is named <host>.<name>. An interface part is named <host>.<area>.<part>. A part opens up to three depths, from shallow to deep: tokens (data), style (data), render (code). Use the shallowest that does the job.',
  'Points come and go while the system runs: an installed extension can declare new ones. Names are not fixed in this text; tree and find read what exists now.',
  'Nothing here changes anything. To add or change something, write the files in the workspace with Files and publish them with OmneExtensions.',
  'You see what the acting tenant may see. A client is listed only while it is connected.',
  'A failure starts with its reason, then says what to do.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: extensionPointsAdoption,
    value: {
      identity: {
        id: '@omne-harness/plugin-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/plugin-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: extensionPointsAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/plugin-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: TOOL,
  encoding: ENCODING,
  guide,
  commands: extensionPointsCommandNames.map(name => ({
    name,
    summary: extensionPointsSummaries[name],
    parameters: { kind: 'declared', value: extensionPointsContract(name) },
    returns,
  })),
}

const UNATTACHED = 'the extension trees are not attached to this call'

/** One call is one read of the trees as they are now. */
export async function answerExtensionPoints(
  args: ExtensionPointsArguments,
  execution: Pick<ToolExecutionContext, 'signal'>,
): Promise<Answer> {
  const sight = extensionSightOf(execution)
  if (args.command === 'help') {
    const topic = args.params.name
    return done(
      `help${topic === undefined ? '' : ` ${topic}`}`,
      [commandGuide(menu, topic)],
      sight?.revisions.current() ?? null,
    )
  }
  if (sight === undefined) return unavailable(args.command, UNATTACHED)
  const handler = HANDLERS[args.command] as Handler<Reading>
  return handler(sight, args.params)
}

/** A failed answer is thrown with its reason: the call fails with that reason as its result. */
export const extensionPointsExecutor = {
  async execute(args: ExtensionPointsArguments, _environment: null, context: ToolExecutionContext) {
    const answer = await answerExtensionPoints(args, context)
    if ('failure' in answer) throw new Error(answer.failure.reason)
    return answer.ok
  },
}

const constructionSchema = z.strictObject({ resultMaxBytes: z.int().min(64) })

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: ExtensionPointsCommandName, maximum: number) {
  return defineToolOperation<
    ExtensionPointsArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: extensionPointsContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: extensionPointsParameterCodec(name),
      waits: [],
      executor: extensionPointsExecutor,
      codec: {
        adoption: extensionPointsAdoption,
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
        adoption: extensionPointsAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the OmneExtensionPoints result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createExtensionPointsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({
      field: 'construction',
      reason: 'OmneExtensionPoints takes only resultMaxBytes, at least 64',
    })
  const operations: Record<
    string,
    { summary: string; operation: Operation; release: Readonly<{ gate: string }> }
  > = {}
  for (const name of extensionPointsCommandNames) {
    const operation = operationOf(name, read.data.resultMaxBytes)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: extensionPointsSummaries[name],
      operation: operation.ok,
      release: { gate: 'read' },
    }
  }
  const author = defineCommandTool({
    gates: GATES,
    implementation: {
      description,
      backgroundAllowed: false,
      declarations: {
        adoption: extensionPointsAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const extensionPointsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/plugin-tools',
    name: 'OmneExtensionPoints',
    revision: '1',
    changes: 'Reads the server and client extension trees over an attached sight; changes nothing.',
  }),
  createAuthor: createExtensionPointsAuthor,
}
