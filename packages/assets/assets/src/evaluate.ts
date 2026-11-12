// The candidate resolution of SPEC「合法候选与替换」: a pure function over the facts that the
// caller gives. It reads nothing itself. The layers are opaque labels in the order from the widest
// to the most specific; assets defines no layer type of its own.

/** One same-named candidate of one layer. */
export type Candidate = {
  /** The reference of the concrete asset. */
  readonly asset: string
  readonly version: string
  /** This layer disabled it. */
  readonly disabled: boolean
  /** Its definition declares that it cannot be replaced. */
  readonly immutable: boolean
  /** The holding layer set a replace lock. */
  readonly replaceLocked: boolean
}

export type LayerInput =
  /** The layer has no source, for example a personal tenant has no organization layer. */
  | { readonly layer: string; readonly state: 'not-applicable' }
  /** The layer cannot be read. It is not skipped. */
  | { readonly layer: string; readonly state: 'unavailable' }
  | { readonly layer: string; readonly state: 'read'; readonly candidates: readonly Candidate[] }

export type Filtered = {
  readonly layer: string
  readonly candidate: Candidate
  readonly reason: 'disabled' | 'ineligible' | 'blocked'
  /** For `blocked`: the label of the wider layer whose declaration or lock blocks it. */
  readonly by?: string
}

export type Evaluation =
  | {
      readonly kind: 'winner'
      readonly layer: string
      readonly candidate: Candidate
      readonly filtered: readonly Filtered[]
    }
  | { readonly kind: 'none'; readonly filtered: readonly Filtered[] }
  | { readonly kind: 'unavailable'; readonly layer: string }

export type Eligibility = (candidate: Candidate, layer: string) => 'yes' | 'no' | 'unknown'

/**
 * Collects, filters disabled, filters by eligibility, applies the declarations and locks of the
 * wider layers, and takes the most specific candidate that stands. A layer that cannot be read,
 * or an eligibility that is unknown, makes the answer `unavailable`: either one may hide the
 * winner or a disablement. In one layer, the first standing candidate of the list wins.
 */
export function evaluate(input: {
  readonly layers: readonly LayerInput[]
  readonly eligible: Eligibility
}): Evaluation {
  const unread = input.layers.find(layer => layer.state === 'unavailable')
  if (unread !== undefined) return { kind: 'unavailable', layer: unread.layer }
  const filtered: Filtered[] = []
  let winner: { layer: string; candidate: Candidate } | undefined
  /** The first standing declaration or lock. Every later standing one is of the same asset. */
  let lock: { layer: string; asset: string } | undefined
  for (const layer of input.layers) {
    if (layer.state !== 'read') continue
    let layerWinner: Candidate | undefined
    let layerLock: { layer: string; asset: string } | undefined
    for (const candidate of layer.candidates) {
      const out = filterOf(candidate, layer.layer, input.eligible, lock)
      if (out === 'unknown') return { kind: 'unavailable', layer: layer.layer }
      if (out !== undefined) {
        filtered.push(out)
        continue
      }
      layerWinner ??= candidate
      if (lock === undefined && (candidate.immutable || candidate.replaceLocked))
        layerLock ??= { layer: layer.layer, asset: candidate.asset }
    }
    if (layerWinner !== undefined) winner = { layer: layer.layer, candidate: layerWinner }
    lock ??= layerLock
  }
  return winner === undefined
    ? { kind: 'none', filtered }
    : { kind: 'winner', layer: winner.layer, candidate: winner.candidate, filtered }
}

function filterOf(
  candidate: Candidate,
  layer: string,
  eligible: Eligibility,
  lock: { layer: string; asset: string } | undefined,
): Filtered | 'unknown' | undefined {
  if (candidate.disabled) return { layer, candidate, reason: 'disabled' }
  const verdict = eligible(candidate, layer)
  if (verdict === 'unknown') return 'unknown'
  if (verdict === 'no') return { layer, candidate, reason: 'ineligible' }
  if (lock !== undefined && lock.asset !== candidate.asset)
    return { layer, candidate, reason: 'blocked', by: lock.layer }
  return undefined
}
