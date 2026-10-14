// @module-tag slow
// Every case spawns the built bin as a child process.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createSandbox, runCli, type Sandbox } from './support/cli-process.ts'
import { homeRequiresDirectory, missingCommand, unrecognizedArguments } from './support/expected.ts'

let sandbox: Sandbox
let omneHome: string
beforeEach(() => {
  sandbox = createSandbox()
  omneHome = join(sandbox.root, 'missing-state')
})
afterEach(() => {
  sandbox.remove()
})

function expectUsageError(argv: readonly string[], stderr: string): void {
  expect(runCli(sandbox, argv, { omneHome })).toEqual({ status: 2, stdout: '', stderr })
  expect(existsSync(omneHome)).toBe(false)
  expect(readdirSync(sandbox.home)).toEqual([])
}

it('exits 2 with no arguments', () => {
  expectUsageError([], missingCommand)
})

it.each([[['-h']], [['-v']], [['status']], [['--help', '--version']], [['--version', '--help']]])(
  'exits 2 for %j',
  argv => {
    expectUsageError(argv, unrecognizedArguments)
  },
)

it.each([[['--home']], [['--version', '--home']], [['--home', '--help']]])(
  'exits 2 for %j because --home has no directory',
  argv => {
    expectUsageError(argv, homeRequiresDirectory)
  },
)

it.each([
  ['--help', '--home'],
  ['--version', '--home'],
])('exits 2 for %s with --home and does not create the named directory', (flag, home) => {
  const named = join(sandbox.root, 'named', 'state')
  expectUsageError([flag, home, named], unrecognizedArguments)
  expect(existsSync(join(sandbox.root, 'named'))).toBe(false)
})
