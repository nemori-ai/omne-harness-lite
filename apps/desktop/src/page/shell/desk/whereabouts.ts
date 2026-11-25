import type { Point, Rect, SceneWhere } from '../../desk/scene.ts'

type Side = 'page' | 'desk'

/** Where the figure is: one value, written only by the shell (apps/desktop/SPEC.md#桌面层). */
export type Whereabouts =
  | Readonly<{ at: 'seat' }>
  | Readonly<{ at: 'hand'; drawn: Side; on: Side }>
  | Readonly<{ at: 'desk'; spot: Point; note: boolean; waiting: boolean }>
  | Readonly<{ at: 'home'; to: Point }>
  | Readonly<{ at: 'landing'; from: 'hand'; drop: Point }>
  | Readonly<{ at: 'landing'; from: 'home' }>

export type Facts = Readonly<{
  leave: boolean
  leased: boolean
  seat: Point | null
  content: Rect | null
  visible: boolean
  screen: Rect | null
  size: number
  talker: boolean
}>

export type WhereEvent =
  | Readonly<{ kind: 'lift'; on: Side }>
  | Readonly<{ kind: 'drop'; on: Side; at: Point; look?: boolean; covered?: boolean }>
  | Readonly<{ kind: 'escape'; on: Side; at: Point }>
  | Readonly<{ kind: 'ended'; released?: boolean }>
  | Readonly<{ kind: 'signedOut'; at: Point }>
  | Readonly<{
      kind: 'painted' | 'arrived' | 'cleared' | 'click' | 'double' | 'recall' | 'seat' | 'seen'
    }>

export type Effect =
  | Readonly<{ kind: 'mode'; hold: boolean; keys: boolean }>
  | Readonly<{ kind: 'open' | 'release' | 'stroke' | 'front' | 'press' }>

export type Step = Readonly<{ where: Whereabouts; effects: readonly Effect[] }>

const SEAT: Whereabouts = { at: 'seat' }
const OPEN: Effect = { kind: 'open' }
const RELEASE: Effect = { kind: 'release' }
const STROKE: Effect = { kind: 'stroke' }

export const inside = (rect: Rect, at: Point): boolean =>
  at.x >= rect.x && at.y >= rect.y && at.x < rect.x + rect.width && at.y < rect.y + rect.height

const within = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high))

function clamped(at: Point, facts: Facts): Point {
  const { screen, size } = facts
  if (screen === null) return at
  const half = size / 2
  return {
    x: within(at.x, screen.x + half, screen.x + screen.width - half),
    y: within(at.y, screen.y + half, screen.y + screen.height - half),
  }
}

const resting = (spot: Point, waiting = false): Whereabouts => ({
  at: 'desk',
  spot,
  note: false,
  waiting,
})

/** Going home needs a seat to be seen; without one the figure stays on the desk and waits for it. */
const homeward = (from: Point, facts: Facts): Whereabouts =>
  facts.seat === null ? resting(clamped(from, facts), true) : { at: 'home', to: facts.seat }

function dropped(event: Extract<WhereEvent, { kind: 'drop' }>, facts: Facts): Whereabouts {
  const { at } = event
  const back =
    event.look !== true &&
    event.covered !== true &&
    facts.content !== null &&
    facts.visible &&
    inside(facts.content, at)
  return back ? homeward(at, facts) : resting(clamped(at, facts))
}

type Move = Readonly<{ to: Whereabouts; also?: readonly Effect[] }> | undefined

function fromSeat(event: WhereEvent, facts: Facts): Move {
  if (event.kind === 'lift' && event.on === 'page')
    return { to: { at: 'hand', drawn: 'page', on: 'page' }, also: facts.leave ? [OPEN] : [] }
  if (event.kind === 'click') return { to: SEAT, also: [{ kind: 'press' }] }
  return undefined
}

/** Let go of while the page draws: without a lease home on the page, with one the page keeps it until the desk is empty. */
function letGoOnPage(at: Point, facts: Facts): Move {
  return facts.leased
    ? { to: { at: 'landing', from: 'hand', drop: at } }
    : { to: SEAT, also: [RELEASE, STROKE] }
}

/** In the hand while the page draws; `on` is where the pointer is pressed, whose drop and Escape are this hand's. */
function drawnByPage(on: Side, event: WhereEvent, facts: Facts): Move {
  const letGo = (event.kind === 'drop' || event.kind === 'escape') && event.on === on
  if (event.kind === 'signedOut' || letGo) return letGoOnPage(event.at, facts)
  if (event.kind === 'painted') return { to: { at: 'hand', drawn: 'desk', on: 'page' } }
  return undefined
}

function drawnByDesk(on: Side, event: WhereEvent, facts: Facts): Move {
  if (event.kind === 'drop' && event.on === on) return { to: dropped(event, facts) }
  if ((event.kind === 'escape' && event.on === on) || event.kind === 'signedOut')
    return { to: homeward(event.at, facts) }
  if (event.kind === 'ended')
    return {
      to: on === 'page' && !event.released ? { at: 'hand', drawn: 'page', on: 'page' } : SEAT,
    }
  return undefined
}

const fromHand = (where: { drawn: Side; on: Side }, event: WhereEvent, facts: Facts): Move =>
  where.drawn === 'page' ? drawnByPage(where.on, event, facts) : drawnByDesk(where.on, event, facts)

function fromDesk(
  where: { spot: Point; note: boolean; waiting: boolean },
  event: WhereEvent,
  facts: Facts,
): Move {
  switch (event.kind) {
    case 'lift':
      return event.on === 'desk' ? { to: { at: 'hand', drawn: 'desk', on: 'desk' } } : undefined
    case 'escape':
      return where.note ? { to: { ...where, at: 'desk', note: false } } : undefined
    case 'ended':
      return { to: SEAT }
    case 'click':
      return where.note || facts.talker
        ? { to: { ...where, at: 'desk', note: !where.note } }
        : undefined
    case 'double':
      return { to: { ...where, at: 'desk' }, also: [{ kind: 'front' }] }
    case 'recall':
    case 'signedOut':
      return { to: homeward(where.spot, facts) }
    case 'seat':
      return where.waiting && facts.seat !== null ? { to: homeward(where.spot, facts) } : undefined
    case 'seen':
      return !where.note && facts.talker ? { to: { ...where, at: 'desk', note: true } } : undefined
    default:
      return undefined
  }
}

function fromHome(event: WhereEvent): Move {
  if (event.kind === 'lift' && event.on === 'desk')
    return { to: { at: 'hand', drawn: 'desk', on: 'desk' } }
  if (event.kind === 'arrived') return { to: { at: 'landing', from: 'home' } }
  if (event.kind === 'ended') return { to: SEAT }
  return undefined
}

function fromLanding(where: { from: 'hand' | 'home' }, event: WhereEvent): Move {
  const stroke = where.from === 'hand' ? [STROKE] : []
  if (event.kind === 'cleared') return { to: SEAT, also: [RELEASE, ...stroke] }
  if (event.kind === 'ended') return { to: SEAT, also: stroke }
  return undefined
}

function moveOf(where: Whereabouts, event: WhereEvent, facts: Facts): Move {
  switch (where.at) {
    case 'seat':
      return fromSeat(event, facts)
    case 'hand':
      return fromHand(where, event, facts)
    case 'desk':
      return fromDesk(where, event, facts)
    case 'home':
      return fromHome(event)
    case 'landing':
      return fromLanding(where, event)
  }
}

const same = (one: Whereabouts, other: Whereabouts): boolean =>
  JSON.stringify(one) === JSON.stringify(other)

const modeOf = (where: Whereabouts): Effect => ({
  kind: 'mode',
  hold: where.at === 'hand',
  keys: where.at === 'desk' && where.note,
})

/** One step of the whereabouts: the new value and what to do. Every change of the value calls `mode` once. */
export function step(where: Whereabouts, event: WhereEvent, facts: Facts): Step {
  const move = moveOf(where, event, facts)
  if (move === undefined) return { where, effects: [] }
  const also = move.also ?? []
  if (same(move.to, where)) return { where, effects: also }
  const released = also.filter(effect => effect.kind === 'release')
  const rest = also.filter(effect => effect.kind !== 'release')
  return { where: move.to, effects: [...released, modeOf(move.to), ...rest] }
}

export const pageDraws = (where: Whereabouts): boolean =>
  where.at === 'seat' || where.at === 'landing' || (where.at === 'hand' && where.drawn === 'page')

/** What the desk layer is given to draw for a whereabouts; `hand` is where the hand is now. */
export function sceneWhere(where: Whereabouts, hand: Point): SceneWhere {
  switch (where.at) {
    case 'hand':
      return { mode: 'hand', at: hand }
    case 'desk':
      return { mode: 'rest', at: where.spot }
    case 'home':
      return { mode: 'home', at: where.to }
    default:
      return { mode: 'none' }
  }
}
