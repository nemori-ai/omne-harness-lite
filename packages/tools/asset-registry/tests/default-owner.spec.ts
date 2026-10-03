// @module-tag slow
// Real compilation in fresh native processes, including the public AE dependency.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each(['src', 'dist'])(
  'default registry owner retries and reuses the %s public path',
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
      owners: 3,
      retry: true,
      snapshot: true,
      cached: true,
    })
  },
  30000,
)
