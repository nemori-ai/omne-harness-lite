import { readerRevision, usageScope } from './usage-scope.ts'
import { ExactDecimal, judgeAccountValue, type Usage } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  judgeContentBlock,
  isNonNegativeJsonInteger,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import type {
  PlanCalibration,
  PlanInput,
  InputMeasurement,
  MeasurementPrecision,
} from '@omne-harness-lite/model-request-runtime'
import {
  deepSeekBoundaryRoute,
  prepareDeepSeekBoundaries,
  INPUT_PROJECTION_REVISION,
  canonicalProjection,
  prefixDigest,
  outputBlockDigest,
  type InputProjection,
} from './projection.ts'
import {
  meterContributionValid,
  tokenMeasurementValid,
  admissionTokens,
  type InputMeter,
  type TokenMeasurement,
  type MarginalMeterInput,
} from './input-meter.ts'
import { object } from './json.ts'

export function ownCalibration(raw: unknown): PlanCalibration | undefined {
  const c = copyJsonValue(raw)
  if ('failed' in c || !object(c.ok)) return undefined
  const value = c.ok
  if (value.kind === 'none')
    return Object.keys(value).length === 2 &&
      (value.reason === 'no_observation' || value.reason === 'source_unavailable')
      ? { kind: 'none', reason: value.reason }
      : undefined
  if (
    value.kind !== 'observation' ||
    Object.keys(value).length !== 5 ||
    !Array.isArray(value.outputBlocks) ||
    !Array.isArray(value.replaySelection) ||
    'rejected' in judgeAccountValue('Usage', value.usage)
  )
    return undefined
  const calibration = copyInputCalibration(value.inputCalibration)
  if ('rejected' in calibration) return undefined
  const outputBlocks: ContentBlock[] = []
  for (const rawBlock of value.outputBlocks) {
    const block = judgeContentBlock(rawBlock)
    if ('rejected' in block) return undefined
    outputBlocks.push(block.ok)
  }
  const replaySelection = []
  const targets = new Set<string>()
  for (const item of value.replaySelection) {
    if (
      !object(item) ||
      Object.keys(item).length !== 3 ||
      !['sourceBlockIndex', 'messageIndex', 'blockIndex'].every(
        key =>
          typeof item[key] === 'number' &&
          Number.isSafeInteger(item[key]) &&
          (item[key] as number) >= 0,
      )
    )
      return undefined
    const selected = {
      sourceBlockIndex: item.sourceBlockIndex as number,
      messageIndex: item.messageIndex as number,
      blockIndex: item.blockIndex as number,
    }
    const key = `${selected.messageIndex}/${selected.blockIndex}`
    if (targets.has(key) || selected.sourceBlockIndex >= outputBlocks.length) return undefined
    targets.add(key)
    replaySelection.push(Object.freeze(selected))
  }
  const usage = value.usage as unknown as Usage
  const { observedInput: observed, outputGroup: group } = calibration.ok
  const parts = [usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens]
  if (
    observed.kind === 'from_usage' &&
    (usage.source !== 'upstream' || parts.some(p => p === 'unknown'))
  )
    return undefined
  if (
    observed.kind === 'upstream_total' &&
    (parts.every(p => p !== 'unknown') ||
      parts
        .reduce<ExactDecimal>(
          (s, p) => (p === 'unknown' ? s : s.add(ExactDecimal.from(p))),
          ExactDecimal.from(0),
        )
        .compare(ExactDecimal.from(observed.tokens)) > 0)
  )
    return undefined
  if (
    group.kind === 'known' &&
    (group.blockDigests.length !== outputBlocks.length ||
      (group.projectionRevision === INPUT_PROJECTION_REVISION &&
        group.blockDigests.some((hash, index) => hash !== outputBlockDigest(outputBlocks[index]))))
  )
    return undefined
  return Object.freeze({
    kind: 'observation',
    inputCalibration: calibration.ok,
    usage,
    outputBlocks: Object.freeze(outputBlocks),
    replaySelection: Object.freeze(replaySelection),
  })
}
export interface MessageSpan {
  readonly start: number
  readonly end: number
}
type Fallback = Extract<InputMeasurement, { mode: 'full' }>['fallbackReason']
export function measureCalibrated(
  input: PlanInput,
  projection: InputProjection,
  spans: readonly MessageSpan[],
  meter: InputMeter,
  full: () => TokenMeasurement,
):
  | {
      readonly measurement: InputMeasurement
      readonly token: Exclude<TokenMeasurement, { kind: 'unavailable' }>
    }
  | undefined {
  const basis = projection.requestInput.countingBasis
  const scope = usageScope(basis.model, basis.provider, basis.binding)
  let fallback: Fallback
  const calibration = input.calibration
  const finish = (
    token: Exclude<TokenMeasurement, { kind: 'unavailable' }>,
    extra:
      | Pick<
          Extract<InputMeasurement, { mode: 'full' }>,
          'mode' | 'fullContribution' | 'fallbackReason'
        >
      | Pick<
          Extract<InputMeasurement, { mode: 'marginal' }>,
          'mode' | 'replayContribution' | 'newContribution'
        >,
  ) => ({
    token,
    measurement: Object.freeze({
      ...extra,
      basis,
      precision: token.kind,
      predictedInput: token.tokens,
      admissionTokens:
        token.kind === 'estimated'
          ? admissionTokens(token.tokens, input.tokenMargin)
          : token.tokens,
    }) as InputMeasurement,
  })
  if (calibration.kind === 'none') fallback = calibration.reason
  else {
    const source = calibration.inputCalibration
    const original = source.requestInput
    const observed = source.observedInput
    if (original.kind !== 'known' || observed.kind === 'unavailable') fallback = 'no_observation'
    else if (
      canonicalProjection(original.countingBasis) !== canonicalProjection(basis) ||
      original.projectionRevision !== projection.requestInput.projectionRevision ||
      observed.provenance.adapterRevision !== readerRevision(scope) ||
      (observed.provenance.upstreamModel !== undefined &&
        observed.provenance.upstreamModel !== basis.model) ||
      (observed.provenance.servingProvider !== undefined &&
        observed.provenance.servingProvider !== basis.provider &&
        !(basis.provider === 'anthropic' && observed.provenance.servingProvider === 'Anthropic') &&
        !(basis.provider === 'openai' && observed.provenance.servingProvider === 'OpenAI') &&
        !(deepSeekBoundaryRoute(input) && observed.provenance.servingProvider === 'DeepInfra'))
    )
      fallback = 'basis_changed'
    else if (scope === 'scope_unknown') fallback = 'source_unavailable'
    else {
      const count = ExactDecimal.from(original.prefixBoundary)
      const n = Number(count.toString())
      if (
        !Number.isSafeInteger(n) ||
        n > projection.units.length ||
        original.inputEnvelopeDigest !== projection.requestInput.inputEnvelopeDigest ||
        original.prefixDigest !== prefixDigest(projection.units.slice(0, n))
      )
        fallback = 'prefix_changed'
      else {
        const g = new Set<number>()
        let mapped = true
        const targets = new Map<number, Set<number>>()
        for (const selected of calibration.replaySelection) {
          const message = input.messages[selected.messageIndex]
          const target = message?.blocks[selected.blockIndex]
          const sourceBlock = calibration.outputBlocks[selected.sourceBlockIndex]
          const span = spans[selected.messageIndex]
          if (
            !target ||
            !sourceBlock ||
            !span ||
            span.start < n ||
            outputBlockDigest(target) !== outputBlockDigest(sourceBlock) ||
            !target.visibility.toModel
          ) {
            mapped = false
            break
          }
          const indices = targets.get(selected.messageIndex) ?? new Set<number>()
          indices.add(selected.blockIndex)
          targets.set(selected.messageIndex, indices)
        }
        for (const [index, selected] of targets) {
          const message = input.messages[index]!
          const span = spans[index]!
          // One wire unit can combine several blocks: either account for the whole unit as G or fall back.
          if (message.blocks.some((block, i) => block.visibility.toModel && !selected.has(i))) {
            mapped = false
            break
          }
          for (let i = span.start; i < span.end; i++) g.add(i)
        }
        if (calibration.replaySelection.length && source.outputGroup.kind !== 'known')
          mapped = false
        if (mapped) {
          const replay: JsonValue[] = [],
            fresh: JsonValue[] = []
          for (let i = n; i < projection.units.length; i++)
            (g.has(i) ? replay : fresh).push(projection.units[i]!)
          const deepSeek = deepSeekBoundaryRoute(input)
          const prepared = deepSeek ? prepareDeepSeekBoundaries(projection, n, g) : undefined
          const boundary = prepared && !('changed' in prepared) ? prepared : undefined
          const arg = (units: readonly JsonValue[], edge?: JsonObject): MarginalMeterInput =>
            Object.freeze({
              units: Object.freeze(units),
              envelope: projection.envelope,
              precedingUnitCount: n,
              ...(edge ? { boundary: edge } : {}),
            })
          try {
            if (deepSeek && !boundary) {
              if (prepared && 'changed' in prepared) fallback = 'prefix_changed'
              throw new TypeError('DeepSeek substantive prefix changed or boundary unavailable')
            }
            const phi =
              replay.length || boundary?.replay.added !== boundary?.replay.removed
                ? meter.measureReplay(arg(replay, boundary?.replay))
                : { kind: 'exact' as const, tokens: 0 }
            const delta =
              fresh.length || boundary?.fresh.added !== boundary?.fresh.removed
                ? meter.measureNew(arg(fresh, boundary?.fresh))
                : { kind: 'exact' as const, tokens: 0 }
            if (
              meterContributionValid(phi) &&
              meterContributionValid(delta) &&
              'tokens' in phi &&
              'tokens' in delta
            ) {
              const anchor =
                observed.kind === 'upstream_total'
                  ? ExactDecimal.from(observed.tokens)
                  : [
                      calibration.usage.input_tokens,
                      calibration.usage.cache_read_tokens,
                      calibration.usage.cache_write_tokens,
                    ].reduce<ExactDecimal>((sum, value) => {
                      if (value === 'unknown') throw new TypeError('missing anchor')
                      return sum.add(ExactDecimal.from(value))
                    }, ExactDecimal.from(0))
              const total = anchor
                .add(ExactDecimal.from(phi.tokens))
                .add(ExactDecimal.from(delta.tokens))
                .toJsonNumber()
              const precision: MeasurementPrecision =
                phi.kind === 'estimated' || delta.kind === 'estimated'
                  ? 'estimated'
                  : phi.kind === 'upperBound' || delta.kind === 'upperBound'
                    ? 'upperBound'
                    : 'exact'
              if (isNonNegativeJsonInteger(total))
                return finish(
                  { kind: precision, tokens: total },
                  {
                    mode: 'marginal',
                    replayContribution: Object.freeze({ tokens: phi.tokens, precision: phi.kind }),
                    newContribution: Object.freeze({ tokens: delta.tokens, precision: delta.kind }),
                  },
                )
            }
          } catch {
            /* A failed marginal component never authorizes admission; try full. */
          }
        }
      }
    }
  }
  const token = full()
  if (!tokenMeasurementValid(token) || token.kind === 'unavailable') return undefined
  return finish(token, {
    mode: 'full',
    ...(fallback ? { fallbackReason: fallback } : {}),
    fullContribution: Object.freeze({ tokens: token.tokens, precision: token.kind }),
  })
}
