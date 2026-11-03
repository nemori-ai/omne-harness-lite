// The boundary of the direct readers of the Session current state (SPEC RT-04「当前状态的拥有者与直接读者」).
// The work cache is the only in-memory owner of `session.work`: no other product source names the
// `session.work` or `session.work-version` handler, so no other module reads the snapshot from the
// store past the cache. The check runs `git grep` over the product sources of the repository
// (every `src` of `packages` and `apps`, tracked and untracked, archives left out), so a new direct
// reader anywhere turns it red, not only one in this package.
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

/** The product source files, relative to the repository root, whose text matches `pattern`. */
function filesNaming(pattern: string): string[] {
  const result = spawnSync(
    'git',
    ['grep', '--untracked', '-l', '-E', pattern, '--', ...PRODUCT_SOURCES],
    { cwd: ROOT, encoding: 'utf8' },
  )
  // 0: matches, 1: none; anything else is a failure of the check itself, never a pass.
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
    expect(filesNaming('\\b(SESSION_WORK_HANDLER|WORK_HANDLER|WORK_VERSION_HANDLER)\\b')).toEqual([
      `${PACKAGE}/participants.ts`,
      `${PACKAGE}/work-cache.ts`,
    ])
  })
})
