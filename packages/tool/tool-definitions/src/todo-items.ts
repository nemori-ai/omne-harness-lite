import { textReturns } from './returns.ts'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable } from '@omne-harness/tool-contract'
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
import { parseConstruction } from './protocol.ts'
import { todoItemsOf, type TodoAuthorReply } from './todo-items-port.ts'
import {
  todoAdoption,
  todoCommand,
  todoCommandNames,
  todoParameterCodec,
  type TodoArguments,
} from './todo-items-protocol.ts'

const returns = textReturns(todoAdoption)
const guide =
  'Todo items belong to the current Session. Use stable item ids. Text is preserved and must be nonblank, at most 4096 UTF-8 bytes. list defaults to 50 items, with a maximum of 100. Pass the complete next cursor to continue. A changed revision requires restarting from the first page. recovered receipts describe the original operation, not the current item state. commit-unknown does not prove failure: preserve the original call identity and intent. Never create a new add to recover an unknown result. Changing text requires add then remove, which are separate operations. No automatic Context projection is provided.'
const menu: CommandTable = {
  name: 'TodoItems',
  encoding: 'wrapped',
  guide,
  commands: todoCommandNames.map(name => {
    const command = todoCommand(name)
    return {
      name,
      summary: command.summary,
      parameters: { kind: 'declared', value: command.parameters },
      returns,
    }
  }),
}
function unavailable(diagnostic: string): TodoAuthorReply {
  return { failure: { kind: 'unavailable', owner: 'TodoItems', diagnostic } }
}
async function execute(args: TodoArguments, execution: ToolExecutionContext): Promise<string> {
  if (args.kind === 'help')
    return `done TodoItems help${args.name === undefined ? '' : ` ${args.name}`}\n${commandGuide(menu, args.name)}`
  const todos = todoItemsOf(execution)
  if (todos === undefined)
    return JSON.stringify(unavailable('Session Todo capability is unavailable.'))
  let answer: TodoAuthorReply
  switch (args.kind) {
    case 'add':
      answer = await todos.add({ text: args.text })
      break
    case 'remove':
      answer = await todos.remove({ item: args.item })
      break
    case 'mark_complete':
      answer = await todos.markComplete({ item: args.item })
      break
    case 'list':
      answer = await todos.list({ after: args.after, limit: args.limit })
      break
  }
  return JSON.stringify(answer)
}

export function createTodoItemsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const parsed = parseConstruction(construction, [
    {
      name: 'resultMaxBytes',
      kind: 'positive',
      required: true,
      description: 'Maximum complete UTF-8 output bytes.',
    },
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const maximum = parsed.ok.number('resultMaxBytes', 0)
  const tooLarge = JSON.stringify(
    unavailable(
      'Output exceeds resultMaxBytes. Reduce list limit; preserve the original mutation call identity.',
    ),
  )
  const operations: Record<
    string,
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
  > = {}
  for (const name of todoCommandNames) {
    const command = todoCommand(name)
    const operation = defineToolOperation<
      TodoArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: command.parameters },
      returns,
      author: {
        kind: 'ordinary',
        parameters: todoParameterCodec(name),
        waits: [],
        executor: {
          async execute(args, _environment, execution) {
            const text = await execute(args, execution)
            return new TextEncoder().encode(text).byteLength <= maximum ? text : tooLarge
          },
        },
        codec: {
          adoption: todoAdoption,
          encode(value: unknown) {
            return typeof value === 'string'
              ? succeed(new TextEncoder().encode(value))
              : fail({ reason: 'text-required' })
          },
          decode(bytes) {
            try {
              return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
            } catch {
              return fail({ reason: 'invalid-utf8' })
            }
          },
        },
        output: {
          adoption: todoAdoption,
          check: ({ value }: { value: unknown }) =>
            typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximum
              ? succeed(value)
              : fail({ reason: 'unavailable: output exceeds resultMaxBytes; reduce list limit' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = { summary: command.summary, operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description: 'Maintain persistent pending and completed items in the current Session.',
      backgroundAllowed: false,
      declarations: {
        adoption: todoAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: 'wrapped',
    guide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}
export const todoItemsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'TodoItems',
    revision: '2',
    returns: 'Published raw value, model body and system offloading policy.',
    changes: 'Five bound Session Todo commands with complete JSON receipts and pages.',
  }),
  createAuthor: createTodoItemsAuthor,
}
