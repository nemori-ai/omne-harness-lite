// @module-tag slow
// Fresh native processes exercise publication snapshots, real compilation and failure recovery.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each(['src', 'dist'])(
  'default owner publication and retry through the %s public entry',
  mode => {
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        fileURLToPath(new URL('./default-owner-worker.mjs', import.meta.url)),
        mode,
      ],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(output)).toMatchObject({
      mode,
      importedCompilations: 0,
      retry: true,
      snapshot: true,
      cached: true,
    })
  },
  30000,
)
