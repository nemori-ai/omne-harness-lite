// The cross-row consistency checks of the Model rows (`src/model/consistency.ts`, facts c.2): each
// equality has one counterexample that violates it alone, and the release tree of `serve` refuses to
// load on it with exit 2 (the check runs at the configuration boundary, before any plugin).
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../../src/config-schema.ts'
import { checkModelRowConsistency } from '../../src/model/consistency.ts'
import type { TreeRow } from '../../src/types.ts'
import { serveOnce } from '../fixtures/serve/harness.ts'
import { stubPlugin } from '../../src/cordis.ts'
import { modelHostRow } from '../../src/rows/model-host/index.ts'
import { modelProfilesRow } from '../../src/rows/model-profiles/index.ts'
import { modelRecordsRow } from '../../src/rows/model-records/index.ts'
import { modelRequestPreparationRow } from '../../src/rows/model-request-preparation/index.ts'
import { sessionStorageRow } from '../../src/rows/session-storage/index.ts'
import { modelRowsOperatorConfig } from '../r9/support.ts'

const base = modelRowsOperatorConfig({ storageRoot: 'C:/unused' })

function row(id: string, plugin: string, config: unknown): TreeRow {
  return { id: id as TreeRow['id'], plugin, config, source: 'distribution' }
}

function rows(overrides: Partial<Record<string, unknown>> = {}): TreeRow[] {
  return [
    row(
      'session-storage',
      'sessionStorageRow',
      overrides['session-storage'] ?? { combinationVersion: base.records.combinationVersion },
    ),
    row('model-profiles', 'modelProfilesRow', overrides['model-profiles'] ?? base.profiles),
    row('model-host', 'modelHostRow', overrides['model-host'] ?? base.host),
    row(
      'model-request-preparation',
      'modelRequestPreparationRow',
      overrides['model-request-preparation'] ?? base.preparation,
    ),
    row('model-records', 'modelRecordsRow', overrides['model-records'] ?? base.records),
  ]
}

const violating = (candidate: TreeRow[], field: string) => {
  let error: unknown
  try {
    checkModelRowConsistency(candidate)
  } catch (thrown) {
    error = thrown
  }
  expect(error).toBeInstanceOf(ConfigError)
  expect((error as ConfigError).code).toBe('invalid-config')
  expect((error as ConfigError).message).toContain(field)
}

describe('the cross-row equalities of the model rows', () => {
  it('the operator values of the tests agree', () => {
    expect(() => checkModelRowConsistency(rows())).not.toThrow()
  })

  it('1. records limits.resultPageTargetBytes or readIdleMs differs from host runtime: refused', () => {
    const records = structuredClone(base.records)
    records.limits.resultPageTargetBytes += 1
    violating(rows({ 'model-records': records }), 'resultPageTargetBytes')
    const idle = structuredClone(base.records)
    idle.limits.readIdleMs += 1
    violating(rows({ 'model-records': idle }), 'readIdleMs')
  })

  it('2. records combinationVersion differs from session-storage: refused', () => {
    violating(
      rows({ 'session-storage': { combinationVersion: 'session-composite/1' } }),
      'combinationVersion',
    )
  })

  it('3. the OpenAI family of the send stage differs from the preparation row: refused', () => {
    const records = structuredClone(base.records)
    records.sendStage.preparation.openai.margin.percent = '11'
    violating(rows({ 'model-records': records }), 'sendStage.preparation')
    const cited = structuredClone(base.records)
    cited.sendStage.preparation.maxCitedCalls += 1
    violating(rows({ 'model-records': cited }), 'sendStage.preparation')
  })

  it('4. the official profiles input of the send sources differs from the model-profiles row: refused', () => {
    const records = structuredClone(base.records)
    records.sendStage.profiles.compactionTriggerPercent = '79'
    violating(rows({ 'model-records': records }), 'compactionTriggerPercent')
  })

  it('a stub in either row of a pair is not checked (a stub has no such field)', () => {
    expect(() =>
      checkModelRowConsistency([
        row('model-host', 'stubPlugin', {}),
        row('model-records', 'modelRecordsRow', base.records),
      ]),
    ).not.toThrow()
  })

  it('serve refuses the tree before loading any row: exit 2 and the reason names both rows', async () => {
    const records = structuredClone(base.records)
    records.limits.readIdleMs += 1
    const run = await serveOnce({
      distribution: {
        rows: [
          { id: 'model-profiles', plugin: 'modelProfilesRow', config: base.profiles },
          { id: 'model-host', plugin: 'modelHostRow', config: base.host },
          { id: 'model-records', plugin: 'modelRecordsRow', config: records },
        ],
      },
      plugins: {
        stubPlugin,
        modelProfilesRow,
        modelHostRow,
        modelRecordsRow,
        modelRequestPreparationRow,
        sessionStorageRow,
      },
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toContain('model-records.limits.readIdleMs')
    expect(run.of('row-state')).toEqual([])
  })
})
