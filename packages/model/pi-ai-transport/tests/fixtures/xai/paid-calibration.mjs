// xAI calibration only; no credential access or network in this helper.
import {
  jsonNumberSource,
  readJsonStrict,
  copyJsonValue,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { usdString, usdUnits } from '../../../../../../tools/model-probe/src/budget.mjs'
import { join } from 'node:path'
import {
  createCredentialRedactionPolicy,
  openRouterCredentialRedactionConfig,
} from '@omne-harness-lite/model-request-runtime'
import {
  paidInvocation,
  writePrivateEvidence,
} from '../../../../../../tools/model-probe/src/production-gate.mjs'

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
  persistOutcome,
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
      // Persist the actual domain result before any receipt interpretation/assertion.
      await persistOutcome(reservation, outcome)
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
        upstreamCacheReadTokens: outcome.usage?.cache_read_tokens ?? null,
        upstreamCacheWriteTokens: outcome.usage?.cache_write_tokens ?? null,
        totalPromptTokens: totalPromptTokens(outcome.usage) ?? null,
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
          totalPromptTokens(outcome.usage) !== undefined &&
          safeTokenCount(outcome.usage.output_tokens) !== undefined &&
          outcome.servingProvider === endpoint.provider_name,
      }
    },
  )
  if (!result.receipt.complete)
    throw new Error('Incomplete calibration case: stop after settlement')
  return result
}

// The runtime returns JsonNumber (usually LosslessNumber), not necessarily Number.
// Convert only after proving an exact, nonnegative integer fits the safe range.
export function safeTokenCount(value) {
  try {
    const expanded = decimalUsd(jsonNumberSource(value))
    const [whole, fraction = ''] = expanded.split('.')
    if (/[^0]/.test(fraction)) return undefined
    const integer = BigInt(whole)
    if (integer > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
    return Number(integer)
  } catch {
    return undefined
  }
}

// Explicit one-case recovery for the preexisting oracle failure. This never
// retries a failed/unknown send, nor accepts an arbitrary subset of eight cases.
export function resumeSuccessfulFirstCase(source, expected, endpoint, ledgerSnapshot) {
  const lines = source.trim().split('\n')
  if (lines.length !== 2) throw new Error('Resume requires exactly one complete pair')
  const rows = lines.map(line => {
    const parsed = readJsonStrict(line)
    if (
      !('ok' in parsed) ||
      !parsed.ok ||
      Array.isArray(parsed.ok) ||
      typeof parsed.ok !== 'object'
    )
      throw new Error('Invalid resume journal')
    return parsed.ok
  })
  const [before, observed] = rows
  if (before.stage !== 'before_send' || observed.stage !== 'observed')
    throw new Error('Invalid resume pair order')
  for (const key of ['modelId', 'scenario', 'partition', 'candidateRevision', 'wireSha256'])
    if (before[key] !== expected[key] || observed[key] !== expected[key])
      throw new Error('Resume wire/candidate identity mismatch')
  for (const key of ['estimatedTokens', 'admissionTokens', 'requestBytes', 'images'])
    if (
      safeTokenCount(before[key]) !== safeTokenCount(expected[key]) ||
      safeTokenCount(observed[key]) !== safeTokenCount(expected[key]) ||
      safeTokenCount(expected[key]) === undefined
    )
      throw new Error('Resume plan evidence mismatch')
  if (
    before.snapshotSha256 !== observed.snapshotSha256 ||
    typeof before.snapshotSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(before.snapshotSha256) ||
    observed.outcome !== 'complete' ||
    observed.upstreamUsageSource !== 'upstream' ||
    safeTokenCount(observed.upstreamInputTokens) === undefined ||
    safeTokenCount(observed.upstreamOutputTokens) === undefined ||
    observed.servingProvider !== endpoint.provider_name ||
    observed.costSource !== 'upstream_usage' ||
    typeof observed.costUsd !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(observed.costUsd) ||
    typeof observed.upstreamRequestId !== 'string' ||
    !observed.upstreamRequestId ||
    typeof before.reservation !== 'string' ||
    before.reservation !== observed.reservation
  )
    throw new Error('Resume requires known complete upstream evidence')
  const receipts = ledgerSnapshot.entries.filter(entry => entry.id === before.reservation)
  if (
    receipts.length !== 1 ||
    receipts[0].state !== 'settled' ||
    receipts[0].model !== expected.modelId ||
    receipts[0].provider !== 'xai' ||
    receipts[0].stage !== 'research' ||
    receipts[0].estimateUsd !== before.estimateUsd ||
    receipts[0].actualUsd !== observed.costUsd
  )
    throw new Error('Resume receipt does not match original settled ledger')
  return rows
}

export async function saveOutcomeEvidence(directory, reservation, outcome, credential) {
  const copied = copyJsonValue(outcome)
  if (!('ok' in copied) || !copied.ok || typeof copied.ok !== 'object' || Array.isArray(copied.ok))
    throw new Error('Invocation outcome is not domain JSON data')
  const bound = createCredentialRedactionPolicy(openRouterCredentialRedactionConfig).bind(
    credential,
  )
  if (!('ok' in bound)) throw new Error('Credential redaction unavailable')
  const take = result => {
    if (!('ok' in result)) throw new Error('Evidence redaction unavailable')
    return result.ok
  }
  const value = { ...copied.ok }
  // These fields come from upstream payloads/errors. Independent status, usage,
  // cost, timing and chosen adaptation/route facts retain their original JSON values.
  if (value.rawHeaders !== undefined) value.rawHeaders = take(bound.ok.headers(value.rawHeaders))
  if (value.blocks !== undefined) value.blocks = take(bound.ok.json(value.blocks))
  for (const field of ['upstreamRequestId', 'upstreamModel', 'servingProvider', 'stopReason'])
    if (typeof value[field] === 'string') value[field] = take(bound.ok.text(value[field]))
  if (value.failure) {
    value.failure = { ...value.failure }
    if (value.failure.upstreamError !== undefined)
      value.failure.upstreamError = take(bound.ok.json(value.failure.upstreamError))
    if (value.failure.localError !== undefined)
      value.failure.localError = take(bound.ok.text(value.failure.localError))
  }
  if (!/^[a-f0-9-]+$/.test(reservation)) throw new Error('Invalid evidence reservation')
  await writePrivateEvidence(
    join(directory, `${reservation}.outcome.json`),
    writeJsonLossless(value) + '\n',
  )
}

/** S-6 inputs are disjoint: cached reads/writes must be included for context. */
export function totalPromptTokens(usage) {
  if (usage?.source !== 'upstream') return undefined
  const parts = ['input_tokens', 'cache_read_tokens', 'cache_write_tokens'].map(key =>
    safeTokenCount(usage[key]),
  )
  if (parts.some(value => value === undefined)) return undefined
  const sum = parts.reduce((total, value) => total + BigInt(value), 0n)
  return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : undefined
}
