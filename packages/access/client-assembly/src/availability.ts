// The connection's view of the availability (RFC-0015 §6「客户端装配」, §13「客户端：树上的一个协议
// 客户端」, #1249 C17): a snapshot replaces the view; a change applies only on the revision it was
// made from. A change on another base is not applied: the connection subscribes again.
import type { AvailabilityFrame } from '@omne-harness/public-contract'

export type ProtocolKey = { readonly name: string; readonly major: number }

/** What the connection knows: the revision and the protocols open at it, by `name/v<major>`. */
export type AvailabilityView = {
  readonly revision: number
  readonly open: ReadonlyMap<string, ProtocolKey>
}

export type AvailabilityStep =
  | { readonly kind: 'apply'; readonly view: AvailabilityView }
  | { readonly kind: 'resubscribe' }

export const keyText = (key: ProtocolKey): string => `${key.name}/v${key.major}`

const entries = (keys: readonly ProtocolKey[]): [string, ProtocolKey][] =>
  keys.map(key => [keyText(key), { name: key.name, major: key.major }])

/** The next view after one frame, or `resubscribe` when the frame does not sit on the view. */
export function applyFrame(
  view: AvailabilityView | undefined,
  frame: AvailabilityFrame,
): AvailabilityStep {
  if (frame.kind === 'snapshot')
    return {
      kind: 'apply',
      view: { revision: frame.revision, open: new Map(entries(frame.protocols)) },
    }
  if (view === undefined || frame.revision !== view.revision + 1) return { kind: 'resubscribe' }
  const open = new Map(view.open)
  for (const [text, key] of entries(frame.added)) open.set(text, key)
  for (const [text] of entries(frame.removed)) open.delete(text)
  return { kind: 'apply', view: { revision: frame.revision, open } }
}

/** How long to wait before the `attempt`-th resubscription after the observation broke. */
export type Backoff = { readonly delayMs: (attempt: number) => number }

/** 200 ms, doubling, at most 10 seconds. */
export const defaultBackoff: Backoff = {
  delayMs: attempt => Math.min(200 * 2 ** attempt, 10_000),
}
