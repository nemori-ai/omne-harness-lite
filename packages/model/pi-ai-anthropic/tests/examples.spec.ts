// @module-tag slow — runs the examples in Node child processes; each sends real requests to
// OpenRouter through the environment's proxy. It runs only when OMNE_LIVE_TESTS=1 and skips at run
// time otherwise: a `skipIf` would make the slow tier's pre-parse drop the whole file, even with
// the switch set. The examples import the built entries, so build the package and its dependencies
// first.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
/** A live round takes seconds; four rounds and a slow upstream stay well inside this. */
const CHILD_TIMEOUT_MS = 280_000

/** Runs one example and returns its output lines. A non-zero exit fails the test. */
function run(example: string): readonly string[] {
  // The child gets the inherited environment, HTTPS_PROXY included, without BASELINE.
  const { BASELINE: _inherited, ...env } = process.env
  const output = execFileSync(process.execPath, ['--experimental-strip-types', example], {
    cwd: packageDirectory,
    env,
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
  })
  return output.split('\n').filter(line => line !== '')
}

it('the Anthropic example sends once, turns reasoning off for the foreign tool turn and completes', ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const lines = run('examples/anthropic-request.ts')
  expect(lines).toContain('model: anthropic/claude-opus-5.5')
  expect(lines).toContain('parameter: reasoning-effort "none" (requested reasoning-effort "low")')
  expect(lines).toContain('diagnostic: {"kind":"reasoning-disabled","reason":"foreign-prefix"}')
  expect(lines).toContain('reasoning state: no')
  expect(lines.filter(line => line.startsWith('usage: '))).toHaveLength(1)
  expect(lines.filter(line => line.startsWith('termination: '))).toEqual([
    expect.stringMatching(/^termination: completed /),
  ])
}, 300_000)

it('the cross-family example leaves out the other family and carries its own state back', ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const lines = run('examples/cross-family-history.ts')
  expect(lines.filter(line => line.startsWith('round '))).toEqual([
    'round 1: openai/gpt-5.6-luna',
    'round 2: anthropic/claude-sonnet-5',
    'round 3: openai/gpt-5.6-luna',
    'round 4: anthropic/claude-sonnet-5',
  ])
  expect(lines.filter(line => line.startsWith('replay summary: '))).toEqual([
    'replay summary: carried [] omitted []',
    'replay summary: carried [] omitted [1]',
    'replay summary: carried [1] omitted [2]',
    'replay summary: carried [2] omitted [1, 3]',
  ])
  expect(lines.filter(line => line.startsWith('termination: '))).toEqual(
    Array.from({ length: 4 }, () => expect.stringMatching(/^termination: completed /)),
  )
}, 300_000)
