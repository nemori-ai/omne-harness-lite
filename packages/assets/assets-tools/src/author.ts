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
import { HANDLERS, revisionOf, type Handler, type Reaching, type Ready } from './commands.ts'
import { extensionsSourceOf, type ExtensionsCallSource, type ExtensionsFaces } from './port.ts'
import {
  extensionsAdoption,
  extensionsCommandNames,
  extensionsContract,
  extensionsParameterCodec,
  extensionsSummaries,
  tree,
  type ArgumentsOf,
  type ExtensionsArguments,
  type ExtensionsCommandName,
} from './protocol.ts'
import { describeWrite } from './release.ts'
import { TOOL, done, invalid, unavailable, type Answer } from './results.ts'
import { HOW, noCategory } from './text.ts'

const GATES: readonly ToolGate[] = [
  { id: 'read', title: '查看', default: 'auto' },
  { id: 'change', title: '改动', default: 'auto' },
  { id: 'export', title: '取到工作区', default: 'auto' },
]
/** Export changes no asset but writes into the workspace: it has a gate of its own. */
const GATE_OF: Readonly<Partial<Record<ExtensionsCommandName, 'change' | 'export'>>> = {
  publish: 'change',
  enable: 'change',
  disable: 'change',
  remove: 'change',
  export: 'export',
}
const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const description =
  "Manage what extends this system for the acting tenant, in every category the system has now: publish one from a workspace directory or a body, ask what it would change, see whether it is in effect, enable, disable, remove. Write the files in the workspace first, then publish here; the app's own files are not edited."

const guide = [
  'Give every publish, enable, disable and remove an id of your own. After a failure that says unknown, send the same command with the same id, or ask result: what took effect is recalled, not done twice.',
  'Categories come and go while the system runs. They are not listed in this text; categories reads what exists now.',
  'Ask impact before you publish: a new holding is enabled when it is made, so publishing takes effect at once.',
  'To change an extension that is already held: export it to a directory, edit the files there, ask impact with that directory, then publish from it. The held version is the source; the directory is your working copy.',
  'You act for the acting tenant: what you publish is held by this tenant and changes only what this tenant sees.',
  'A failure starts with its reason, then says what to do.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: extensionsAdoption,
    value: {
      identity: {
        id: '@omne-harness/assets-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/assets-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: extensionsAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/assets-tools',
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
  commands: extensionsCommandNames.map(name => ({
    name,
    summary: extensionsSummaries[name],
    parameters: { kind: 'declared', value: extensionsContract(name) },
    returns,
  })),
}

const UNATTACHED = 'the asset services are not attached to this call'

function facesOf(source: ExtensionsCallSource): ExtensionsFaces | undefined {
  try {
    return source.faces()
  } catch {
    return undefined
  }
}

/** Help reads no asset; with a category it reads how that category is made, as its owner registered it. */
function help(
  source: ExtensionsCallSource | undefined,
  params: ArgumentsOf<'help'>['params'],
): Answer {
  const { name, category } = params
  const head = `help${name === undefined ? '' : ` ${name}`}`
  const revision = source === undefined ? null : revisionOf(source)
  if (category === undefined) return done(head, [commandGuide(menu, name)], revision)
  const faces = source === undefined ? undefined : facesOf(source)
  if (faces === undefined) return unavailable('help', source === undefined ? UNATTACHED : undefined)
  const listing = faces.categories.describe(category)
  if (listing === undefined) return invalid(noCategory(faces.categories, category))
  if ('unusable' in listing) return unavailable('help', `category ${category} cannot be used now`)
  const { creation: how, authoring } = listing.display
  const line = `category ${category}: ${HOW[listing.creation]}.${how === undefined ? '' : ` ${how}`}`
  const written = authoring === undefined ? [] : authoring.split('\n')
  return done(head, [commandGuide(menu, name), line, ...written], revision)
}

/** One call is one read or one write of the assets as they are now. */
export async function answerExtensions(
  args: ExtensionsArguments,
  execution: Pick<ToolExecutionContext, 'signal'>,
): Promise<Answer> {
  const source = extensionsSourceOf(execution)
  if (args.command === 'help') return help(source, args.params)
  if (source === undefined) return unavailable(args.command, UNATTACHED)
  const faces = facesOf(source)
  if (faces === undefined) return unavailable(args.command)
  const ready: Ready = {
    source,
    faces,
    scope: { tenant: source.tenant, principal: source.principal },
  }
  const handler = HANDLERS[args.command] as Handler<Reaching>
  return handler(ready, args.params)
}

/** A failed answer is thrown with its reason: the call fails with that reason as its result. */
export const extensionsExecutor = {
  async execute(args: ExtensionsArguments, _environment: null, context: ToolExecutionContext) {
    const answer = await answerExtensions(args, context)
    if ('failure' in answer) throw new Error(answer.failure.reason)
    return answer.ok
  },
}

const constructionSchema = z.strictObject({ resultMaxBytes: z.int().min(64) })

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: ExtensionsCommandName, maximum: number) {
  return defineToolOperation<
    ExtensionsArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: extensionsContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: extensionsParameterCodec(name),
      waits: [],
      executor: extensionsExecutor,
      codec: {
        adoption: extensionsAdoption,
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
        adoption: extensionsAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the OmneExtensions result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
    ...(GATE_OF[name] === undefined ? {} : { describeRelease: describeWrite }),
  })
}

export function createExtensionsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({
      field: 'construction',
      reason: 'OmneExtensions takes only resultMaxBytes, at least 64',
    })
  const operations: Record<
    string,
    { summary: string; operation: Operation; release: Readonly<{ gate: string }> }
  > = {}
  for (const name of extensionsCommandNames) {
    const operation = operationOf(name, read.data.resultMaxBytes)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: extensionsSummaries[name],
      operation: operation.ok,
      release: { gate: GATE_OF[name] ?? 'read' },
    }
  }
  const author = defineCommandTool({
    gates: GATES,
    implementation: {
      description,
      backgroundAllowed: false,
      declarations: {
        adoption: extensionsAdoption,
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

export const extensionsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/assets-tools',
    name: 'OmneExtensions',
    revision: '1',
    changes:
      'Commands over the management and publishing services of the assets, for the tenant and principal of the call.',
  }),
  createAuthor: createExtensionsAuthor,
}
