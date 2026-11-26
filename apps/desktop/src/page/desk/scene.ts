import type { Doing, FigureLabelLine, FigureMoment, SizeTier } from '@omne-harness/ui-kit'

export const FIGURE_CHANNEL = 'omne.figure'

export type Point = Readonly<{ x: number; y: number }>
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

export type Look = Readonly<{ theme: 'light' | 'dark'; size: SizeTier; reduced: boolean }>

export type SceneLook = Look & Readonly<{ issuer: string; version: number }>

export type LookSource = Readonly<{ module: string; export: string; files?: string }>
export type LookDrawing = Readonly<{ point: string; key: string; source: LookSource }>

export type LookProjection = Readonly<{
  issuer: string
  version: number
  scope?: string
  css: string
  drawings: readonly LookDrawing[]
}>

export type DeskToast = Readonly<{
  id: string
  tone: 'info' | 'attention'
  title: string
  body?: string
  action?: Readonly<{ label: string; page: string; subject?: string }>
}>

export type SceneFigure = Readonly<{
  doing?: Doing | undefined
  moment?: FigureMoment | undefined
  waiting: number
}>

export type SceneWhere =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'hand' | 'rest'; at: Point }>
  | Readonly<{ mode: 'home'; at: Point; rewrite?: true }>

export type NoteTo = Readonly<{ kind: 'new' }> | Readonly<{ kind: 'target'; key: string }>
export type NoteTarget = Readonly<{ key: string; label: string }>
export type NoteFate =
  | Readonly<{ kind: 'sending' | 'accepted' | 'unknown' }>
  | Readonly<{ kind: 'failed'; reason: string }>

export type NotePicture = Readonly<{ id: string; name: string }>
export type NoteTold =
  | Readonly<{ kind: 'not-authorized' | 'cannot-send-pictures' }>
  | Readonly<{ kind: 'not-seen'; reason: string }>

/** The say note: `targets` null when who can be spoken to cannot be read; `to` is the default; pictures by id. */
export type SceneNote = Readonly<{
  targets: readonly NoteTarget[] | null
  to: NoteTo
  fate: NoteFate | null
  pictures?: readonly NotePicture[]
  told?: NoteTold
}>

export type SceneFrame = Readonly<{ rect: Rect; covered: readonly Rect[]; closed: boolean }>

/** What the shell hands the desk page to draw: points on the screen; a home `rewrite` rewrites the ring first. */
export type Scene = Readonly<{
  lease: number
  serial: number
  look: SceneLook
  figure: SceneFigure
  where: SceneWhere
  label: readonly FigureLabelLine[] | null
  note: SceneNote | null
  frame: SceneFrame | null
}>

export type Handover = 'painted' | 'arrived' | 'cleared'
export type DeskInput =
  | 'lift'
  | 'move'
  | 'drop'
  | 'cancel'
  | 'click'
  | 'double'
  | 'close'
  | 'show'
  | 'settings'

/** From the shell to the desk page. */
export type Down =
  | Readonly<{ kind: 'scene'; scene: Scene }>
  | Readonly<{ kind: 'hand'; lease: number; at: Point }>
  | Readonly<{ kind: 'picture'; id: string; bytes: Uint8Array<ArrayBuffer> }>

export type LookDown = Readonly<{ kind: 'look'; look: LookProjection }>

export type Asked =
  | Readonly<{
      kind: 'undrawn'
      issuer: string
      scope?: string
      point: string
      key: string
      module: string
      export: string
      reason: string
    }>
  | Readonly<{ kind: 'navigate'; issuer: string; scope: string; page: string; subject?: string }>
  | Readonly<{ kind: 'toast'; issuer: string; scope: string; toast: DeskToast }>

/** From the desk page to the shell. */
export type Up =
  | Readonly<{ kind: Handover; lease: number; serial: number }>
  | Readonly<{
      kind: 'input'
      lease: number
      input: DeskInput
      at: Point | null
      meta?: boolean
      shift?: boolean
    }>
  | Readonly<{
      kind: 'input'
      lease: number
      input: 'send'
      words: string
      to: NoteTo
      pictures?: readonly string[]
    }>
  | Readonly<{ kind: 'input'; lease: number; input: 'unpicture'; picture: string }>
  | Readonly<{ kind: 'hello' }>
  | Asked

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
  'settings',
]
const MODES: readonly string[] = ['none', 'hand', 'rest', 'home']

type Fields = Readonly<Record<string, unknown>>
const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined
const isNumber = (value: unknown): value is number => Number.isFinite(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const optional = (value: unknown, is: (value: unknown) => boolean): boolean =>
  value === undefined || is(value)
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

const isSceneLook = (value: unknown): boolean => {
  const look = fields(value)
  return look !== undefined && isText(look['issuer']) && isNumber(look['version'])
}

function isScene(value: unknown): value is Scene {
  const scene = fields(value)
  return (
    scene !== undefined &&
    isNumber(scene['lease']) &&
    isNumber(scene['serial']) &&
    isSceneLook(scene['look']) &&
    fields(scene['figure']) !== undefined &&
    isWhere(scene['where'])
  )
}

const isSource = (value: unknown): boolean => {
  const source = fields(value)
  return (
    source !== undefined &&
    isText(source['module']) &&
    isText(source['export']) &&
    optional(source['files'], isText)
  )
}

const isDrawing = (value: unknown): boolean => {
  const drawing = fields(value)
  return (
    drawing !== undefined &&
    isText(drawing['point']) &&
    isText(drawing['key']) &&
    isSource(drawing['source'])
  )
}

const isProjection = (value: unknown): boolean => {
  const look = fields(value)
  const drawings = look?.['drawings']
  return (
    look !== undefined &&
    isText(look['issuer']) &&
    isNumber(look['version']) &&
    optional(look['scope'], isText) &&
    isText(look['css']) &&
    Array.isArray(drawings) &&
    drawings.every(isDrawing)
  )
}

type Check = (message: Fields) => boolean

/** What a message down of each kind carries. */
const DOWNS = new Map<unknown, Check>([
  ['scene', message => isScene(message['scene'])],
  ['hand', message => isNumber(message['lease']) && isPoint(message['at'])],
  [
    'picture',
    message => typeof message['id'] === 'string' && message['bytes'] instanceof Uint8Array,
  ],
])

export function readDown(data: unknown): Down | undefined {
  const message = fields(data)
  const known = message === undefined ? undefined : DOWNS.get(message['kind'])?.(message)
  return known === true ? (message as Down) : undefined
}

export function readLook(data: unknown): LookDown | undefined {
  const message = fields(data)
  const known = message?.['kind'] === 'look' && isProjection(message['look'])
  return known ? (message as LookDown) : undefined
}

export function readIn(data: unknown, takeLook: (look: LookProjection) => void): Down | undefined {
  const projection = readLook(data)
  if (projection !== undefined) {
    takeLook(projection.look)
    return undefined
  }
  return readDown(data)
}

const isFlag = (value: unknown): boolean => typeof value === 'boolean'
const isIds = (value: unknown): boolean =>
  Array.isArray(value) && value.every(id => typeof id === 'string')

const isSend = (kind: string, message: Fields): boolean =>
  kind === 'input' &&
  message['input'] === 'send' &&
  isNumber(message['lease']) &&
  typeof message['words'] === 'string' &&
  isTo(message['to']) &&
  optional(message['pictures'], isIds)

const isUnpicture = (kind: string, message: Fields): boolean =>
  kind === 'input' &&
  message['input'] === 'unpicture' &&
  isNumber(message['lease']) &&
  typeof message['picture'] === 'string'

const isHandover = (kind: string, message: Fields): boolean =>
  HANDOVERS.includes(kind) && isNumber(message['lease']) && isNumber(message['serial'])

const UNDRAWN_FIELDS = ['issuer', 'point', 'key', 'module', 'export', 'reason']
const TONES: readonly unknown[] = ['info', 'attention']

const isUndrawn = (kind: string, message: Fields): boolean =>
  kind === 'undrawn' &&
  UNDRAWN_FIELDS.every(name => isText(message[name])) &&
  optional(message['scope'], isText)

const isTenants = (message: Fields): boolean =>
  isText(message['issuer']) && isText(message['scope'])

const isNavigate = (kind: string, message: Fields): boolean =>
  kind === 'navigate' &&
  isTenants(message) &&
  isText(message['page']) &&
  optional(message['subject'], isText)

const isAction = (value: unknown): boolean => {
  const action = fields(value)
  return (
    action !== undefined &&
    isText(action['label']) &&
    isText(action['page']) &&
    optional(action['subject'], isText)
  )
}

const isToast = (value: unknown): boolean => {
  const toast = fields(value)
  return (
    toast !== undefined &&
    isText(toast['id']) &&
    TONES.includes(toast['tone']) &&
    isText(toast['title']) &&
    optional(toast['body'], isText) &&
    optional(toast['action'], isAction)
  )
}

const isTold = (kind: string, message: Fields): boolean =>
  kind === 'toast' && isTenants(message) && isToast(message['toast'])

const isInput = (kind: string, message: Fields): boolean =>
  kind === 'input' &&
  isNumber(message['lease']) &&
  INPUTS.includes(String(message['input'])) &&
  (message['at'] === null || isPoint(message['at'])) &&
  optional(message['meta'], isFlag) &&
  optional(message['shift'], isFlag)

export function readUp(data: unknown): Up | undefined {
  const message = fields(data)
  if (message === undefined) return undefined
  const kind = String(message['kind'])
  if (kind === 'hello') return { kind: 'hello' }
  const known =
    isSend(kind, message) ||
    isUnpicture(kind, message) ||
    isHandover(kind, message) ||
    isInput(kind, message) ||
    isUndrawn(kind, message) ||
    isNavigate(kind, message) ||
    isTold(kind, message)
  return known ? (message as Up) : undefined
}

/** Whether a scene is newer than the one held: a later lease, or a later serial in the same lease. */
export const newer = (scene: Scene, held: Scene | null): boolean =>
  held === null ||
  scene.lease > held.lease ||
  (scene.lease === held.lease && scene.serial > held.serial)
