import { parseArgv, productionCatalog, renderHelp } from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'
import {
  expectedHelp,
  homeRequiresDirectory,
  missingCommand,
  unrecognizedArguments,
} from './support/expected.ts'

describe('parseArgv success', () => {
  it('accepts exactly --help', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' })
  })

  it('accepts exactly --version', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' })
  })
})

describe('parseArgv usage errors', () => {
  it('rejects an empty argument list as a missing command', () => {
    expect(parseArgv([])).toEqual({ kind: 'usage-error', message: missingCommand })
  })

  it.each([
    [['--home']],
    [['--help', '--home']],
    [['--home', '--help']],
    [['--home', '-x']],
    [['--home', '/state', '--home']],
  ])('rejects %j because --home has no directory', argv => {
    expect(parseArgv(argv)).toEqual({ kind: 'usage-error', message: homeRequiresDirectory })
  })

  it.each([
    [['-h']],
    [['-v']],
    [['help']],
    [['--verbose']],
    [['--help', '--version']],
    [['--version', '--help']],
    [['--help', '--help']],
    [['--help', 'extra']],
    [['--home', '/state']],
    [['--help', '--home', '/state']],
    [['--home', '/state', '--version']],
    [['--home=/state', '--help']],
    [['--home', '']],
  ])('rejects %j as unrecognized arguments', argv => {
    expect(parseArgv(argv)).toEqual({ kind: 'usage-error', message: unrecognizedArguments })
  })
})

describe('production help', () => {
  it('matches the documented help text', () => {
    expect(renderHelp(productionCatalog)).toBe(expectedHelp)
  })
})
