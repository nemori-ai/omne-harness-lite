import type {
  FacilityResult,
  ScreenFrame,
  ScreenInfo,
} from '@omne-harness/execution-environment-contract'
import { open, type ImageBudget } from '@omne-harness/image'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createAuthor, type CommandGates } from './author.ts'
import { screenCommands } from './commands.ts'
import type { ScreenAuthorEnvironment } from './environment.ts'
import {
  imageBudgetFields,
  imageBudgetOf,
  limitField,
  PICTURE_REFUSALS,
  pictureResult,
  unstored,
  type PictureAnswer,
} from './pictures.ts'
import { parseConstruction, type Arguments } from './protocol.ts'
import { confirmation } from './text.ts'

type Limits = Readonly<{ longSide: number; budget: ImageBudget }>

const SCREEN_GATES: CommandGates = {
  gates: [
    { id: 'read', title: '查看用法', default: 'auto' },
    { id: 'observe', title: '看屏幕', default: 'ask' },
  ],
  of: { help: 'read', screens: 'observe', capture: 'observe' },
}

const NOT_PERMITTED = [
  'rejected reason=notAuthorized the system has not permitted reading the screen.',
  'On macOS the permission is Screen Recording (System Settings > Privacy & Security > Screen Recording),',
  'held by the application that started this server: the terminal or editor it was started from (Terminal, iTerm, Visual Studio Code) or the app that runs it.',
  'Turn it on for that application and restart it.',
].join(' ')

/** What the facility answered when it gave nothing, as one line. */
function refused(answer: Exclude<FacilityResult<unknown>, { kind: 'done' }>, named: string | null) {
  if (answer.kind !== 'rejected') return confirmation(answer, () => '')
  if (answer.reason === 'notAuthorized') return NOT_PERMITTED
  if (answer.reason === 'notFound' && named !== null)
    return `rejected reason=notFound screen=${JSON.stringify(named)} is not a screen of this machine; list them with screens`
  return confirmation(answer, () => '')
}

const lineOf = ({ id, name, primary, pixels, scale, origin }: ScreenInfo) =>
  `screen=${JSON.stringify(id)} name=${JSON.stringify(name)} primary=${String(primary)} pixels=${pixels.width}x${pixels.height} scale=${scale} origin=${origin.x},${origin.y}`

async function listScreens(environment: ScreenAuthorEnvironment): Promise<string> {
  const answer = await environment.screen.list({})
  return answer.kind === 'done'
    ? ['done Screen screens', ...answer.value.map(lineOf)].join('\n')
    : refused(answer, null)
}

/** The size a frame is sent at: as it is within the limit, else smaller in proportion. */
function fitted(width: number, height: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    smaller: scale < 1,
  }
}

/** A frame within the image budget and the size limit, as PNG bytes; or why it is not. */
async function prepared(frame: ScreenFrame, limits: Limits) {
  const picture = await open({ bytes: frame.image.bytes, budget: limits.budget })
  if (picture.kind !== 'opened') return PICTURE_REFUSALS[picture.reason]
  try {
    const { orientedWidth, orientedHeight } = picture.declaration
    const { width, height, smaller } = fitted(orientedWidth, orientedHeight, limits.longSide)
    if (!smaller) return { bytes: picture.verifiedBytes, width, height }
    const encoded = await picture.handle.encode({ format: 'png', width, height })
    return encoded.kind === 'encoded' ? { bytes: encoded.bytes, width, height } : 'damaged'
  } finally {
    await picture.handle.close()
  }
}

async function captureScreen(
  args: Arguments,
  environment: ScreenAuthorEnvironment,
  limits: Limits,
): Promise<PictureAnswer> {
  const named = args.optionalText('screen') ?? null
  const answer = await environment.screen.capture({ screen: named, region: null })
  if (answer.kind !== 'done') return { text: refused(answer, named) }
  const { screen, takenAt } = answer.value
  const subject = `screen=${JSON.stringify(screen.id)}`
  const image = await prepared(answer.value, limits)
  if (typeof image === 'string') return { text: `rejected reason=${image} ${subject}` }
  const stored = await environment.media.put({ mediaType: 'image/png', bytes: image.bytes })
  if ('failure' in stored) return { text: unstored(stored.failure, subject) }
  const { pixels, scale, name } = screen
  return {
    text: `done Screen capture ${subject} name=${JSON.stringify(name)} screen_pixels=${pixels.width}x${pixels.height} scale=${scale} image_pixels=${image.width}x${image.height} taken_at=${takenAt}`,
    product: stored.ok,
  }
}

const GUIDE =
  'Screen reads what is on the screens of the machine the session works on; it changes nothing there. screens lists them. capture takes one frame of the primary screen, or of the screen named by its identifier, and returns it for the model to see. The line after the picture gives the coordinate system: a point (x, y) of the picture is the point (x * screen_pixels.width / image_pixels.width, y * screen_pixels.height / image_pixels.height) of the screen, in its physical pixels; divided by scale and moved by the origin screens gives, it is a point of the desktop in logical points. An identifier that is not listed is refused, never replaced by the primary screen.'

export function createScreenAuthor(
  construction: JsonValue,
): ReturnType<
  ToolImplementationModule<ScreenAuthorEnvironment, ToolMessageContentBlock>['createAuthor']
> {
  const parsed = parseConstruction(construction, [
    limitField('resultMaxBytes', 'Required positive safe integer for the complete returned text.'),
    limitField(
      'captureMaxLongSide',
      'Required positive safe integer: the longer side of a sent frame.',
    ),
    ...imageBudgetFields,
  ])
  if ('failure' in parsed) return fail({ field: 'construction', reason: parsed.failure.reason })
  const number = (name: string, minimum: number) => parsed.ok.number(name, minimum)
  const limits: Limits = {
    longSide: number('captureMaxLongSide', 1),
    budget: imageBudgetOf(number),
  }
  return succeed(
    createAuthor<ScreenAuthorEnvironment>(
      'Screen',
      'See what is on the screens of the machine: list the screens, or take a picture of one.',
      screenCommands,
      ['screen'],
      number('resultMaxBytes', 1),
      GUIDE,
      (_command, _args, environment) => listScreens(environment),
      {
        gates: SCREEN_GATES,
        structured: {
          capture: {
            modalities: ['image'],
            execute: async (args, environment) =>
              pictureResult(
                'Screen.capture',
                await captureScreen(args, environment, limits),
                'image',
              ),
          },
        },
      },
    ),
  )
}

export const screenToolModule: ToolImplementationModule<
  ScreenAuthorEnvironment,
  ToolMessageContentBlock
> = {
  executor: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'Screen',
    revision: '1',
    returns: 'screens returns text; capture returns one picture reference and one line of text.',
    commands: screenCommands,
  }),
  createAuthor: createScreenAuthor,
}
