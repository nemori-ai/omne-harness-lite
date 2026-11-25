import type { Doing, FigureLabelLine, FigureMoment, SizeTier } from '@omne-harness/ui-kit'

export const FIGURE_CHANNEL = 'omne.figure'

export type Point = Readonly<{ x: number; y: number }>
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

export type Look = Readonly<{ theme: 'light' | 'dark'; size: SizeTier; reduced: boolean }>

export type SceneFigure = Readonly<{
  doing?: Doing | undefined
  moment?: FigureMoment | undefined
  waiting: number
}>

export type SceneWhere =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'hand' | 'rest' | 'home'; at: Point }>

export type NoteTo = Readonly<{ kind: 'new' }> | Readonly<{ kind: 'target'; key: string }>
export type NoteTarget = Readonly<{ key: string; label: string }>
export type NoteFate =
  | Readonly<{ kind: 'sending' | 'accepted' | 'unknown' }>
  | Readonly<{ kind: 'failed'; reason: string }>

/** The say note: `targets` null when who can be spoken to cannot be read now; `to` is the default. */
export type SceneNote = Readonly<{
  targets: readonly NoteTarget[] | null
  to: NoteTo
  fate: NoteFate | null
}>

/** The whole of what the shell hands the desk page to draw; points are logical points on the screen. */
export type Scene = Readonly<{
  lease: number
  serial: number
  look: Look
  figure: SceneFigure
  where: SceneWhere
  label: readonly FigureLabelLine[] | null
  note: SceneNote | null
}>

export type Handover = 'painted' | 'arrived' | 'cleared'
export type DeskInput = 'lift' | 'move' | 'drop' | 'cancel' | 'click' | 'double' | 'close' | 'show'

/** From the shell to the desk page. */
export type Down =
  | Readonly<{ kind: 'scene'; scene: Scene }>
  | Readonly<{ kind: 'hand'; lease: number; at: Point }>

/** From the desk page to the shell. */
export type Up =
  | Readonly<{ kind: Handover; lease: number; serial: number }>
  | Readonly<{ kind: 'input'; lease: number; input: DeskInput; at: Point | null }>
  | Readonly<{ kind: 'input'; lease: number; input: 'send'; words: string; to: NoteTo }>
  | Readonly<{ kind: 'hello' }>

const HANDOVERS: readonly string[] = ['painted', 'arrived', 'cleared']
const INPUTS: readonly string[] = [
  'lift',
  'move',
  'drop',
  'cancel',
  'click',
  'double',
  'close',
  'show',
]
const MODES: readonly string[] = ['none', 'hand', 'rest', 'home']

type Fields = Readonly<Record<string, unknown>>
const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined
const isNumber = (value: unknown): value is number => Number.isFinite(value)
const isPoint = (value: unknown): value is Point =>
  isNumber(fields(value)?.['x']) && isNumber(fields(value)?.['y'])
const isTo = (value: unknown): value is NoteTo =>
  fields(value)?.['kind'] === 'new' ||
  (fields(value)?.['kind'] === 'target' && typeof fields(value)?.['key'] === 'string')

const isWhere = (value: unknown): value is SceneWhere => {
  const where = fields(value)
  return (
    MODES.includes(String(where?.['mode'])) &&
    (where?.['mode'] === 'none' || isPoint(where?.['at']))
  )
}

function isScene(value: unknown): value is Scene {
  const scene = fields(value)
  return (
    scene !== undefined &&
    isNumber(scene['lease']) &&
    isNumber(scene['serial']) &&
    fields(scene['look']) !== undefined &&
    fields(scene['figure']) !== undefined &&
    isWhere(scene['where'])
  )
}

export function readDown(data: unknown): Down | undefined {
  const message = fields(data)
  if (message?.['kind'] === 'scene' && isScene(message['scene'])) return message as Down
  if (message?.['kind'] === 'hand' && isNumber(message['lease']) && isPoint(message['at']))
    return message as Down
  return undefined
}

const isSend = (kind: string, message: Fields): boolean =>
  kind === 'input' &&
  message['input'] === 'send' &&
  isNumber(message['lease']) &&
  typeof message['words'] === 'string' &&
  isTo(message['to'])

const isHandover = (kind: string, message: Fields): boolean =>
  HANDOVERS.includes(kind) && isNumber(message['lease']) && isNumber(message['serial'])

const isInput = (kind: string, message: Fields): boolean =>
  kind === 'input' &&
  isNumber(message['lease']) &&
  INPUTS.includes(String(message['input'])) &&
  (message['at'] === null || isPoint(message['at']))

export function readUp(data: unknown): Up | undefined {
  const message = fields(data)
  if (message === undefined) return undefined
  const kind = String(message['kind'])
  if (kind === 'hello') return { kind: 'hello' }
  const known = isSend(kind, message) || isHandover(kind, message) || isInput(kind, message)
  return known ? (message as Up) : undefined
}

/** Whether a scene is newer than the one held: a later lease, or a later serial in the same lease. */
export const newer = (scene: Scene, held: Scene | null): boolean =>
  held === null ||
  scene.lease > held.lease ||
  (scene.lease === held.lease && scene.serial > held.serial)
