type Spot = Readonly<{ x: number; y: number }>
type Size = Readonly<{ width: number; height: number }>

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
  }
}

type Answer = Readonly<{ outcome: string; body?: unknown }>

const CONFLICT_TEXT: Readonly<Record<string, string>> = {
  locked: '它锁着，先解开才能动。',
  taken: '它已经被拿走了。',
  'in-pile': '它在一叠里，先从这一叠拿出来。',
  'kind-undeclared': '这一类现在没有声明。',
  full: '纸上摆满了，先拿走几样。',
  'not-admitted': '它的拥有者没有接受它。',
}

const INVALID_TEXT: Readonly<Record<string, string>> = {
  size: '这个大小超出了能摆的范围。',
  spot: '这个位置不在纸上。',
}

export const UNKNOWN_TEXT = '不知道这一步做成了没有，纸上画的是刚读到的样子。'
const NOT_UNDERSTOOD = '画布没读懂这一步。'

function reasonOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const reason = (body as { reason?: unknown }).reason
  return typeof reason === 'string' ? reason : undefined
}

/** Why a command was not done, in one sentence; nothing when it was done or there was nothing to do. */
export function whyNot(answer: Answer): string | undefined {
  switch (answer.outcome) {
    case 'succeeded':
    case 'no-change':
      return undefined
    case 'conflict':
      return CONFLICT_TEXT[reasonOf(answer.body) ?? ''] ?? '现在的样子不允许这一步。'
    case 'not-found':
      return '纸上已经没有它了。'
    case 'invalid':
      return INVALID_TEXT[reasonOf(answer.body) ?? ''] ?? NOT_UNDERSTOOD
    case 'denied':
      return '没有权限改这张画布。'
    case 'basis-unavailable':
      return '现在改不了画布，过一会再试。'
    case 'unknown':
    case 'uncertain':
      return UNKNOWN_TEXT
    case 'unavailable':
      return '现在连不上画布，这一步没有发出去。'
    default:
      return NOT_UNDERSTOOD
  }
}
