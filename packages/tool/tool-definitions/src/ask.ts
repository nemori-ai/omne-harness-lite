// Ask 的检查点作者：ask 与 request_approval 共用一个执行者。
// initial 段校验参数，然后以整批卡片暂停。resume 段把答复投影成结果。
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  ASK_STATE_MAX_BYTES,
  askAdoption,
  askCards,
  askCommand,
  askCommandNames,
  askState,
  askStateAdoption,
  askStateSchema,
  askWaitContract,
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

const encoder = new TextEncoder()

export const askGuide = [
  'Use Ask only when the answer changes what you do next and you cannot get it from the request, the workspace, or a sensible default. Do not ask for facts that you can look up. Do not ask for a polite confirmation before you start. Do not ask about an action that the permission rules forbid. Do not ask again about an action that the person already approved for this scope.',
  'Put all questions that you need now into one call, at most 7. Each question must stand on its own: the person may see only the card, without the conversation. Name the items that you ask about. Give 2 to 4 options. Each option has a short label and one sentence about its effect. If you recommend an option, put it first and add "(Recommended)" to its label. Do not add an "Other" option. The person can always write a free answer or skip the question.',
  'Use request_approval for one action that you did not do yet. Describe the action and its object, the reason, the impact, whether the change can be reversed, and what you do if the person does not approve. Do not do the action before the answer.',
  'The call returns when the person has handled all questions. There is no timeout and no default answer. When a question has no answer, continue with the safest choice and say which choice you made, or stop that part of the work. Do not ask the same question again right away. Only an explicit approval permits the action. No answer, a rejection, or words that do not approve are not permission.',
].join('\n\n')

export const askDescription =
  'Ask the person a question or request approval, and wait for the answer. Use it only when you are blocked on something that only the person can decide or tell you.'

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
    const state = encoder.encode(JSON.stringify(askState(args.command, cards.ok)))
    if (state.byteLength > ASK_STATE_MAX_BYTES)
      return fail({ kind: 'too-large', reason: 'ask-state-too-large' })
    return succeed({
      kind: 'suspended',
      state,
      closedResult: askClosedResult(args.command),
      wait: {
        kind: 'ask',
        key: args.command,
        contract: askWaitContract,
        request: tree({ questions: cards.ok }),
      },
    })
  },
  // resume 段不再等人：读回题目，把决定投影成结果，调用随之完成。
  async resume({ checkpoint, response }) {
    const state = readAskState(checkpoint)
    if ('failure' in state) return fail({ kind: 'invalid', reason: state.failure })
    const result = askResult(state.ok, response)
    if ('failure' in result) return fail({ kind: 'invalid', reason: result.failure })
    return succeed({ kind: 'completed', value: result.ok })
  },
}

const returns = { kind: 'ordinary', program: { kind: 'none' } } as const

/**
 * Ask 的命令工具：两条命令共用 `askExecutor`，都声明 `askWaitContract`。结果是 resume 段投影出的
 * 文本，运维者用 `resultMaxBytes` 限定它的 UTF-8 字节数。
 */
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
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
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
        waits: [askWaitContract],
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
    operations[command.name] = { summary: command.summary, operation: operation.ok }
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
    revision: '1',
    changes: 'ask and request_approval as one checkpointed executor that suspends on one Ask wait.',
  }),
  createAuthor: createAskAuthor,
}
