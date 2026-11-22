import type { AvailabilityFrame } from '@omne-harness/public-contract'

export type ProtocolKey = { readonly name: string; readonly major: number }

export type AvailabilityView = {
  readonly revision: number
  readonly open: ReadonlyMap<string, ProtocolKey>
  /** The revision of the contract of each served protocol, where the server says it. */
  readonly revisions: ReadonlyMap<string, number>
}

export type AvailabilityStep =
  | { readonly kind: 'apply'; readonly view: AvailabilityView }
  | { readonly kind: 'resubscribe' }

export const keyText = (key: ProtocolKey): string => `${key.name}/v${key.major}`

type Served = ProtocolKey & { readonly revision?: number }

const entries = (keys: readonly ProtocolKey[]): [string, ProtocolKey][] =>
  keys.map(key => [keyText(key), { name: key.name, major: key.major }])

const told = (served: readonly Served[]): [string, number][] =>
  served.flatMap(({ revision, ...key }) =>
    revision === undefined ? [] : [[keyText(key), revision]],
  )

export function applyFrame(
  view: AvailabilityView | undefined,
  frame: AvailabilityFrame,
): AvailabilityStep {
  if (frame.kind === 'snapshot') {
    const { revision, protocols } = frame
    const next = {
      revision,
      open: new Map(entries(protocols)),
      revisions: new Map(told(protocols)),
    }
    return { kind: 'apply', view: next }
  }
  if (view === undefined || frame.revision !== view.revision + 1) return { kind: 'resubscribe' }
  const open = new Map(view.open)
  const revisions = new Map(view.revisions)
  for (const [text] of entries(frame.removed)) {
    open.delete(text)
    revisions.delete(text)
  }
  for (const [text, key] of entries(frame.added)) open.set(text, key)
  for (const [text, revision] of told(frame.added)) revisions.set(text, revision)
  return { kind: 'apply', view: { revision: frame.revision, open, revisions } }
}

export type Backoff = { readonly delayMs: (attempt: number) => number }

export const defaultBackoff: Backoff = {
  delayMs: attempt => Math.min(200 * 2 ** attempt, 10_000),
}
