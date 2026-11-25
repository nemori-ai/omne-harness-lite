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

/** The whole of what the shell hands the desk page to draw; points are logical points on the screen. */
export type Scene = Readonly<{
  lease: number
  serial: number
  look: Look
  figure: SceneFigure
  where: SceneWhere
  label: readonly FigureLabelLine[] | null
}>

export type Handover = 'painted' | 'arrived' | 'cleared'
export type DeskInput = 'lift' | 'move' | 'drop' | 'cancel' | 'click' | 'double'

/** From the shell to the desk page. */
export type Down =
  | Readonly<{ kind: 'scene'; scene: Scene }>
  | Readonly<{ kind: 'hand'; lease: number; at: Point }>

/** From the desk page to the shell. */
export type Up =
  | Readonly<{ kind: Handover; lease: number; serial: number }>
  | Readonly<{ kind: 'input'; lease: number; input: DeskInput; at: Point | null }>
  | Readonly<{ kind: 'hello' }>

const HANDOVERS: readonly string[] = ['painted', 'arrived', 'cleared']
const INPUTS: readonly string[] = ['lift', 'move', 'drop', 'cancel', 'click', 'double']
const MODES: readonly string[] = ['none', 'hand', 'rest', 'home']

type Fields = Readonly<Record<string, unknown>>
const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined
const isNumber = (value: unknown): value is number => Number.isFinite(value)
const isPoint = (value: unknown): value is Point =>
  isNumber(fields(value)?.['x']) && isNumber(fields(value)?.['y'])

function isScene(value: unknown): value is Scene {
  const scene = fields(value)
  const where = fields(scene?.['where'])
  return (
    scene !== undefined &&
    isNumber(scene['lease']) &&
    isNumber(scene['serial']) &&
    fields(scene['look']) !== undefined &&
    fields(scene['figure']) !== undefined &&
    MODES.includes(String(where?.['mode'])) &&
    (where?.['mode'] === 'none' || isPoint(where?.['at']))
  )
}

export function readDown(data: unknown): Down | undefined {
  const message = fields(data)
  if (message?.['kind'] === 'scene' && isScene(message['scene'])) return message as Down
  if (message?.['kind'] === 'hand' && isNumber(message['lease']) && isPoint(message['at']))
    return message as Down
  return undefined
}

export function readUp(data: unknown): Up | undefined {
  const message = fields(data)
  const kind = String(message?.['kind'])
  if (message === undefined) return undefined
  if (kind === 'hello') return { kind: 'hello' }
  if (HANDOVERS.includes(kind) && isNumber(message['lease']) && isNumber(message['serial']))
    return message as Up
  if (
    kind === 'input' &&
    isNumber(message['lease']) &&
    INPUTS.includes(String(message['input'])) &&
    (message['at'] === null || isPoint(message['at']))
  )
    return message as Up
  return undefined
}

/** Whether a scene is newer than the one held: a later lease, or a later serial in the same lease. */
export const newer = (scene: Scene, held: Scene | null): boolean =>
  held === null ||
  scene.lease > held.lease ||
  (scene.lease === held.lease && scene.serial > held.serial)
