// Evaluate root-owned observed JSONL without converting two fit points into a
// production margin. Holdout rows never influence the fit ratio.
import { readFileSync } from 'node:fs'

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
  const actual = pair.after.upstreamInputTokens
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
  if (group.fit.length !== 2 || group.holdout.length !== 2)
    throw new Error(`incomplete split: ${modelId}`)
  const fitRatio = Math.max(...group.fit.map(item => item.actual / item.estimate))
  report.push({
    modelId,
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
