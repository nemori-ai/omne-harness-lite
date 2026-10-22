// @module-tag slow — runs the example in a Node child process, with an openssl child process and
// a real local HTTPS server.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

it('the public example sends once through the root entry and shows the refused content reference', () => {
  // The child gets the inherited environment without the repository's BASELINE override.
  const { BASELINE: _inherited, ...env } = process.env
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', 'examples/local-send.ts'],
    { cwd: packageDirectory, env, encoding: 'utf8', timeout: 30_000 },
  )
  expect(output.split('\n').filter(line => line !== '')).toEqual([
    expect.stringMatching(/^payload digest: [0-9a-f]{64}$/),
    'delta: hello',
    'delta:  world',
    'ended: completed',
    'content reference: unsupported /system/0',
  ])
})
