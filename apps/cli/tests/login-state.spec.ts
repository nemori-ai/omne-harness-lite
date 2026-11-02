import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureStateDirectory,
  otherUsersCanRead,
  readLoginState,
  writeLoginState,
  type LoginState,
} from '@omne-harness/cli'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loginStateInvalid, notLoggedIn } from './support/expected.ts'
import { issuedProof, tenantText } from './support/fake-service.ts'

const onWindows = process.platform === 'win32'

let directory: string
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-login-')))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

const state: LoginState = {
  version: 1,
  server: 'http://127.0.0.1:8787',
  loginIdentifier: 'alice',
  issuedAt: '2026-11-01T12:00:00Z',
  tenantId: tenantText,
  loginProof: issuedProof,
}

describe('writeLoginState', () => {
  it('writes the six keys and leaves no temporary file', () => {
    const written = writeLoginState(directory, state)
    expect(written).toEqual({ kind: 'written', path: join(directory, 'login.json') })
    expect(JSON.parse(readFileSync(join(directory, 'login.json'), 'utf8'))).toEqual(state)
    expect(readdirSync(directory)).toEqual(['login.json'])
  })

  it.skipIf(onWindows)('gives the file mode 0600', () => {
    writeLoginState(directory, state)
    expect(statSync(join(directory, 'login.json')).mode & 0o777).toBe(0o600)
  })

  it('keeps the old file and leaves no temporary file when the rename fails', () => {
    const target = join(directory, 'login.json')
    mkdirSync(target)
    writeFileSync(join(target, 'sentinel'), 'kept')
    const written = writeLoginState(directory, state)
    expect(written.kind).toBe('failed')
    expect(written).toMatchObject({ path: target })
    expect(readdirSync(directory)).toEqual(['login.json'])
    expect(readdirSync(target)).toEqual(['sentinel'])
  })

  it('reports the failure when the directory does not exist', () => {
    const written = writeLoginState(join(directory, 'missing'), state)
    expect(written).toMatchObject({ kind: 'failed', code: 'ENOENT' })
  })
})

describe('readLoginState', () => {
  it('reads back what writeLoginState wrote', () => {
    writeLoginState(directory, state)
    expect(readLoginState(directory)).toEqual({ kind: 'state', state })
  })

  it('answers not logged in when the file or the directory is missing', () => {
    expect(readLoginState(directory)).toEqual({ kind: 'failure', message: notLoggedIn })
    expect(readLoginState(join(directory, 'missing'))).toEqual({
      kind: 'failure',
      message: notLoggedIn,
    })
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['a JSON array', '[]'],
    ['version 2', JSON.stringify({ ...state, version: 2 })],
    ['a missing key', JSON.stringify({ ...state, loginProof: undefined })],
    ['an empty proof', JSON.stringify({ ...state, loginProof: '' })],
    ['a numeric server', JSON.stringify({ ...state, server: 7 })],
    ['an extra key', JSON.stringify({ ...state, extra: true })],
    ['a tenant that is not a tenant text', JSON.stringify({ ...state, tenantId: 'nobody' })],
  ])('answers invalid for %s', (_name, content) => {
    writeFileSync(join(directory, 'login.json'), content)
    expect(readLoginState(directory, { checkPermissions: false })).toEqual({
      kind: 'failure',
      message: loginStateInvalid,
    })
  })

  it('reports a read failure that is not absence with the system code', () => {
    mkdirSync(join(directory, 'login.json'))
    const read = readLoginState(directory, { checkPermissions: false })
    expect(read.kind).toBe('failure')
    expect(read).toMatchObject({
      message: expect.stringMatching(/^omne: cannot read login state .*login\.json: [A-Z]+\n$/),
    })
  })

  it.skipIf(onWindows)('refuses a file that other users can read, on POSIX', () => {
    writeLoginState(directory, state)
    chmodSync(join(directory, 'login.json'), 0o644)
    expect(readLoginState(directory)).toEqual({
      kind: 'failure',
      message: 'omne: login state is readable by other users\n',
    })
  })

  it('does not check permissions on Windows, where the mode bits carry no meaning', () => {
    // On Windows a file written by Node reports mode 0666. Reading must still work there.
    writeLoginState(directory, state)
    chmodSync(join(directory, 'login.json'), 0o644)
    const read = readLoginState(directory)
    expect(read.kind).toBe(onWindows ? 'state' : 'failure')
  })
})

describe('otherUsersCanRead', () => {
  it.each([
    [0o600, false],
    [0o400, false],
    [0o700, false],
    [0o640, true],
    [0o604, true],
    [0o644, true],
    [0o666, true],
  ])('mode %o -> %s', (mode, readable) => {
    expect(otherUsersCanRead(mode)).toBe(readable)
  })
})

describe('ensureStateDirectory mode', () => {
  it.skipIf(onWindows)('creates a new directory with mode 0700 and leaves an old one alone', () => {
    const created = join(directory, 'a', 'state')
    expect(ensureStateDirectory(created)).toEqual({ kind: 'ready', path: created })
    expect(statSync(created).mode & 0o777).toBe(0o700)
    const old = join(directory, 'old')
    mkdirSync(old, { mode: 0o755 })
    chmodSync(old, 0o755)
    ensureStateDirectory(old)
    expect(statSync(old).mode & 0o777).toBe(0o755)
  })
})
