import { textBody } from './returns.ts'
import type { JsonValue } from '@omne-harness/json-text'
import { judgeMediaType, judgeModalities } from '@omne-harness/modality'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import { toolsCapabilityOf, type CommandTable, type ToolResult } from '@omne-harness/tool-contract'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
} from '@omne-harness/tool-contract/provider'
import { parseConstruction } from './protocol.ts'
import {
  presentExecution,
  presentInspection,
  presentSearch,
  toolsFailure,
  toolsText,
} from './tools-presentation.ts'
import {
  toolsCommands,
  toolsParameterCodec,
  toolsParameterContract,
  toolsProtocol,
  type ParsedToolsCommand,
} from './tools-protocol.ts'

const GUIDE =
  'Use one wrapped call: {"command":"search","params":{"query":"read files","after":null,"limit":10}}. Search finds currently lawful nonresident tools. Ranking uses BM25 without historical call counts. Resident tools require direct calls and cannot be executed through Tools. Inspect can describe either kind. Inspect the target command before execute. Pass only its business parameters as arguments. Execute calls a nonresident target through the tool runtime. Discovery and execution never add that target to the model tool list. A pending or unknown execute response is not completion: copy its recovery call exactly and do not execute a replacement. read_result result/body/attachment uses fixed tr1/tb1/ta1 references and tc1 next; invocation queries a target; forwarding recovers an existing original slot and may continue its original admission. Start with after=null. next=null ends only that traversal. Offloaded bodies use kind=body and return UTF-8 text pages. Native attachments use kind=attachment and return base64 bytes. A body may expire; not-found body/expired means its retained text is no longer readable. References grant no access. Ending observation does not cancel an execute request already accepted by the provider; its original preparation and admission can still finish. The target runtime owns admitted targets.'

export function createToolsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<unknown, ToolMessageContentBlock>['createAuthor']> {
  const parsed = parseConstruction(construction, [
    {
      name: 'resultMaxBytes',
      kind: 'positive',
      required: true,
      description: 'Complete structured result UTF-8 JSON byte budget; no silent truncation.',
    },
    {
      name: 'outputModalities',
      kind: 'strings',
      required: true,
      description: 'Trusted adopted output modalities. The text release supplies ["text"].',
    },
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const modalities = judgeModalities(parsed.ok.strings('outputModalities'))
  if ('rejected' in modalities || !modalities.ok.includes('text'))
    return fail({
      field: 'outputModalities',
      reason: 'unique-supported-modalities-including-text-required',
    })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const codec = createToolMessageResultCodec(maximum)
  const failure = () =>
    toolsText(
      'ERROR: unsupported (result budget or output modality). Narrow the search limit or use a compatible result reader.',
    )
  if ('failure' in codec.encode(failure()))
    return fail({ field: 'resultMaxBytes', reason: 'fixed-error-does-not-fit' })
  const compatible = (value: ToolResult<ToolMessageContentBlock>) =>
    value.content.every(block => {
      if (block.kind === 'text') return true
      const media = judgeMediaType(block.ref.mediaType)
      return (
        'ok' in media && media.ok.modality !== null && modalities.ok.includes(media.ok.modality)
      )
    })
  const checked = (value: unknown) => {
    const encoded = codec.encode(value)
    if ('failure' in encoded) return encoded
    const decoded = codec.decode(encoded.ok)
    return 'failure' in decoded || compatible(decoded.ok)
      ? decoded
      : fail({ reason: 'unsupported-output-modality' })
  }
  const finish = (value: ToolResult<ToolMessageContentBlock>) =>
    'failure' in checked(value) ? failure() : value
  const returns = {
    kind: 'structured',
    value: { kind: 'tool-result', contract: codec.adoption },
    program: { kind: 'none' },
    body: textBody,
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  } as const
  const menu: CommandTable = {
    name: 'Tools',
    encoding: 'wrapped',
    guide: GUIDE,
    commands: toolsCommands.map(command => ({
      name: command.name,
      summary: command.summary,
      parameters: { kind: 'declared', value: toolsParameterContract(command) },
      returns,
    })),
  }
  const commands: Record<
    string,
    { summary: string; operation: ToolOperation<unknown, ToolMessageContentBlock> }
  > = {}
  for (const command of toolsCommands) {
    const made = defineToolOperation({
      parameters: { kind: 'declared', value: toolsParameterContract(command) },
      returns,
      author: {
        kind: 'structured',
        parameters: toolsParameterCodec(command.name),
        waits: [],
        codec,
        output: {
          adoption: toolsProtocol,
          check: ({ value }: { value: unknown }) => checked(value),
        },
        program: { kind: 'none' },
        executor: {
          execute: async (
            args: ParsedToolsCommand,
            _environment: unknown,
            context: ToolExecutionContext,
          ) => finish(await execute(args, context, menu)),
        },
      },
    })
    if ('failure' in made) return fail({ field: 'commands', reason: 'Tools operation rejected' })
    commands[command.name] = { summary: command.summary, operation: made.ok }
  }
  const made = defineCommandTool({
    encoding: 'wrapped',
    guide: GUIDE,
    commands,
    implementation: {
      description:
        'Discover, inspect and invoke tools in the current session scope, and read fixed tool results. Use help for exact parameters.',
      backgroundAllowed: false,
      declarations: {
        adoption: toolsProtocol,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: modalities.ok,
        settings: null,
      },
    },
  })
  return 'failure' in made
    ? fail({ field: 'commands', reason: 'Tools registration rejected' })
    : succeed(made.ok)
}

async function execute(
  args: ParsedToolsCommand,
  context: ToolExecutionContext,
  menu: CommandTable,
): Promise<ToolResult<ToolMessageContentBlock>> {
  if (args.kind === 'help') {
    if (args.command !== null && !menu.commands.some(command => command.name === args.command))
      return toolsFailure({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
    return toolsText(commandGuide(menu, args.command ?? undefined))
  }
  const capability = toolsCapabilityOf(context)
  if (capability === undefined)
    return toolsFailure({
      kind: 'unavailable',
      dependency: 'tools-capability',
      diagnostic: 'No current trusted invocation capability',
    })
  switch (args.kind) {
    case 'search': {
      const answer = await capability.search(args.arguments)
      return 'failure' in answer ? toolsFailure(answer.failure) : presentSearch(answer.ok)
    }
    case 'inspect': {
      const answer = await capability.inspect(args.arguments)
      return 'failure' in answer ? toolsFailure(answer.failure) : presentInspection(answer.ok)
    }
    case 'execute':
      return presentExecution(await capability.execute(args.arguments))
    case 'read_result':
      return capability.readResult(args.arguments)
  }
}

export const toolsToolModule: ToolImplementationModule<unknown, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Tools',
    revision: '2',
    returns: 'Published raw value, model body and system offloading policy.',
    commands: toolsCommands,
  }),
  createAuthor: createToolsAuthor,
}
