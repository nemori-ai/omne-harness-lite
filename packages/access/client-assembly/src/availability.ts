import type { AvailabilityFrame } from '@omne-harness/public-contract'

export type ProtocolKey = { readonly name: string; readonly major: number }

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

export type Backoff = { readonly delayMs: (attempt: number) => number }

export const defaultBackoff: Backoff = {
  delayMs: attempt => Math.min(200 * 2 ** attempt, 10_000),
}
