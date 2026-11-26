import { type Box, type Placement } from './travel.ts'

export const NOTE_WIDTH = 360

export const NOTE_GAP = { x: 22, y: 11 } as const

export interface Spot {
  readonly left: number
  readonly top: number
}

export interface SayTarget {
  readonly id: string
  readonly name: string
}

export type SayFate =
  | { readonly kind: 'sending' }
  | { readonly kind: 'accepted' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'unknown' }

export interface SayPicture {
  readonly name: string
  readonly bytes: ArrayBuffer | Uint8Array<ArrayBuffer>
}

export type SayTold =
  | { readonly kind: 'not-authorized' }
  | { readonly kind: 'cannot-send-pictures' }
  | { readonly kind: 'not-seen'; readonly reason: string }

export interface SayNote {
  readonly targets: readonly SayTarget[] | undefined
  readonly target: string | undefined
  readonly text: string
  readonly fate?: SayFate | undefined
  readonly pictures?: readonly SayPicture[] | undefined
  readonly told?: SayTold | undefined
}

export interface SayWords {
  readonly to: string
  readonly field: string
  readonly close: string
  readonly send: string
  readonly open: string
  readonly accepted: string
  readonly failed: string
  readonly unknown: string
  readonly unreadable: string
  readonly notAuthorized: string
  readonly settings: string
  readonly noPictures: string
  readonly notSeen: string
  readonly drop: string
}

export const SAY_WORDS: SayWords = {
  to: '说给谁',
  field: '说一句话',
  close: '收起',
  send: '发送',
  open: '去对话页',
  accepted: '已发送',
  failed: '没有发出去：',
  unknown: '不知道有没有发出去，到对话页看一下',
  unreadable: '现在读不到可以说给谁',
  notAuthorized: '需要在系统设置里允许 omne 录制屏幕，才能看这个窗口',
  settings: '打开系统设置',
  noPictures: '现在发不了图',
  notSeen: '没能看这个窗口：',
  drop: '去掉',
}

export const hasWords = (text: string): boolean => text.trim() !== ''

export const hasPictures = (note: SayNote): boolean => (note.pictures?.length ?? 0) > 0

const sendsPictures = (note: SayNote): boolean =>
  hasPictures(note) && note.told?.kind !== 'cannot-send-pictures'

export const canSay = (note: SayNote): boolean =>
  (hasWords(note.text) || sendsPictures(note)) &&
  note.targets !== undefined &&
  note.target !== undefined &&
  note.fate?.kind !== 'sending'

export interface SayLine {
  readonly words: string
  readonly tone: 'quiet' | 'failed'
  readonly settings?: true
}

function toldLine(told: SayTold | undefined, words: SayWords): SayLine | null {
  if (told === undefined) return null
  if (told.kind === 'not-authorized')
    return { words: words.notAuthorized, tone: 'quiet', settings: true }
  if (told.kind === 'cannot-send-pictures') return { words: words.noPictures, tone: 'quiet' }
  return { words: `${words.notSeen}${told.reason}`, tone: 'failed' }
}

export function sayLine(note: SayNote, words: SayWords = SAY_WORDS): SayLine | null {
  if (note.targets === undefined) return { words: words.unreadable, tone: 'quiet' }
  const fate = note.fate
  if (fate === undefined || fate.kind === 'sending') return toldLine(note.told, words)
  if (fate.kind === 'accepted') return { words: words.accepted, tone: 'quiet' }
  if (fate.kind === 'failed') return { words: `${words.failed}${fate.reason}`, tone: 'failed' }
  return { words: words.unknown, tone: 'quiet' }
}

const centreOf = (box: Box): Placement => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

export function besideSpot(
  figure: Box,
  size: { readonly width: number; readonly height: number },
  bounds: Box,
): Spot {
  const { x, y } = centreOf(figure)
  const { width, height } = size
  const [right, left] = [x + NOTE_GAP.x, x - NOTE_GAP.x - width]
  const [below, above] = [y + NOTE_GAP.y, y - NOTE_GAP.y - height]
  const spots: readonly Spot[] = [
    { left: right, top: below },
    { left, top: below },
    { left: right, top: above },
    { left, top: above },
  ]
  const [x1, y1] = [bounds.x + bounds.width, bounds.y + bounds.height]
  const outside = (spot: Spot): number =>
    Math.max(0, bounds.x - spot.left) +
    Math.max(0, spot.left + width - x1) +
    Math.max(0, bounds.y - spot.top) +
    Math.max(0, spot.top + height - y1)
  const best =
    spots.find(spot => outside(spot) === 0) ??
    spots.reduce((was, spot) => (outside(spot) < outside(was) ? spot : was))
  return {
    left: Math.max(bounds.x, Math.min(x1 - width, best.left)),
    top: Math.max(bounds.y, Math.min(y1 - height, best.top)),
  }
}
