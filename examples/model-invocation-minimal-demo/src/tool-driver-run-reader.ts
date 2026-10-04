import type { RunHistoryReader } from '@omne-harness-lite/model-request-runtime-local'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { attemptIdentity } from './tool-driver-run-history.ts'
import { readToolDriverHistory } from './tool-driver-history.ts'

/** The assembly pins the physical owner generation. Model settlement supplies its actual captured prefix. */
export function createToolDriverRunReader(ownerGeneration: string): RunHistoryReader {
  if (!('ok' in parseOpaqueIdentifier(ownerGeneration, 'LogGeneration'))) throw new TypeError('Invalid physical owner generation')
  return (prefix, originalRun, originalAttempt) => {
    const binding = prefix.binding
    const current = () => {
      try { return binding.currentGeneration() === binding.generation } catch { return false }
    }
    if (!current()) return { unavailable: true }
    const projected = readToolDriverHistory({
      scope: { tenant: binding.tenant, session: binding.session }, ownerGeneration, entries: prefix.entries, tail: prefix.tail,
    })
    if ('unavailable' in projected || !current()) return { unavailable: true }
    const run = projected.runs.get(originalRun)
    if (run?.latest === undefined || !run.adoptions.has(attemptIdentity(originalAttempt))) return { unavailable: true }
    return { known: { run: originalRun, originalAttempt, latestAttempt: run.latest.value.attempt, terminal: run.end === undefined ? 'open' : 'ended' } }
  }
}
