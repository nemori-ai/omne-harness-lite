import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  STAGES,
  THRESHOLD_SOURCE,
  evaluateMedian,
  thresholdValue,
  validateRounds,
} from './metrics.mjs'

function validateMetadata(metadata) {
  if (!/^[a-f0-9]{40}$/.test(metadata?.sha)) throw new Error('metadata requires full SHA')
  for (const field of ['platform', 'osVersion', 'node']) {
    if (typeof metadata[field] !== 'string' || !metadata[field])
      throw new Error(`missing metadata ${field}`)
  }
  if (!Number.isSafeInteger(metadata.cores) || metadata.cores <= 0)
    throw new Error('invalid core count')
  if (!['held', 'unheld'].includes(metadata.slot?.state))
    throw new Error('missing slot observation')
  if (!['synthetic', 'product'].includes(metadata.workload?.kind))
    throw new Error('missing workload kind')
}

function summaryFor(metadata, rounds, threshold, observations) {
  validateMetadata(metadata)
  const median = evaluateMedian(rounds, threshold)
  return {
    schemaVersion: 1,
    metadata,
    threshold,
    thresholdSource:
      threshold === 1.5
        ? THRESHOLD_SOURCE
        : `CLI --threshold; default reference: ${THRESHOLD_SOURCE}`,
    roundCount: rounds.length,
    median,
    state:
      median.state === 'fail' || observations.some(item => item.state === 'fail')
        ? 'fail'
        : 'blocked',
    pending: [
      'DP1 stage/fsync observation method is not approved',
      'DP2 stage growth rule is not approved',
    ],
    observations,
  }
}

export function writeArchive(directory, metadata, rounds, threshold = 1.5, observations = []) {
  thresholdValue(threshold)
  validateRounds(rounds)
  const summary = summaryFor(metadata, rounds, threshold, observations)
  for (const name of ['summary.json', 'rounds.jsonl', 'curves.svg', 'curves.html']) {
    if (existsSync(join(directory, name))) throw new Error(`archive file already exists: ${name}`)
  }
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'rounds.jsonl'),
    rounds.map(row => JSON.stringify(row)).join('\n') + (rounds.length ? '\n' : ''),
  )
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  const svg = curves(rounds)
  writeFileSync(join(directory, 'curves.svg'), svg)
  writeFileSync(
    join(directory, 'curves.html'),
    `<!doctype html><meta charset="utf-8"><title>E9 curves</title><p>Absolute milliseconds. Missing measurements have no point. See rounds.jsonl for values and reasons.</p>${svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')}`,
  )
  return summary
}

export function readArchive(directory) {
  const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'))
  if (summary.schemaVersion !== 1) throw new Error('unsupported archive schema')
  const input = readFileSync(join(directory, 'rounds.jsonl'), 'utf8').trim()
  const rounds = input ? input.split(/\r?\n/).map(line => JSON.parse(line)) : []
  validateRounds(rounds)
  const expected = summaryFor(
    summary.metadata,
    rounds,
    thresholdValue(summary.threshold),
    summary.observations,
  )
  if (JSON.stringify(expected) !== JSON.stringify(summary))
    throw new Error('summary does not match raw rounds')
  return { summary, rounds }
}

export function compareArchives(before, after) {
  const reasons = []
  for (const archive of [before, after]) {
    validateMetadata(archive.summary.metadata)
    validateRounds(archive.rounds)
    if (evaluateMedian(archive.rounds).state === 'blocked')
      reasons.push('both full measured median windows are required')
  }
  for (const key of ['platform', 'osVersion', 'node', 'cores', 'workload']) {
    if (
      JSON.stringify(before.summary.metadata[key]) !== JSON.stringify(after.summary.metadata[key])
    )
      reasons.push(`different ${key}`)
  }
  if (before.summary.metadata.slot.state !== after.summary.metadata.slot.state)
    reasons.push('different slot holding state')
  if (reasons.length) return { state: 'incomparable', reasons }
  const first = evaluateMedian(before.rounds)
  const second = evaluateMedian(after.rounds)
  return {
    state: 'comparable',
    scope: 'ownOverhead median windows only; stage/fsync comparison awaits DP1/DP2',
    before: first,
    after: second,
    shaBefore: before.summary.metadata.sha,
    shaAfter: after.summary.metadata.sha,
  }
}

function curves(rounds) {
  const colors = ['#1368aa', '#ba2d0b', '#357a38', '#7e3f98']
  const values = rounds.flatMap(row =>
    STAGES.flatMap(stage =>
      row.stages[stage].state === 'measured' ? [row.stages[stage].value] : [],
    ),
  )
  const max = Math.max(1, ...values)
  const lines = STAGES.map((stage, index) => {
    const points = rounds
      .filter(row => row.stages[stage].state === 'measured')
      .map(
        row =>
          `<circle cx="${40 + (row.round - 1) * 3.8}" cy="${320 - (row.stages[stage].value / max) * 270}" r="2" fill="${colors[index]}"><title>${stage} round ${row.round}: ${row.stages[stage].value} ms</title></circle>`,
      )
      .join('')
    return `<text x="45" y="${355 + index * 20}" fill="${colors[index]}">${stage}</text>${points}`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="450" viewBox="0 0 840 450"><rect width="840" height="450" fill="white"/><text x="20" y="20">${max} ms maximum; round 1 to 200</text><path d="M40 40 V320 H810" fill="none" stroke="black"/>${lines}</svg>\n`
}
