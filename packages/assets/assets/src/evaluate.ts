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

/** One candidate after the disabled and eligibility filters: `out` when it is filtered. */
type Screened = { readonly candidate: Candidate; out?: Filtered }

type ScreenedLayer = { readonly layer: string; readonly candidates: readonly Screened[] }

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
  const screened = screen(input.layers, input.eligible)
  return 'unknown' in screened ? { kind: 'unavailable', layer: screened.unknown } : choose(screened)
}

/** The disabled filter, then the eligibility filter, layer by layer. An eligibility that is
 * unknown stops at its layer. */
function screen(
  layers: readonly LayerInput[],
  eligible: Eligibility,
): readonly ScreenedLayer[] | { readonly unknown: string } {
  const screened: ScreenedLayer[] = []
  for (const layer of layers) {
    if (layer.state !== 'read') continue
    const candidates: Screened[] = []
    for (const candidate of layer.candidates) {
      if (candidate.disabled) {
        candidates.push({ candidate, out: { layer: layer.layer, candidate, reason: 'disabled' } })
        continue
      }
      const verdict = eligible(candidate, layer.layer)
      if (verdict === 'unknown') return { unknown: layer.layer }
      candidates.push(
        verdict === 'no'
          ? { candidate, out: { layer: layer.layer, candidate, reason: 'ineligible' } }
          : { candidate },
      )
    }
    screened.push({ layer: layer.layer, candidates })
  }
  return screened
}

/**
 * From the widest layer to the most specific: the first standing declaration or lock blocks the
 * other assets below it, and the most specific standing candidate wins. Every later standing
 * declaration or lock is of the same asset, so the first one is enough.
 */
function choose(layers: readonly ScreenedLayer[]): Evaluation {
  const filtered: Filtered[] = []
  let winner: { layer: string; candidate: Candidate } | undefined
  let lock: { layer: string; asset: string } | undefined
  for (const { layer, candidates } of layers) {
    let layerWinner: Candidate | undefined
    let layerLock: { layer: string; asset: string } | undefined
    for (const { candidate, out } of candidates) {
      const blocked =
        out === undefined && lock !== undefined && lock.asset !== candidate.asset
          ? { layer, candidate, reason: 'blocked' as const, by: lock.layer }
          : out
      if (blocked !== undefined) {
        filtered.push(blocked)
        continue
      }
      layerWinner ??= candidate
      if (lock === undefined && (candidate.immutable || candidate.replaceLocked))
        layerLock ??= { layer, asset: candidate.asset }
    }
    if (layerWinner !== undefined) winner = { layer, candidate: layerWinner }
    lock ??= layerLock
  }
  return winner === undefined
    ? { kind: 'none', filtered }
    : { kind: 'winner', layer: winner.layer, candidate: winner.candidate, filtered }
}
