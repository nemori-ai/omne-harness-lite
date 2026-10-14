// @module-tag slow
// Every case spawns the built bin as a child process.
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { builtDist, createSandbox, runCli, type Sandbox } from './support/cli-process.ts'
import { expectedHelp, expectedVersion, identityFailure } from './support/expected.ts'

const runsAsRoot = process.getuid?.() === 0

let sandbox: Sandbox
beforeEach(() => {
  sandbox = createSandbox()
})
afterEach(() => {
  sandbox.remove()
})

function copyDist(): string {
  const copy = join(sandbox.root, 'copied-dist')
  cpSync(builtDist, copy, { recursive: true })
  return copy
}

describe('omne --help', () => {
  it('prints the help text on stdout and exits 0 from a directory outside the repository', () => {
    expect(runCli(sandbox, ['--help'])).toEqual({ status: 0, stdout: expectedHelp, stderr: '' })
  })
})

describe('omne --version', () => {
  it('prints the version from the identity file the build wrote', () => {
    const identity: unknown = JSON.parse(readFileSync(join(builtDist, 'cli-identity.json'), 'utf8'))
    expect(identity).toEqual({ name: '@omne-harness/cli', version: '0.0.0' })
    expect(runCli(sandbox, ['--version'])).toEqual({
      status: 0,
      stdout: expectedVersion,
      stderr: '',
    })
  })

  it('reads the identity beside the running build, not the package manifest', () => {
    const copy = copyDist()
    writeFileSync(
      join(copy, 'cli-identity.json'),
      JSON.stringify({ name: '@omne-harness/cli', version: '7.7.7-copy' }),
    )
    expect(runCli(sandbox, ['--version'], { bin: join(copy, 'bin.js') })).toEqual({
      status: 0,
      stdout: '7.7.7-copy\n',
      stderr: '',
    })
  })

  it('exits 1 without a version when the identity file is missing', () => {
    const copy = copyDist()
    rmSync(join(copy, 'cli-identity.json'))
    expect(runCli(sandbox, ['--version'], { bin: join(copy, 'bin.js') })).toEqual({
      status: 1,
      stdout: '',
      stderr: identityFailure,
    })
  })

  it.each([
    ['is not JSON', '{"version": '],
    ['has a numeric version', JSON.stringify({ name: '@omne-harness/cli', version: 1 })],
    ['has no version', JSON.stringify({ name: '@omne-harness/cli' })],
    ['is a JSON string', JSON.stringify('0.0.0')],
    ['is JSON null', 'null'],
  ])('exits 1 without a version when the identity %s', (_, content) => {
    const copy = copyDist()
    writeFileSync(join(copy, 'cli-identity.json'), content)
    expect(runCli(sandbox, ['--version'], { bin: join(copy, 'bin.js') })).toEqual({
      status: 1,
      stdout: '',
      stderr: identityFailure,
    })
  })

  it.skipIf(runsAsRoot)('exits 1 without a version when the identity file is unreadable', () => {
    const copy = copyDist()
    const identity = join(copy, 'cli-identity.json')
    chmodSync(identity, 0o000)
    try {
      expect(runCli(sandbox, ['--version'], { bin: join(copy, 'bin.js') })).toEqual({
        status: 1,
        stdout: '',
        stderr: identityFailure,
      })
    } finally {
      chmodSync(identity, 0o644)
    }
  })
})

describe.each([
  ['--help', expectedHelp],
  ['--version', expectedVersion],
])('omne %s leaves the state directory alone', (flag, stdout) => {
  const success = { status: 0, stdout, stderr: '' }

  it('does not create a missing OMNE_HOME', () => {
    const omneHome = join(sandbox.root, 'missing', 'state')
    expect(runCli(sandbox, [flag], { omneHome })).toEqual(success)
    expect(existsSync(join(sandbox.root, 'missing'))).toBe(false)
  })

  it('does not create the default $HOME/.omne when OMNE_HOME is unset', () => {
    expect(runCli(sandbox, [flag])).toEqual(success)
    expect(readdirSync(sandbox.home)).toEqual([])
  })

  it.skipIf(runsAsRoot)('succeeds when OMNE_HOME is an unreadable directory', () => {
    const omneHome = join(sandbox.root, 'locked')
    mkdirSync(omneHome)
    writeFileSync(join(omneHome, 'sentinel'), 'kept')
    chmodSync(omneHome, 0o000)
    try {
      expect(runCli(sandbox, [flag], { omneHome })).toEqual(success)
    } finally {
      chmodSync(omneHome, 0o755)
    }
    expect(readdirSync(omneHome)).toEqual(['sentinel'])
  })

  it('succeeds when OMNE_HOME is a regular file and leaves the file unchanged', () => {
    const omneHome = join(sandbox.root, 'state-file')
    writeFileSync(omneHome, 'not a directory')
    expect(runCli(sandbox, [flag], { omneHome })).toEqual(success)
    expect(statSync(omneHome).isFile()).toBe(true)
    expect(readFileSync(omneHome, 'utf8')).toBe('not a directory')
  })

  it('leaves the entries and modification time of an existing OMNE_HOME unchanged', () => {
    const omneHome = join(sandbox.root, 'existing')
    mkdirSync(omneHome)
    writeFileSync(join(omneHome, 'sentinel'), 'kept')
    const past = new Date('2020-01-02T03:04:05Z')
    utimesSync(omneHome, past, past)
    expect(runCli(sandbox, [flag], { omneHome })).toEqual(success)
    expect(readdirSync(omneHome)).toEqual(['sentinel'])
    expect(statSync(omneHome).mtime).toEqual(past)
  })
})
