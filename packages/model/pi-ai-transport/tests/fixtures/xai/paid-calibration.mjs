// xAI calibration only; no credential access or network in this helper.
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { usdString, usdUnits } from '../../../../../../tools/model-probe/src/budget.mjs'
import { paidInvocation } from '../../../../../../tools/model-probe/src/production-gate.mjs'

// Expand the retained JSON lexeme, never round money through Number.
export function decimalUsd(value) {
  const source = typeof value === 'string' ? value : jsonNumberSource(value)
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (!match) throw new Error('Invalid nonnegative cost')
  const fraction = match[2] ?? ''
  const exponent = BigInt(match[3] ?? '0')
  if (exponent < -10000n || exponent > 10000n) throw new Error('Cost exponent resource limit')
  const digits = match[1] + fraction
  const point = match[1].length + Number(exponent)
  return point <= 0
    ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length
      ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`
}

export function exactEndpoint(snapshot, model, maxAgeMs, now = Date.now()) {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0)
    throw new Error('Invalid snapshot age limit')
  const source = snapshot.endpointSources?.[model]
  const age = now - Date.parse(source?.observedAt)
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs)
    throw new Error('Endpoint source missing or stale')
  const matches = JSON.parse(source.raw).data?.endpoints?.filter(item => item.tag === 'xai')
  if (matches?.length !== 1 || !matches[0].provider_name)
    throw new Error('Exact xai endpoint unavailable')
  return matches[0]
}

export function wholeContextReservation(endpoint, outputTokens) {
  const context = endpoint.context_length
  if (
    !Number.isSafeInteger(context) ||
    context <= 0 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens <= 0 ||
    (endpoint.max_completion_tokens != null && outputTokens > endpoint.max_completion_tokens)
  )
    throw new Error('Invalid endpoint token bounds')
  const rates = [endpoint.pricing, ...(endpoint.pricing?.overrides ?? [])]
  const known = new Set([
    'prompt',
    'completion',
    'request',
    'image',
    'input_cache_read',
    'input_cache_write',
    'input_cache_write_1h',
    'overrides',
    'min_prompt_tokens',
    'web_search',
  ])
  const units = value => usdUnits(decimalUsd(value))
  const max = values => values.reduce((a, b) => (a > b ? a : b), 0n)
  for (const rate of rates) {
    if (!rate || rate.prompt === undefined || rate.completion === undefined)
      throw new Error('Missing endpoint pricing')
    for (const [key, value] of Object.entries(rate))
      if (!known.has(key) && units(value) !== 0n)
        throw new Error('Unbudgeted endpoint price component')
  }
  const input = max(
    rates.flatMap(rate =>
      ['prompt', 'input_cache_read', 'input_cache_write', 'input_cache_write_1h']
        .filter(key => rate[key] !== undefined)
        .map(key => units(rate[key])),
    ),
  )
  const output = max(rates.map(rate => units(rate.completion)))
  const request = max(rates.map(rate => units(rate.request ?? '0')))
  // Fixed fixtures contain at most one image. Include any distinct per-image charge
  // for every case as a deliberate over-reservation, in addition to all context tokens.
  const image = max(rates.map(rate => units(rate.image ?? '0')))
  return usdString(BigInt(context) * input + BigInt(outputTokens) * output + request + image)
}

export function assertCalibrationWire(body) {
  if (
    !['x-ai/grok-4.6', 'x-ai/grok-4.7'].includes(body.model) ||
    body.plugins !== undefined ||
    body.web_search_options !== undefined ||
    body.models !== undefined ||
    body.route !== undefined ||
    body.provider?.order?.length !== 1 ||
    body.provider.order[0] !== 'xai' ||
    body.provider.allow_fallbacks !== false ||
    (body.tools ?? []).some(
      tool => tool.type !== 'function' || tool.function?.name !== 'lookup__xai',
    )
  )
    throw new Error('Unexpected paid calibration wire capability')
}

export async function runPaidCase({
  ledger,
  model,
  endpoint,
  outputTokens,
  identity,
  body,
  append,
  invoke,
}) {
  // No server/web-search request exists in these fixed plain-model fixtures.
  // The separate web_search rate is therefore inapplicable, not rounded to zero.
  assertCalibrationWire(body)
  if (body.model !== model || body.max_tokens !== outputTokens)
    throw new Error('Budget/request mismatch')
  const estimateUsd = wholeContextReservation(endpoint, outputTokens)
  const result = await paidInvocation(
    ledger,
    {
      model,
      provider: 'xai',
      stage: 'research',
      estimateUsd,
    },
    async reservation => {
      append({ stage: 'before_send', ...identity, reservation, estimateUsd })
      let outcome
      try {
        outcome = await invoke()
      } catch {
        append({
          stage: 'observed',
          ...identity,
          reservation,
          outcome: 'invocation_failed',
          costUsd: null,
          error: 'Invocation failed; original reservation requires reconciliation',
        })
        return { actualUsd: undefined, complete: false }
      }
      let actualUsd
      try {
        if (outcome.cost?.cost_usd !== undefined && outcome.cost.cost_usd !== 'unknown')
          actualUsd = decimalUsd(outcome.cost.cost_usd)
      } catch {
        /* Keep unknown rather than round or discard the reservation. */
      }
      const row = {
        stage: 'observed',
        ...identity,
        reservation,
        outcome: outcome.outcome ?? outcome.rejected,
        upstreamInputTokens: outcome.usage?.input_tokens ?? null,
        upstreamUsageSource: outcome.usage?.source ?? null,
        upstreamOutputTokens: outcome.usage?.output_tokens ?? null,
        costUsd: actualUsd ?? null,
        costSource: outcome.cost?.source ?? null,
        upstreamRequestId: outcome.upstreamRequestId ?? null,
        servingProvider: outcome.servingProvider ?? null,
      }
      append(row)
      return {
        actualUsd,
        complete:
          outcome.outcome === 'complete' &&
          outcome.usage?.source === 'upstream' &&
          Number.isSafeInteger(outcome.usage.input_tokens) &&
          outcome.servingProvider === endpoint.provider_name,
      }
    },
  )
  if (!result.receipt.complete)
    throw new Error('Incomplete calibration case: stop after settlement')
  return result
}
