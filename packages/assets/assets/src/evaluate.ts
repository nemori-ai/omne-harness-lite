export type Candidate = {
  readonly asset: string
  readonly version: string
  readonly disabled: boolean
  readonly immutable: boolean
  readonly replaceLocked: boolean
}

export type LayerInput =
  | { readonly layer: string; readonly state: 'not-applicable' }
  | { readonly layer: string; readonly state: 'unavailable' }
  | { readonly layer: string; readonly state: 'read'; readonly candidates: readonly Candidate[] }

export type Filtered = {
  readonly layer: string
  readonly candidate: Candidate
  readonly reason: 'disabled' | 'ineligible' | 'blocked'
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

type Screened = { readonly candidate: Candidate; out?: Filtered }

type ScreenedLayer = { readonly layer: string; readonly candidates: readonly Screened[] }

export function evaluate(input: {
  readonly layers: readonly LayerInput[]
  readonly eligible: Eligibility
}): Evaluation {
  const unread = input.layers.find(layer => layer.state === 'unavailable')
  if (unread !== undefined) return { kind: 'unavailable', layer: unread.layer }
  const screened = screen(input.layers, input.eligible)
  return 'unknown' in screened ? { kind: 'unavailable', layer: screened.unknown } : choose(screened)
}

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

function choose(layers: readonly ScreenedLayer[]): Evaluation {
  const filtered: Filtered[] = []
  let winner: { layer: string; candidate: Candidate } | undefined
  let lock: Lock | undefined
  for (const { layer, candidates } of layers) {
    const standing: Candidate[] = []
    for (const { candidate, out } of candidates) {
      const removed = out ?? blockedBy(lock, layer, candidate)
      if (removed === undefined) standing.push(candidate)
      else filtered.push(removed)
    }
    const first = standing[0]
    if (first !== undefined) winner = { layer, candidate: first }
    lock ??= lockOf(layer, standing)
  }
  return winner === undefined
    ? { kind: 'none', filtered }
    : { kind: 'winner', layer: winner.layer, candidate: winner.candidate, filtered }
}

type Lock = { readonly layer: string; readonly asset: string }

function blockedBy(
  lock: Lock | undefined,
  layer: string,
  candidate: Candidate,
): Filtered | undefined {
  return lock !== undefined && lock.asset !== candidate.asset
    ? { layer, candidate, reason: 'blocked', by: lock.layer }
    : undefined
}

function lockOf(layer: string, standing: readonly Candidate[]): Lock | undefined {
  const locking = standing.find(candidate => candidate.immutable || candidate.replaceLocked)
  return locking === undefined ? undefined : { layer, asset: locking.asset }
}
