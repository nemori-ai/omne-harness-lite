// @module-tag slow
// Real SQLite input is seeded separately so each measured reader starts with no owner.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each(['src', 'dist'])(
  'default input-store owner retries and reuses the %s public path',
  mode => {
    const directory = mkdtempSync(join(tmpdir(), 'omne-eis-default-'))
    try {
      execFileSync(process.execPath, [
        '--experimental-strip-types',
        fileURLToPath(new URL('./default-owner-seed.mjs', import.meta.url)),
        directory,
      ])
      const output = execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          fileURLToPath(new URL('./default-owner-worker.mjs', import.meta.url)),
          mode,
          directory,
        ],
        { encoding: 'utf8' },
      )
      expect(JSON.parse(output)).toMatchObject({
        mode,
        importedCompilations: 0,
        owners: 3,
        retry: true,
        snapshot: true,
        cached: true,
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
  30000,
)
