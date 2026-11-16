// @module-tag slow — runs the example in a Node child process; it sends a real request to
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

it('the OpenAI example sends once with an empty tool turn and an image, and completes', ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const { BASELINE: _inherited, ...env } = process.env
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', 'examples/openai-request.ts'],
    { cwd: packageDirectory, env, encoding: 'utf8', timeout: 120_000 },
  )
  const lines = output.split('\n').filter(line => line !== '')
  expect(lines).toContain('model: openai/gpt-5.6-luna')
  expect(lines).toContain('parameter: reasoning-effort "low"')
  expect(lines.filter(line => line.startsWith('usage: '))).toHaveLength(1)
  expect(lines.filter(line => line.startsWith('termination: '))).toEqual([
    expect.stringMatching(/^termination: completed /),
  ])
}, 150_000)
