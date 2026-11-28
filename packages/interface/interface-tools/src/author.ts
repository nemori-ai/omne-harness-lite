import { judgeContentBlock } from '@omne-harness/content-block'
import { imageBudget, open, type ImageBudget } from '@omne-harness/image'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import type { ToolGate, ToolResult } from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type ToolExecutionContext,
  type ToolImplementationModule,
  type ToolMediaProduct,
  type ToolMessageContentBlock,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'
import { appViewOf, type LookAsked, type Looked, type NowAsked, type Nowed } from './port.ts'
import {
  appViewAdoption,
  lookContract,
  lookParameterCodec,
  modeOfArguments,
  nowContract,
  nowParameterCodec,
  untilOf,
  type LookArguments,
  type NowArguments,
  type NowCommand,
} from './protocol.ts'
import { structureLines, waitedLine } from './structure.ts'

export const APP_VIEW = 'AppView'

const GATES: readonly ToolGate[] = [
  { id: 'invoke', title: '看界面', default: 'auto' },
  { id: 'inspect', title: '看此刻', default: 'auto' },
  { id: 'shot', title: '截此刻', default: 'auto' },
]

const GUIDE = [
  'AppView look takes a picture of one page of this app, as it would be drawn for this tenant in the mode you name, in a place nobody sees: the page the person is on, what they typed and their own choices do not change. It needs the desktop app to be open; when it is not, it says so and gives no picture.',
  'The ids of the pages are the keys on shell.pages: OmneExtensionPoints show shell.pages lists them, a page a plugin brings among them. Not giving a mode is the light theme, the standard text size, the built-in look, 1280 by 800.',
  'The line after the picture names the page and the mode. When the app cannot draw it, the line says why: no-page, no-skin, bad-mode, not-settled (the page did not finish drawing in time) or unsupported.',
  'AppView inspect reads what the person sees right now, in the window they use: each part drawn with its text and its box, and any dialog, alert or menu open on top. AppView shot is a picture of that window now; with part, of that part only. Neither changes the page, the focus or what the person typed.',
  'Every command takes part, to keep to one part and what is in it, and wait_for (with wait_text and wait, in seconds), to wait until a part is drawn before answering; when it does not come in time, the answer says so and shows what was drawn then.',
].join('\n\n')

const VISIBLE = { toHuman: true, toModel: true }

function block(value: unknown): ToolMessageContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new TypeError(`Invalid AppView block: ${judged.rejected}`)
  return judged.ok as ToolMessageContentBlock
}

function resultOf(
  text: string,
  product?: ToolMediaProduct,
  command: 'look' | NowCommand = 'look',
): ToolResult<ToolMessageContentBlock> {
  const line = block({ kind: 'text', id: `AppView.${command}.text`, visibility: VISIBLE, text })
  const picture =
    product === undefined
      ? []
      : [
          block({
            kind: 'image',
            id: `AppView.${command}.image`,
            visibility: VISIBLE,
            ref: product.ref,
            transcript: null,
            facts: product.facts,
          }),
        ]
  return {
    content: [line, ...picture],
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }
}

const subjectOf = (asked: LookAsked): string => {
  const { theme, size, look, width, height } = asked.mode
  const skin = look.kind === 'skin' ? ` skin=${JSON.stringify(look.name)}` : ''
  const subject = asked.subject === undefined ? '' : ` subject=${JSON.stringify(asked.subject)}`
  return `page=${JSON.stringify(asked.page)}${subject} theme=${theme} size=${size}${skin} viewport=${String(width)}x${String(height)}`
}

/** The answer of the application, as the line the model reads and, for a picture within the budget, the picture kept as a product. */
async function answered(
  looked: Looked,
  asked: LookAsked,
  budget: ImageBudget,
  media: NonNullable<ReturnType<typeof appViewOf>>['media'],
): Promise<ToolResult<ToolMessageContentBlock>> {
  const subject = subjectOf(asked)
  if (looked.kind === 'client-absent')
    return resultOf(
      `unavailable reason=client-absent ${subject} no desktop app of this tenant is open; ask the person to open it`,
    )
  if (looked.kind === 'unavailable')
    return resultOf(
      `unavailable reason=${looked.why} ${subject} the app gave no picture; asking again is safe`,
    )
  if (looked.kind === 'cancelled') return resultOf(`cancelled ${subject}`)
  if (looked.kind === 'cannot') return resultOf(`rejected reason=${looked.reason} ${subject}`)
  const picture = await open({ bytes: looked.image.bytes, budget })
  if (picture.kind !== 'opened')
    return resultOf(`rejected reason=over-budget ${subject} ${picture.reason}`)
  try {
    const stored = await media.put({ mediaType: 'image/png', bytes: picture.verifiedBytes })
    if ('failure' in stored)
      return resultOf(
        `unavailable reason=unstored ${subject} the picture was not kept: ${stored.failure.reason}`,
      )
    const { width, height, structure } = looked.image
    const head = `done AppView look ${subject} image_pixels=${String(width)}x${String(height)}`
    const read =
      structure === undefined
        ? []
        : [
            ...waitedLine(
              asked.until,
              structure.parts.some(each => each.part === asked.until?.part),
            ),
            ...structureLines(structure, asked.part),
          ]
    return resultOf([head, ...read].join('\n'), stored.ok)
  } finally {
    await picture.handle.close()
  }
}

async function look(
  args: LookArguments,
  execution: ToolExecutionContext,
  budget: ImageBudget,
): Promise<ToolResult<ToolMessageContentBlock>> {
  const source = appViewOf(execution)
  const mode = modeOfArguments(args.params)
  const { page, subject } = args.params
  if (mode === 'bad-mode')
    return resultOf(
      `rejected reason=bad-mode page=${JSON.stringify(page)} width is 320 to 2560 and height 240 to 2560, whole pixels`,
    )
  const until = untilOf(args.params)
  if (typeof until === 'string') return resultOf(`rejected reason=bad-wait ${until}`)
  const { part } = args.params
  const asked: LookAsked = {
    page,
    mode,
    ...(subject !== undefined && { subject }),
    ...(part !== undefined && { part }),
    ...(until !== undefined && { until }),
  }
  if (source === undefined) return resultOf(`unavailable reason=unbound ${subjectOf(asked)}`)
  return answered(await source.look(asked, execution.signal), asked, budget, source.media)
}

const nowSubjectOf = (asked: NowAsked): string =>
  [
    ...(asked.part === undefined ? [] : [`part=${JSON.stringify(asked.part)}`]),
    ...(asked.until === undefined ? [] : [`wait_for=${JSON.stringify(asked.until.part)}`]),
  ].join(' ')

/** Why a question of now has no answer, as the line the model reads. */
function unanswered(command: NowCommand, nowed: Exclude<Nowed, { kind: 'seen' }>, subject: string) {
  const said = (text: string) => resultOf(text, undefined, command)
  if (nowed.kind === 'client-absent')
    return said(
      `unavailable reason=client-absent ${subject} no desktop app of this tenant is open; ask the person to open it`.trim(),
    )
  if (nowed.kind === 'unavailable')
    return said(
      `unavailable reason=${nowed.why} ${subject} the app gave no answer; asking again is safe`,
    )
  if (nowed.kind === 'cancelled') return said(`cancelled ${subject}`.trim())
  if (nowed.reason === 'unsupported')
    return said(
      `rejected reason=unsupported ${subject} the open app cannot answer this: it is older than this command, or no window of it is in use`,
    )
  return said(`rejected reason=${nowed.reason} ${subject}`.trim())
}

/** What the person sees now: its structure for inspect, a picture of the window or of one part for shot. */
async function now(
  args: NowArguments,
  execution: ToolExecutionContext,
  budget: ImageBudget,
): Promise<ToolResult<ToolMessageContentBlock>> {
  const { command } = args
  const source = appViewOf(execution)
  const until = untilOf(args.params)
  if (typeof until === 'string')
    return resultOf(`rejected reason=bad-wait ${until}`, undefined, command)
  const { part } = args.params
  const asked: NowAsked = {
    want: command === 'inspect' ? 'structure' : 'image',
    ...(part !== undefined && { part }),
    ...(until !== undefined && { until }),
  }
  const subject = nowSubjectOf(asked)
  if (source === undefined)
    return resultOf(`unavailable reason=unbound ${subject}`.trim(), undefined, command)
  const nowed = await source.now(asked, execution.signal)
  if (nowed.kind !== 'seen') return unanswered(command, nowed, subject)
  const waited = waitedLine(asked.until, nowed.met)
  if (command === 'inspect') {
    const { structure } = nowed
    if (structure === undefined)
      return resultOf(`rejected reason=not-settled ${subject}`.trim(), undefined, command)
    const lines = [`done AppView inspect ${subject}`.trim(), ...waited]
    return resultOf([...lines, ...structureLines(structure, part)].join('\n'), undefined, command)
  }
  if (nowed.image === undefined)
    return resultOf(`rejected reason=not-settled ${subject}`.trim(), undefined, command)
  const picture = await open({ bytes: nowed.image.bytes, budget })
  if (picture.kind !== 'opened')
    return resultOf(`rejected reason=over-budget ${subject} ${picture.reason}`, undefined, command)
  try {
    const stored = await source.media.put({ mediaType: 'image/png', bytes: picture.verifiedBytes })
    if ('failure' in stored)
      return resultOf(
        `unavailable reason=unstored ${subject} the picture was not kept: ${stored.failure.reason}`,
        undefined,
        command,
      )
    const missing =
      part !== undefined && nowed.structure?.parts.length === 0
        ? [`there is no part ${JSON.stringify(part)} drawn now: this is the whole window`]
        : []
    const { width, height } = nowed.image
    const head = `done AppView shot ${subject} image_pixels=${String(width)}x${String(height)}`
    return resultOf([head.replace('  ', ' '), ...waited, ...missing].join('\n'), stored.ok, command)
  } finally {
    await picture.handle.close()
  }
}

const constructionSchema = z.strictObject({
  resultMaxBytes: z.int().min(64),
  imageMaxWidth: z.int().min(1),
  imageMaxHeight: z.int().min(1),
  imageMaxDecodedBytes: z.int().min(1),
  imageConcurrency: z.int().min(1),
})

const textBody = {
  kind: 'text',
  codec: describedAdoption({
    owner: '@omne-harness/interface-tools',
    name: 'utf8-text-body',
    revision: '1',
    encoding: 'UTF-8',
  }),
} as const

export function createAppViewAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const read = constructionSchema.safeParse(JSON.parse(writeJsonText(construction)))
  if (!read.success)
    return fail({
      field: 'construction',
      reason:
        'AppView takes resultMaxBytes and the image budget: imageMaxWidth, imageMaxHeight, imageMaxDecodedBytes, imageConcurrency',
    })
  const { resultMaxBytes, imageMaxWidth, imageMaxHeight, imageMaxDecodedBytes, imageConcurrency } =
    read.data
  const created = imageBudget({
    formats: ['image/png'],
    maxWidth: imageMaxWidth,
    maxHeight: imageMaxHeight,
    maxDecodedBytes: imageMaxDecodedBytes,
    maxConcurrentDecodes: imageConcurrency,
    maxInFlightBytes: imageMaxDecodedBytes * imageConcurrency,
  })
  if (created.kind !== 'budget')
    return fail({ field: 'construction', reason: `image budget: ${created.reason}` })
  const codec = createToolMessageResultCodec(resultMaxBytes)
  const operationOf = <A>(
    contract: ReturnType<typeof lookContract>,
    parameters: ParameterCodec<A>,
    execute: (
      args: A,
      execution: ToolExecutionContext,
    ) => Promise<ToolResult<ToolMessageContentBlock>>,
  ) =>
    defineToolOperation({
      parameters: { kind: 'declared', value: contract },
      returns: {
        kind: 'structured',
        value: { kind: 'tool-result', contract: codec.adoption },
        program: { kind: 'none' },
        body: textBody,
        offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
      },
      author: {
        kind: 'structured',
        parameters,
        waits: [],
        codec,
        output: {
          adoption: appViewAdoption,
          check: ({ value }: { value: unknown }) => {
            const encoded = codec.encode(value)
            return 'failure' in encoded ? encoded : codec.decode(encoded.ok)
          },
        },
        program: { kind: 'none' },
        executor: {
          execute: (args: A, _environment: null, execution: ToolExecutionContext) =>
            execute(args, execution),
        },
      },
    })
  const looking = operationOf(lookContract(), lookParameterCodec(), (args, execution) =>
    look(args, execution, created.budget),
  )
  const inspecting = operationOf(nowContract(), nowParameterCodec('inspect'), (args, execution) =>
    now(args, execution, created.budget),
  )
  const shooting = operationOf(nowContract(), nowParameterCodec('shot'), (args, execution) =>
    now(args, execution, created.budget),
  )
  if ('failure' in looking)
    return fail({ field: 'commands', reason: JSON.stringify(looking.failure) })
  if ('failure' in inspecting)
    return fail({ field: 'commands', reason: JSON.stringify(inspecting.failure) })
  if ('failure' in shooting)
    return fail({ field: 'commands', reason: JSON.stringify(shooting.failure) })
  const author = defineCommandTool({
    gates: GATES,
    implementation: {
      description:
        'See this app: a page as a picture in a mode you name, or what the person sees now, as parts and text or as a picture, without changing what they see.',
      backgroundAllowed: false,
      declarations: {
        adoption: appViewAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: 'wrapped',
    guide: GUIDE,
    commands: {
      look: {
        summary: 'A picture of one page of this app in a mode, taken where nobody sees it.',
        operation: looking.ok,
        release: { gate: 'invoke' },
        readOnly: true,
        modalities: ['image'],
      },
      inspect: {
        summary:
          'What the person sees now: each part with its text and box, and dialogs open on top.',
        operation: inspecting.ok,
        release: { gate: 'inspect' },
        readOnly: true,
        modalities: ['text'],
      },
      shot: {
        summary: 'A picture of the window the person uses, now; with part, of that part only.',
        operation: shooting.ok,
        release: { gate: 'shot' },
        readOnly: true,
        modalities: ['image'],
      },
    },
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const appViewToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/interface-tools',
    name: APP_VIEW,
    revision: '2',
    changes:
      'Three read-only commands: a page of the app in a mode, and what the person sees now as a structure or a picture, asked of a client of the tenant of the call; a picture is kept as a product of the call.',
  }),
  createAuthor: createAppViewAuthor,
}
