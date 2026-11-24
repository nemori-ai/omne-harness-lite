import type { CanvasItemBody } from '@omne-harness/canvas-protocol'

export type Spot = Readonly<{ x: number; y: number }>
export type Size = Readonly<{ width: number; height: number }>

export type ItemChange = Readonly<{
  item: string
  at?: Spot
  size?: Size | null
  top?: true
  pile?: string | null
}>

export type PileChange = Readonly<{ pile: string; at?: Spot; name?: string | null }>

/** A write of `canvas/v1`, without the tenant and the canvas: those are the driver's. */
export type Command =
  | Readonly<{
      op: 'arrange'
      body: Readonly<{ items?: readonly ItemChange[]; piles?: readonly PileChange[] }>
    }>
  | Readonly<{ op: 'take'; body: Readonly<{ items: readonly string[] }> }>
  | Readonly<{ op: 'pile'; body: Readonly<{ pile: string; items: readonly string[] }> }>
  | Readonly<{ op: 'scatter'; body: Readonly<{ pile: string }> }>
  | Readonly<{ op: 'lock'; body: Readonly<{ items: readonly string[]; locked: boolean }> }>
  | Readonly<{
      op: 'place'
      body: Readonly<{ reference: CanvasItemBody['reference']; near: Spot; size?: Size }>
    }>

export const itemKey = (item: string): string => `item:${item}`
export const pileKey = (pile: string): string => `pile:${pile}`

/** What a command is about: those are drawn as not settled until the sheet is read again after it. */
export function touched(command: Command): readonly string[] {
  switch (command.op) {
    case 'arrange':
      return [
        ...(command.body.items ?? []).flatMap(change => [
          itemKey(change.item),
          ...(typeof change.pile === 'string' ? [pileKey(change.pile)] : []),
        ]),
        ...(command.body.piles ?? []).map(change => pileKey(change.pile)),
      ]
    case 'pile':
      return [pileKey(command.body.pile), ...command.body.items.map(itemKey)]
    case 'scatter':
      return [pileKey(command.body.pile)]
    case 'take':
    case 'lock':
      return command.body.items.map(itemKey)
    case 'place':
      return []
  }
}

export type Answer = Readonly<{ outcome: string; body?: unknown }>

const CONFLICT_TEXT = new Map([
  ['locked', '它锁着，先解开才能动。'],
  ['taken', '它已经被拿走了。'],
  ['in-pile', '它在一叠里，先从这一叠拿出来。'],
  ['kind-undeclared', '这一类现在没有声明。'],
  ['full', '纸上摆满了，先拿走几样。'],
  ['not-admitted', '它的拥有者没有接受它。'],
])

const INVALID_TEXT = new Map([
  ['size', '这个大小超出了能摆的范围。'],
  ['spot', '这个位置不在纸上。'],
])

export const UNKNOWN_TEXT = '不知道这一步做成了没有，纸上画的是刚读到的样子。'
const NOT_UNDERSTOOD = '画布没读懂这一步。'

type ByReason = Readonly<{ reasons: ReadonlyMap<string, string>; otherwise: string }>

/** What each answer is said as: nothing when it was done, one sentence, or one sentence for each reason. */
const SAID = new Map<string, undefined | string | ByReason>([
  ['succeeded', undefined],
  ['no-change', undefined],
  ['conflict', { reasons: CONFLICT_TEXT, otherwise: '现在的样子不允许这一步。' }],
  ['not-found', '纸上已经没有它了。'],
  ['invalid', { reasons: INVALID_TEXT, otherwise: NOT_UNDERSTOOD }],
  ['denied', '没有权限改这张画布。'],
  ['basis-unavailable', '现在改不了画布，过一会再试。'],
  ['unknown', UNKNOWN_TEXT],
  ['uncertain', UNKNOWN_TEXT],
  ['unavailable', '现在连不上画布，这一步没有发出去。'],
])

function reasonOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const reason = (body as { reason?: unknown }).reason
  return typeof reason === 'string' ? reason : undefined
}

/** Why a command was not done, in one sentence; nothing when it was done or there was nothing to do. */
export function whyNot(answer: Answer): string | undefined {
  if (!SAID.has(answer.outcome)) return NOT_UNDERSTOOD
  const said = SAID.get(answer.outcome)
  if (typeof said !== 'object') return said
  return said.reasons.get(reasonOf(answer.body) ?? '') ?? said.otherwise
}

/** What putting a reference on the canvas came to: put there, lying there already, or not, and why. */
export type Placed =
  | Readonly<{ kind: 'placed'; item: CanvasItemBody }>
  | Readonly<{ kind: 'there'; item: CanvasItemBody }>
  | Readonly<{ kind: 'not'; why: string }>

/** An answer that never came back is not known, the same as `unknown`. */
export function placedOf(answer: Answer | undefined): Placed {
  if (answer === undefined) return { kind: 'not', why: UNKNOWN_TEXT }
  const item = (answer.body as { item?: CanvasItemBody } | undefined)?.item
  if (answer.outcome === 'succeeded' && item !== undefined) return { kind: 'placed', item }
  if (answer.outcome === 'no-change' && item !== undefined) return { kind: 'there', item }
  return { kind: 'not', why: whyNot(answer) ?? NOT_UNDERSTOOD }
}
