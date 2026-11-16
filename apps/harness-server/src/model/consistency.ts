import { isDeepStrictEqual } from 'node:util'
import { ConfigError } from '../config-schema.ts'
import type { TreeRow } from '../types.ts'

export const MODEL_ROW_EXPORTS = Object.freeze({
  records: 'modelRecordsRow',
  host: 'modelHostRow',
  preparation: 'modelRequestPreparationRow',
  profiles: 'modelProfilesRow',
  sessionStorage: 'sessionStorageRow',
})

function configOf(rows: readonly TreeRow[], id: string, plugin: string): unknown {
  const row = rows.find(candidate => candidate.id === id)
  return row !== undefined && row.plugin === plugin ? row.config : undefined
}

function member(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value
  for (const name of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = Reflect.get(current, name)
  }
  return current
}

function same(
  left: Readonly<{ row: string; config: unknown; path: readonly string[] }>,
  right: Readonly<{ row: string; config: unknown; path: readonly string[] }>,
): void {
  const a = member(left.config, left.path)
  const b = member(right.config, right.path)
  if (a === undefined || b === undefined) return
  if (!isDeepStrictEqual(a, b))
    throw new ConfigError(
      'invalid-config',
      `model rows disagree: ${left.row}.${left.path.join('.')} must equal ${right.row}.${right.path.join('.')}`,
    )
}

export function checkModelRowConsistency(rows: readonly TreeRow[]): void {
  const records = configOf(rows, 'model-records', MODEL_ROW_EXPORTS.records)
  if (records === undefined) return
  const host = configOf(rows, 'model-host', MODEL_ROW_EXPORTS.host)
  if (host !== undefined) {
    for (const field of ['resultPageTargetBytes', 'readIdleMs']) {
      same(
        { row: 'model-records', config: records, path: ['limits', field] },
        { row: 'model-host', config: host, path: ['runtime', field] },
      )
    }
  }
  const sessionStorage = configOf(rows, 'session-storage', MODEL_ROW_EXPORTS.sessionStorage)
  if (sessionStorage !== undefined)
    same(
      { row: 'model-records', config: records, path: ['combinationVersion'] },
      { row: 'session-storage', config: sessionStorage, path: ['combinationVersion'] },
    )
  const preparation = configOf(rows, 'model-request-preparation', MODEL_ROW_EXPORTS.preparation)
  if (preparation !== undefined)
    same(
      { row: 'model-records', config: records, path: ['sendStage', 'preparation'] },
      { row: 'model-request-preparation', config: preparation, path: [] },
    )
  const profiles = configOf(rows, 'model-profiles', MODEL_ROW_EXPORTS.profiles)
  if (profiles !== undefined) {
    for (const field of ['retryPolicy', 'compactionTriggerPercent']) {
      same(
        { row: 'model-records', config: records, path: ['sendStage', 'profiles', field] },
        { row: 'model-profiles', config: profiles, path: [field] },
      )
    }
  }
}
