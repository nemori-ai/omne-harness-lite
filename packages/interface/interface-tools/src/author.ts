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
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'
import { appViewOf, type LookAsked, type Looked } from './port.ts'
import {
  appViewAdoption,
  lookContract,
  lookParameterCodec,
  modeOfArguments,
  type LookArguments,
} from './protocol.ts'

export const APP_VIEW = 'AppView'

const GATES: readonly ToolGate[] = [{ id: 'invoke', title: '看界面', default: 'auto' }]

const GUIDE = [
  'AppView look takes a picture of one page of this app, as it would be drawn for this tenant in the mode you name, in a place nobody sees: the page the person is on, what they typed and their own choices do not change. It needs the desktop app to be open; when it is not, it says so and gives no picture.',
  'The ids of the pages are the keys on shell.pages: OmneExtensionPoints show shell.pages lists them, a page a plugin brings among them. Not giving a mode is the light theme, the standard text size, the built-in look, 1280 by 800.',
  'The line after the picture names the page and the mode. When the app cannot draw it, the line says why: no-page, no-skin, bad-mode, not-settled (the page did not finish drawing in time) or unsupported.',
].join('\n\n')

const VISIBLE = { toHuman: true, toModel: true }

function block(value: unknown): ToolMessageContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new TypeError(`Invalid AppView block: ${judged.rejected}`)
  return judged.ok as ToolMessageContentBlock
}

function resultOf(text: string, product?: ToolMediaProduct): ToolResult<ToolMessageContentBlock> {
  const line = block({ kind: 'text', id: 'AppView.look.text', visibility: VISIBLE, text })
  const picture =
    product === undefined
      ? []
      : [
          block({
            kind: 'image',
            id: 'AppView.look.image',
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
    const { width, height } = looked.image
    return resultOf(
      `done AppView look ${subject} image_pixels=${String(width)}x${String(height)}`,
      stored.ok,
    )
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
  const asked: LookAsked = { page, mode, ...(subject !== undefined && { subject }) }
  if (source === undefined) return resultOf(`unavailable reason=unbound ${subjectOf(asked)}`)
  return answered(await source.look(asked, execution.signal), asked, budget, source.media)
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
  const operation = defineToolOperation({
    parameters: { kind: 'declared', value: lookContract() },
    returns: {
      kind: 'structured',
      value: { kind: 'tool-result', contract: codec.adoption },
      program: { kind: 'none' },
      body: textBody,
      offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
    },
    author: {
      kind: 'structured',
      parameters: lookParameterCodec(),
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
        execute: (args: LookArguments, _environment: null, execution: ToolExecutionContext) =>
          look(args, execution, created.budget),
      },
    },
  })
  if ('failure' in operation)
    return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
  const author = defineCommandTool({
    gates: GATES,
    implementation: {
      description:
        'See one page of this app as a picture, in a mode you name (theme, text size, skin, size), without changing what the person sees.',
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
        operation: operation.ok,
        release: { gate: 'invoke' },
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
    revision: '1',
    changes:
      'One read-only command: a page of the app in a mode, asked of a client of the tenant of the call, its picture kept as a product of the call.',
  }),
  createAuthor: createAppViewAuthor,
}
