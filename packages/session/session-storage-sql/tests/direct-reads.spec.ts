import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const PACKAGE = 'packages/session/session-storage-sql/src'
const PRODUCT_SOURCES = [
  ':(glob)packages/**/src/**',
  ':(glob)apps/**/src/**',
  ':(exclude,glob)**/*.legacy/**',
]

function filesNaming(pattern: string): string[] {
  const result = spawnSync(
    'git',
    ['grep', '--untracked', '-l', '-E', pattern, '--', ...PRODUCT_SOURCES],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0 && result.status !== 1)
    throw new Error(`git grep failed (${String(result.status)}): ${result.stderr}`)
  return result.stdout
    .split('\n')
    .filter(line => line !== '')
    .sort()
}

describe('only the work cache reads the Session current state from the store', () => {
  it('the handler names appear as text only where the handlers are defined, registered and read', () => {
    expect(filesNaming('[\'"`]session\\.work(-version)?[\'"`]')).toEqual([
      `${PACKAGE}/materials.ts`,
      `${PACKAGE}/participants.ts`,
      `${PACKAGE}/work-cache.ts`,
      `${PACKAGE}/worker/read-work-version.ts`,
      `${PACKAGE}/worker/read-work.ts`,
    ])
  })

  it('the handler constants are used only where they are declared', () => {
    expect(
      filesNaming(
        '(^|[^[:alnum:]_])(SESSION_WORK_HANDLER|WORK_HANDLER|WORK_VERSION_HANDLER)([^[:alnum:]_]|$)',
      ),
    ).toEqual([`${PACKAGE}/participants.ts`, `${PACKAGE}/work-cache.ts`])
  })
  it('the snapshot row is named only by its schema, the commit path and the listed readers', () => {
    expect(filesNaming('(^|[^[:alnum:]_])sl_state([^[:alnum:]_]|$)')).toEqual([
      `${PACKAGE}/materials.ts`,
      `${PACKAGE}/worker/check.ts`,
      `${PACKAGE}/worker/entries.ts`,
      `${PACKAGE}/worker/log.ts`,
      `${PACKAGE}/worker/participant.ts`,
      `${PACKAGE}/worker/read-model-selection.ts`,
      `${PACKAGE}/worker/run-live-guard.ts`,
      `${PACKAGE}/worker/schema.ts`,
      `${PACKAGE}/worker/session-list-migration.ts`,
      `${PACKAGE}/worker/state-rows.ts`,
      'packages/storage/sql-contract/src/testing/manifest-vector.ts',
    ])
  })
})
