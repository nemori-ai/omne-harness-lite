// Offline case generator and holdout oracle. It never reads credentials or sends HTTP.
// The paid executor belongs to the root's existing production ledger owner.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../deepseek-v41-flash/', import.meta.url)
const images = Object.freeze({
  tiny: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  medium: readFileSync(new URL('public-red-544.png', root)).toString('base64'),
  large: readFileSync(new URL('public-blue-1024.png', root)).toString('base64'),
})
const targets = Object.freeze([
  { model: 'moonshotai/kimi-k3', provider: 'moonshotai/mxfp4', route: 'k3' },
  { model: 'moonshotai/kimi-k2.7-code', provider: 'moonshotai/int4', route: 'k27' },
])

function image(which) {
  return { type: 'image_url', image_url: { url: `data:image/png;base64,${images[which]}` } }
}

function history(variant) {
  const prior = [
    { role: 'system', content: 'Answer the final color comparison in one short sentence.' },
    { role: 'user', content: 'Call lookup before answering.' },
    {
      role: 'assistant',
      content: '',
      reasoning: 'I should call lookup.',
      tool_calls: [
        {
          id: 'call_calibration',
          type: 'function',
          function: { name: 'lookup', arguments: '{"key":"color"}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_calibration', content: '{"color":"red"}' },
  ]
  if (variant === 'history') {
    prior.push({
      role: 'user',
      content: [{ type: 'text', text: 'Remember the first image.' }, image('medium')],
    })
    prior.push({ role: 'assistant', content: 'I remember the red image.' })
  }
  const final = [
    { type: 'text', text: 'Describe the final image if present, otherwise say no image.' },
  ]
  if (variant !== 'baseline') final.push(image(variant === 'history' ? 'tiny' : variant))
  return [...prior, { role: 'user', content: final }]
}

function cases() {
  return targets.flatMap(target =>
    ['baseline', 'medium', 'large', 'history'].map(variant => ({
      id: `${target.route}-${variant}`,
      purpose: variant === 'baseline' || variant === 'medium' ? 'calibration' : 'holdout',
      model: target.model,
      provider: target.provider,
      body: {
        model: target.model,
        provider: { order: [target.provider], allow_fallbacks: false, require_parameters: true },
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 64,
        messages: history(variant),
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookup',
              description: 'Look up one color.',
              parameters: {
                type: 'object',
                properties: { key: { type: 'string' } },
                required: ['key'],
              },
            },
          },
        ],
        ...(target.route === 'k3' ? { reasoning: { effort: 'low' } } : {}),
      },
    })),
  )
}

function evaluate(path) {
  const rows = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(rows) || rows.length !== 8)
    throw new Error('Expected exactly eight case results')
  const byId = new Map(rows.map(row => [row.id, row]))
  const output = []
  for (const target of targets) {
    const get = variant => {
      const row = byId.get(`${target.route}-${variant}`)
      if (
        !row ||
        row.model !== target.model ||
        row.provider !== target.provider ||
        !Number.isSafeInteger(row.promptTokens) ||
        row.promptTokens < 0 ||
        typeof row.costUsd !== 'string'
      )
        throw new Error(`Missing settled fixed-route usage for ${target.route}-${variant}`)
      return row
    }
    const baseline = get('baseline')
    const medium = get('medium')
    const large = get('large')
    const historical = get('history')
    const mediumPatches = 400
    const largePatches = 1369
    const observedMediumDelta = medium.promptTokens - baseline.promptTokens
    const observedLargeDelta = large.promptTokens - baseline.promptTokens
    const fittedPerPatch = observedMediumDelta / mediumPatches
    output.push({
      model: target.model,
      provider: target.provider,
      calibration: { observedMediumDelta, mediumPatches, fittedPerPatch },
      holdout: {
        largePatches,
        observedLargeDelta,
        predictedLargeDelta: fittedPerPatch * largePatches,
        residual: observedLargeDelta - fittedPerPatch * largePatches,
        historyPromptTokens: historical.promptTokens,
        historyVsBaseline: historical.promptTokens - baseline.promptTokens,
      },
      cacheReadTokens: [baseline, medium, large, historical].map(
        row => row.cacheReadTokens ?? 'unknown',
      ),
    })
  }
  return output
}

const [command, path, output] = process.argv.slice(2)
if (command === 'emit' && path && !output) {
  writeFileSync(
    path,
    `${JSON.stringify({ version: 1, maxInitialRequests: 8, cases: cases() }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
} else if (command === 'evaluate' && path && !output) {
  process.stdout.write(`${JSON.stringify(evaluate(path), null, 2)}\n`)
} else if (command === 'opaque' && path && output) {
  const observed = JSON.parse(readFileSync(path, 'utf8'))
  const target = targets.find(
    item => item.model === observed.model && item.provider === observed.provider,
  )
  const prior = observed.requestBody
  if (
    !target ||
    !Array.isArray(observed.reasoningDetails) ||
    observed.reasoningDetails.length === 0 ||
    typeof observed.responseText !== 'string' ||
    !prior ||
    prior.model !== target.model ||
    !Array.isArray(prior.messages) ||
    !Array.isArray(prior.provider?.order) ||
    prior.provider.order.length !== 1 ||
    prior.provider.order[0] !== target.provider ||
    prior.provider.allow_fallbacks !== false
  )
    throw new Error('Expected actual same-route request and opaque response evidence')
  const body = structuredClone(prior)
  body.messages.push({
    role: 'assistant',
    content: observed.responseText,
    reasoning_details: observed.reasoningDetails,
  })
  body.messages.push({ role: 'user', content: 'Continue the prior answer in one sentence.' })
  writeFileSync(
    output,
    `${JSON.stringify({ version: 1, kind: 'opaque-replay-candidate', model: target.model, provider: target.provider, body }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  )
} else {
  throw new Error(
    'Usage: node calibration.mjs emit OUTPUT | evaluate EIGHT-RESULTS.json | opaque ACTUAL-FIRST-RESPONSE.json OUTPUT',
  )
}
