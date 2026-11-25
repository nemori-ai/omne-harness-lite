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
import { HANDLERS, type Handler, type Reaching } from './commands.ts'
import { canvasOf } from './port.ts'
import {
  canvasAdoption,
  canvasCommandNames,
  canvasContract,
  canvasParameterCodec,
  canvasSummaries,
  tree,
  type CanvasArguments,
  type CanvasCommandName,
} from './protocol.ts'
import { describeLocking } from './release.ts'
import { unavailable, type Answer } from './results.ts'

/** Lock is denied by default: an agent cannot undo what a person locked until the tenant allows it. */
const CANVAS_GATES: readonly ToolGate[] = [
  { id: 'read', title: '看', default: 'auto' },
  { id: 'arrange', title: '摆', default: 'auto' },
  { id: 'lock', title: '锁', default: 'deny' },
]
const CANVAS_GATE_OF: Readonly<Record<CanvasCommandName, string>> = {
  help: 'read',
  look: 'read',
  away: 'read',
  kinds: 'read',
  place: 'arrange',
  arrange: 'arrange',
  take: 'arrange',
  pile: 'arrange',
  scatter: 'arrange',
  lock: 'lock',
  unlock: 'lock',
}

const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const guide = [
  'The canvas is the sheet on the back of the app, shared by the user and you. What is on it is a reference, a kind and a ref, to a thing its owner keeps: taking one off removes only its place. Each change records who made it; that comes from this call, you do not give it.',
  'A spot is x and y from the top left corner of the sheet, in pixels; look gives the width, height and grid of the sheet, the least and most size of an item, and the footprint an item given no size takes. Every write says how the canvas should be, so sending the same command again after it took effect answers no-change.',
  'A locked item cannot be moved, resized, piled or taken by anyone. A person locks and unlocks; when you meet a locked item, ask the user.',
  'A canvas app is a small app a plugin draws on the canvas. To make one: 1. Write a directory with plugin.json and one .js file, for example plugin.json {"schema":1,"name":"clock","summary":"A clock on the canvas.","client":{"members":[{"point":"canvas.app-render","key":"clock","module":"clock.js","export":"clock"}]}} and clock.js: export const clock = ({ React }) => ({ subject }) => React.createElement(\'h2\', null, subject.name). The export is called once with React, the shared interface parts ui and a shell, and gives back the drawing; the file imports no package and fetches no data. 2. Publish the directory with OmneExtensions publish with params {"id":"publish-clock-1","category":"plugin","name":"clock","dir":"clock"}: id is a text of your own for this one publish (after an unknown answer, send it again with the same id), name is the name in plugin.json, dir is the directory of step 1; OmneExtensions help with params {"name":"publish","category":"plugin"} gives the layout. 3. Put it on the sheet with Canvas place with params {"reference":{"kind":"canvas.app","ref":"clock"}}: the ref is the key of the member.',
  'A failure starts with the outcome, then the reason and the item or pile it is about, then says what to do.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: canvasAdoption,
    value: {
      identity: {
        id: '@omne-harness/canvas-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/canvas-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: canvasAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/canvas-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Canvas',
  encoding: ENCODING,
  guide,
  commands: canvasCommandNames.map(name => ({
    name,
    summary: canvasSummaries[name],
    parameters: { kind: 'declared', value: canvasContract(name) },
    returns,
  })),
}

const UNREACHABLE = {
  unattached: 'the canvas is not attached to this call',
  unavailable: 'the canvas is not available now; nothing was changed. Try again later.',
  forbidden: 'this call does not act for the tenant of the canvas',
} as const

/** One call is one read or one write of the canvas: what the canvas answers is the answer. */
export async function answerCanvas(
  args: CanvasArguments,
  execution: Pick<ToolExecutionContext, 'signal'>,
): Promise<Answer> {
  if (args.command === 'help') {
    const { name } = args.params
    return succeed(
      `done Canvas help${name === undefined ? '' : ` ${name}`}\n${commandGuide(menu, name)}`,
    )
  }
  const bound = canvasOf(execution)
  if (bound === undefined) return unavailable(args.command, UNREACHABLE.unattached)
  const reached = await bound.reach()
  if ('unreachable' in reached) return unavailable(args.command, UNREACHABLE[reached.unreachable])
  const handler = HANDLERS[args.command] as Handler<Reaching>
  return handler(reached, args.params)
}

/** A failed answer is thrown with its reason: the call fails with that reason as its result. */
export const canvasExecutor = {
  async execute(args: CanvasArguments, _environment: null, context: ToolExecutionContext) {
    const answer = await answerCanvas(args, context)
    if ('failure' in answer) throw new Error(answer.failure.reason)
    return answer.ok
  },
}

const constructionSchema = z.strictObject({ resultMaxBytes: z.int().min(64) })

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: CanvasCommandName, maximum: number) {
  return defineToolOperation<
    CanvasArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: canvasContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: canvasParameterCodec(name),
      waits: [],
      executor: canvasExecutor,
      codec: {
        adoption: canvasAdoption,
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
        adoption: canvasAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the Canvas result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
    ...(CANVAS_GATE_OF[name] === 'lock' ? { describeRelease: describeLocking } : {}),
  })
}

export function createCanvasAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({ field: 'construction', reason: 'Canvas takes only resultMaxBytes, at least 64' })
  const operations: Record<
    string,
    {
      summary: string
      operation: Operation
      release: Readonly<{ gate: string }>
      readOnly: boolean
    }
  > = {}
  for (const name of canvasCommandNames) {
    const operation = operationOf(name, read.data.resultMaxBytes)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = {
      summary: canvasSummaries[name],
      operation: operation.ok,
      release: { gate: CANVAS_GATE_OF[name] },
      readOnly: CANVAS_GATE_OF[name] === 'read',
    }
  }
  const author = defineCommandTool({
    gates: CANVAS_GATES,
    implementation: {
      description:
        'Look at and arrange the canvas the user shares with you: put references to things on it, move, resize, pile, scatter and take them off.',
      backgroundAllowed: false,
      declarations: {
        adoption: canvasAdoption,
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

export const canvasToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/canvas-tools',
    name: 'Canvas',
    revision: '1',
    changes:
      'Commands over the canvas attached to the call, the same operations people call through canvas/v1; who moved a thing comes from the call.',
  }),
  createAuthor: createCanvasAuthor,
}
