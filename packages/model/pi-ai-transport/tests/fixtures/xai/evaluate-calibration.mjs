// Evaluate root-owned observed JSONL without converting two fit points into a
// production margin. Holdout rows never influence the fit ratio.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { totalPromptTokens } from './paid-calibration.mjs'

const path = process.argv[2]
if (!path) throw new Error('usage: node evaluate-calibration.mjs <observed-jsonl>')
const rows = readFileSync(path, 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line))
const keyed = new Map()
for (const row of rows) {
  const key = `${row.modelId}/${row.scenario}`
  const pair = keyed.get(key) ?? {}
  if (row.stage === 'before_send') {
    if (pair.before) throw new Error(`duplicate send intent: ${key}`)
    pair.before = row
  } else if (row.stage === 'observed') {
    if (pair.after) throw new Error(`duplicate observation: ${key}`)
    pair.after = row
  } else throw new Error(`not an observed execution journal: ${row.stage}`)
  keyed.set(key, pair)
}
const byModel = new Map()
for (const [key, pair] of keyed) {
  if (!pair.before || !pair.after) throw new Error(`unresolved send outcome: ${key}`)
  if (pair.before.wireSha256 !== pair.after.wireSha256)
    throw new Error(`wire identity drift: ${key}`)
  let usage = {
    source: pair.after.upstreamUsageSource,
    input_tokens: pair.after.upstreamInputTokens,
    cache_read_tokens: pair.after.upstreamCacheReadTokens,
    cache_write_tokens: pair.after.upstreamCacheWriteTokens,
  }
  // Older journals omitted cache splits. Use the preserved actual domain outcome
  // when available; never infer missing components from fees or replace with zero.
  if (usage.cache_read_tokens === undefined || usage.cache_write_tokens === undefined) {
    if (!/^[a-f0-9-]+$/.test(pair.after.reservation)) throw new Error('Invalid receipt identity')
    const sourcePath = join(dirname(path), `${pair.after.reservation}.outcome.json`)
    if (existsSync(sourcePath)) {
      const parsed = readJsonStrict(readFileSync(sourcePath, 'utf8'))
      if ('ok' in parsed) usage = parsed.ok.usage
    }
  }
  const actual = totalPromptTokens(usage)
  const estimate = pair.after.estimatedTokens
  if (
    pair.after.outcome !== 'complete' ||
    pair.after.upstreamUsageSource !== 'upstream' ||
    !Number.isSafeInteger(actual) ||
    actual < 0 ||
    !Number.isSafeInteger(estimate) ||
    estimate <= 0
  )
    throw new Error(`unknown/noncomplete usage: ${key}`)
  const group = byModel.get(pair.after.modelId) ?? { fit: [], holdout: [] }
  group[pair.after.partition].push({ scenario: pair.after.scenario, estimate, actual })
  byModel.set(pair.after.modelId, group)
}
const report = []
for (const [modelId, group] of byModel) {
  if (
    group.fit.length !== 2 ||
    group.holdout.length !== (process.argv.includes('--text-only') ? 1 : 2)
  )
    throw new Error(`incomplete split: ${modelId}`)
  const fitRatio = Math.max(...group.fit.map(item => item.actual / item.estimate))
  report.push({
    modelId,
    totalPromptBasis: 'input_tokens + cache_read_tokens + cache_write_tokens; any unknown rejects',
    fit: group.fit,
    observedMinimumFitMultiplier: fitRatio,
    holdout: group.holdout.map(item => ({
      ...item,
      predictedWithFitRatio: Math.ceil(item.estimate * fitRatio),
      coveredByFitRatio: Math.ceil(item.estimate * fitRatio) >= item.actual,
    })),
    conclusion: 'limited calibration only; no production margin or route certification',
  })
}
console.log(JSON.stringify(report, null, 2))
