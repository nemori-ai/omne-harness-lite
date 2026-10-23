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

it('the Anthropic example sends once after a foreign tool turn with reasoning on and completes', ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const lines = run('examples/anthropic-request.ts')
  expect(lines).toContain('model: anthropic/claude-opus-5.5')
  expect(lines.filter(line => line.startsWith('parameter: reasoning-effort '))).toEqual([
    'parameter: reasoning-effort "low"',
  ])
  expect(lines.filter(line => line.includes('reasoning-disabled'))).toEqual([])
  expect(lines.filter(line => line.startsWith('usage: '))).toHaveLength(1)
  expect(lines.filter(line => line.startsWith('termination: '))).toEqual([
    expect.stringMatching(/^termination: completed /),
  ])
}, 300_000)

/** The family of a model name: the part before the slash. */
function familyOf(model: string): string {
  return model.slice(0, model.indexOf('/'))
}

/**
 * The replay summary that each round must print, derived from the models of the rounds and from
 * which earlier replies carried a state: a state of the same family goes back, a state of the
 * other family is left out, and a reply without a state is in neither list.
 */
function expectedSummaries(
  models: readonly string[],
  states: ReadonlyMap<number, boolean>,
): readonly string[] {
  return models.map((model, at) => {
    const carried: number[] = []
    const omitted: number[] = []
    for (let earlier = 1; earlier <= at; earlier += 1) {
      if (states.get(earlier) !== true) continue
      const earlierModel = models[earlier - 1] ?? ''
      if (familyOf(earlierModel) === familyOf(model)) carried.push(earlier)
      else omitted.push(earlier)
    }
    return `replay summary: carried [${carried.join(', ')}] omitted [${omitted.join(', ')}]`
  })
}

it('the cross-family example leaves out the other family and carries its own state back', ctx => {
  if (process.env.OMNE_LIVE_TESTS !== '1') ctx.skip()
  const lines = run('examples/cross-family-history.ts')
  const rounds = lines.filter(line => line.startsWith('round '))
  expect(rounds).toEqual([
    'round 1: openai/gpt-5.6-luna',
    'round 2: anthropic/claude-opus-5.5',
    'round 3: openai/gpt-5.6-luna',
    'round 4: anthropic/claude-opus-5.5',
  ])
  expect(lines.filter(line => line.startsWith('termination: '))).toEqual(
    Array.from({ length: 4 }, () => expect.stringMatching(/^termination: completed /)),
  )
  const states = new Map<number, boolean>()
  for (const line of lines) {
    const match = /^reply state: round (\d+) (yes|no)$/.exec(line)
    if (match !== null) states.set(Number(match[1]), match[2] === 'yes')
  }
  expect([...states.keys()]).toEqual([1, 2, 3, 4])
  const models = rounds.map(line => line.slice(line.indexOf(': ') + 2))
  expect(lines.filter(line => line.startsWith('replay summary: '))).toEqual(
    expectedSummaries(models, states),
  )
  // The mechanism is exercised only when each family returned a state at least once in a round
  // that a later round reads; the state of the last round goes into no request.
  for (const family of ['openai', 'anthropic']) {
    const read = models.some(
      (model, at) =>
        at < models.length - 1 && familyOf(model) === family && states.get(at + 1) === true,
    )
    if (!read)
      expect.fail(
        `the upstream returned no ${family} reasoning state in rounds 1 to ${models.length - 1}, so the omission and carry paths of that family were not exercised`,
      )
  }
}, 300_000)
