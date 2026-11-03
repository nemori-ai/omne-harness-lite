// The cross-row consistency checks of the Model rows (facts c.2, `tmp/wire-model/design.md` §6).
// They run at the configuration boundary of `serve`, before any plugin loads: a value two rows must
// share and do not makes the load fail with exit 2 and a reason that names both rows and the field.
// Rows that are not the real export (stubs, fixtures) are not checked: a stub has no such field.
import { isDeepStrictEqual } from 'node:util'
import { ConfigError } from '../config-schema.ts'
import type { TreeRow } from '../types.ts'

/** The export names of the real rows, as the release names them in `./cordis`. */
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
  // A missing field is the row's own schema failure at load; only two present values are compared.
  if (a === undefined || b === undefined) return
  if (!isDeepStrictEqual(a, b))
    throw new ConfigError(
      'invalid-config',
      `model rows disagree: ${left.row}.${left.path.join('.')} must equal ${right.row}.${right.path.join('.')}`,
    )
}

/**
 * The three cross-row equalities of the release, and the one the send sources need:
 * 1. records `limits.resultPageTargetBytes` and `limits.readIdleMs` equal host `runtime` of the same name;
 * 2. records `combinationVersion` equals session-storage `combinationVersion` (both rows compute the
 *    manifest digest from the one catalog, `compositeManifestDigest(storageCatalog())`);
 * 3. records `sendStage.preparation` equals the whole `model-request-preparation` configuration
 *    (the OpenAI family and the lease bound);
 * 4. records `sendStage.profiles` equals `model-profiles` `retryPolicy` and `compactionTriggerPercent`.
 * Only the pairs where both rows are the real export are checked.
 */
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
