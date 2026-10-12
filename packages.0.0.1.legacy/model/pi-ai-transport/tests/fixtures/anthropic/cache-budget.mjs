import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { usdString, usdUnits } from '../../../../../../tools/model-probe/src/budget.mjs'
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
  const matches = JSON.parse(source.raw).data?.endpoints?.filter(item => item.tag === 'anthropic')
  if (matches?.length !== 1 || !matches[0].provider_name)
    throw new Error('Exact anthropic endpoint unavailable')
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
  const input = max([
    // First-party 1h writes are 2x base input. Retain this ceiling when
    // OpenRouter omits the separate 1h rate; compare every context-price tier.
    // https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pricing
    ...rates.map(rate => units(rate.prompt) * 2n),
    ...rates.flatMap(rate =>
      ['prompt', 'input_cache_read', 'input_cache_write', 'input_cache_write_1h']
        .filter(key => rate[key] !== undefined)
        .map(key => units(rate[key])),
    ),
  ])
  const output = max(rates.map(rate => units(rate.completion)))
  const request = max(rates.map(rate => units(rate.request ?? '0')))
  // Fixed fixtures contain at most one image. Include any distinct per-image charge
  // for every case as a deliberate over-reservation, in addition to all context tokens.
  const image = max(rates.map(rate => units(rate.image ?? '0')))
  return usdString(BigInt(context) * input + BigInt(outputTokens) * output + request + image)
}
