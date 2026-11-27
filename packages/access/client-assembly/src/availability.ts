import type { AvailabilityFrame } from '@omne-harness/public-contract'

export type ProtocolKey = { readonly name: string; readonly major: number }

export type AvailabilityView = {
  readonly revision: number
  readonly open: ReadonlyMap<string, ProtocolKey>
  /** The revision of the contract of each served protocol, where the server says it. */
  readonly revisions: ReadonlyMap<string, number>
  /** The extension points the server declares, by name; empty when it does not tell them. */
  readonly points: ReadonlyMap<string, ServerPoint>
  /** The protocols two instances of the server hold at once: none of them is served. */
  readonly conflicts: ReadonlySet<string>
  /** How many times the protocols of tenants changed, where the server tells it. */
  readonly scoped?: number
}

/** A point of the other tree. `keys` is there only for a point that makes its keys public. */
export type ServerPoint = Readonly<{
  major: number
  revision: number
  digest: string
  keys?: readonly string[]
}>

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

const conflictsOf = (keys: readonly ProtocolKey[] | undefined): ReadonlySet<string> =>
  new Set((keys ?? []).map(keyText))

/** Where one protocol stands in what the server tells now. */
export type ProtocolStanding =
  | Readonly<{ kind: 'connecting' | 'open' | 'absent' | 'conflict' }>
  | Readonly<{ kind: 'other-major'; served: readonly number[] }>

export function protocolStanding(
  view: AvailabilityView | undefined,
  key: ProtocolKey,
): ProtocolStanding {
  if (view === undefined) return { kind: 'connecting' }
  const text = keyText(key)
  if (view.conflicts.has(text)) return { kind: 'conflict' }
  if (view.open.has(text)) return { kind: 'open' }
  const served = [...view.open.values()]
    .filter(other => other.name === key.name)
    .map(other => other.major)
    .sort((left, right) => left - right)
  return served.length === 0 ? { kind: 'absent' } : { kind: 'other-major', served }
}

export function applyFrame(
  view: AvailabilityView | undefined,
  frame: AvailabilityFrame,
): AvailabilityStep {
  if (frame.kind === 'snapshot') {
    const { revision, protocols } = frame
    const points = new Map((frame.points ?? []).map(({ name, ...point }) => [name, point]))
    const open = new Map(entries(protocols))
    const conflicts = conflictsOf(frame.conflicts)
    const revisions = new Map(told(protocols))
    const view = { revision, open, revisions, points, conflicts }
    return { kind: 'apply', view: withScoped(view, frame.scoped) }
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
  const { points } = view
  const conflicts = conflictsOf(frame.conflicts)
  const next = { revision: frame.revision, open, revisions, points, conflicts }
  return { kind: 'apply', view: withScoped(next, frame.scoped) }
}

const withScoped = (view: AvailabilityView, scoped: number | undefined): AvailabilityView =>
  scoped === undefined ? view : { ...view, scoped }

export type Backoff = { readonly delayMs: (attempt: number) => number }

export const defaultBackoff: Backoff = {
  delayMs: attempt => Math.min(200 * 2 ** attempt, 10_000),
}
