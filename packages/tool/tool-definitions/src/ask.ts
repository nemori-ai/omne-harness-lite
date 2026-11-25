import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolCommandRelease } from '@omne-harness/tool-contract'
import {
  ASK_STATE_MAX_BYTES,
  askAdoption,
  askCards,
  askCommand,
  askCommandNames,
  askState,
  askStateAdoption,
  askStateSchema,
  type AskArguments,
  type AskCommandEntry,
} from './ask-protocol.ts'
import {
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type CheckpointedToolExecutor,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { askClosedResult, askResult, readAskState } from './ask-result.ts'
import { parseConstruction, tree } from './protocol.ts'
import { textReturns } from './returns.ts'

const encoder = new TextEncoder()

/** Asking needs a person who can answer where the call is made. */
const ASK_CONDITIONS = ['person-answers'] as const

export const askGuide = [
  'Ask exists to make answering fast. You can always ask a question in plain text in your reply. Use Ask when a few options to pick let the person answer faster. If options would not make it easier for the person, ask in text instead. Use Ask only when the answer changes what you do next and you cannot get it from the request, the workspace, or a sensible default. Do not ask for facts that you can look up. Do not ask for a polite confirmation before you start.',
  'Do not use Ask to ask for permission, such as "May I delete these files?" or "Can I run this command?". You do not decide whether an action needs the approval of the person; the system does. When an action needs approval, the system asks the person itself before the action starts. An answer to Ask grants no permission for any action.',
  'Put all questions that you need now into one call, at most 7. Each question must stand on its own: the person may see only the card, without the conversation. Name the items that you ask about. Give 2 to 4 options. Each option has a short label and one sentence about its effect. If you recommend an option, put it first and add "(Recommended)" to its label. Do not add an "Other" option. The person can always write a free answer or skip the question.',
  'The call returns when the person has handled all questions. There is no timeout and no default answer. When a question has no answer, continue with the safest choice and say which choice you made, or stop that part of the work. Do not ask the same question again right away.',
].join('\n\n')

export const askDescription =
  'Ask the person questions with options they can pick, and wait for the answers. Not for asking permission: the system asks the person itself when an action needs approval.'

export const askCommands: readonly AskCommandEntry[] = askCommandNames.map(askCommand)

export const askExecutor: CheckpointedToolExecutor<AskArguments, string, null> = {
  checkpoint: {
    schema: askStateSchema.identity,
    codec: askStateAdoption,
    maxBytes: ASK_STATE_MAX_BYTES,
  },
  async initial(args) {
    // 参数编解码已经校验过一次。这里再核一次，因为执行者不能假定调用方用了同一个编解码器。
    const cards = askCards(args)
    if ('failure' in cards) return fail({ kind: 'invalid', reason: cards.failure })
    const state = encoder.encode(JSON.stringify(askState(cards.ok)))
    if (state.byteLength > ASK_STATE_MAX_BYTES)
      return fail({ kind: 'too-large', reason: 'ask-state-too-large' })
    return succeed({
      kind: 'suspended',
      state,
      closedResult: askClosedResult,
      wait: {
        kind: 'ask',
        key: args.command,
        contract: hitlDecisionWait,
        request: tree({ questions: cards.ok }),
      },
    })
  },
  async resume({ checkpoint, response }) {
    const state = readAskState(checkpoint)
    if ('failure' in state) return fail({ kind: 'invalid', reason: state.failure })
    const result = askResult(state.ok, response)
    if ('failure' in result) return fail({ kind: 'invalid', reason: result.failure })
    return succeed({ kind: 'completed', value: result.ok })
  },
}

const returns = textReturns(askAdoption)

export function createAskAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const parsed = parseConstruction(construction, [
    {
      name: 'resultMaxBytes',
      kind: 'positive',
      required: true,
      description: 'Maximum complete UTF-8 result bytes.',
    },
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const operations: Record<
    string,
    {
      summary: string
      operation: ToolOperation<null, ToolMessageContentBlock>
      release: ToolCommandRelease
      conditions: readonly string[]
      readOnly: boolean
    }
  > = {}
  for (const command of askCommands) {
    const operation = defineToolOperation<
      AskArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: command.parameters },
      returns,
      author: {
        kind: 'ordinary',
        parameters: command.codec,
        waits: [hitlDecisionWait],
        executor: askExecutor,
        codec: {
          adoption: askAdoption,
          encode: (value: unknown) =>
            typeof value === 'string'
              ? succeed(encoder.encode(value))
              : fail({ reason: 'text-required' }),
          decode(bytes) {
            try {
              return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
            } catch {
              return fail({ reason: 'invalid-utf8' })
            }
          },
        },
        output: {
          adoption: askAdoption,
          check: ({ value }: { value: unknown }) =>
            typeof value === 'string' && encoder.encode(value).byteLength <= maximum
              ? succeed(value)
              : fail({ reason: 'the Ask result exceeds resultMaxBytes' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[command.name] = {
      summary: command.summary,
      operation: operation.ok,
      release: { gate: null },
      conditions: ASK_CONDITIONS,
      // A question changes nothing another call can observe: several may wait for a person together.
      readOnly: true,
    }
  }
  const author = defineCommandTool({
    implementation: {
      description: askDescription,
      backgroundAllowed: false,
      declarations: {
        adoption: askAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: 'wrapped',
    guide: askGuide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const askToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Ask',
    revision: '2',
    changes: 'ask as one checkpointed executor that suspends on one Ask wait.',
  }),
  createAuthor: createAskAuthor,
}
