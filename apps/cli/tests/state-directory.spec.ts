import { ensureStateDirectory, resolveStateDirectory } from '@omne-harness/cli'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const runsAsRoot = process.getuid?.() === 0
// Windows cannot make a directory unwritable with chmod: the mode only toggles the read-only
// attribute, which does not stop a new entry. An ACL deny does not hold in an elevated session.
const cannotDenyWrite = runsAsRoot || process.platform === 'win32'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-state-')))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveStateDirectory precedence', () => {
  it('prefers a non-blank --home flag over OMNE_HOME and the default', () => {
    expect(
      resolveStateDirectory({ flag: '/from/flag', environment: '/from/env', home: '/h' }),
    ).toEqual({
      kind: 'resolved',
      path: '/from/flag',
      source: 'flag',
    })
  })

  it('trims the flag value', () => {
    expect(
      resolveStateDirectory({ flag: '  /from/flag \t', environment: undefined, home: '/h' }),
    ).toEqual({
      kind: 'resolved',
      path: '/from/flag',
      source: 'flag',
    })
  })

  it('falls through a blank flag to OMNE_HOME', () => {
    expect(resolveStateDirectory({ flag: '   ', environment: '/from/env', home: '/h' })).toEqual({
      kind: 'resolved',
      path: '/from/env',
      source: 'environment',
    })
  })

  it('prefers a trimmed non-blank OMNE_HOME over the default', () => {
    expect(
      resolveStateDirectory({ flag: undefined, environment: ' /from/env ', home: '/h' }),
    ).toEqual({
      kind: 'resolved',
      path: '/from/env',
      source: 'environment',
    })
  })

  it('defaults to .omne under the home directory', () => {
    // An absolute home in the form of the platform: `/h` on POSIX, `<drive>:\h` on Windows.
    const home = resolve('/h')
    expect(resolveStateDirectory({ flag: undefined, environment: undefined, home })).toEqual({
      kind: 'resolved',
      path: `${home}${sep}.omne`,
      source: 'default',
    })
  })
})

describe('resolveStateDirectory errors', () => {
  it.each([[''], ['   '], ['\t\n']])(
    'rejects OMNE_HOME %j instead of selecting the default',
    environment => {
      const home = join(root, 'home')
      mkdirSync(home)
      expect(resolveStateDirectory({ flag: undefined, environment, home })).toEqual({
        kind: 'error',
        message: 'omne: OMNE_HOME is empty\n',
      })
      expect(existsSync(join(home, '.omne'))).toBe(false)
    },
  )

  it.each([[undefined], ['']])(
    'rejects a missing home directory %j when the default is needed',
    home => {
      expect(resolveStateDirectory({ flag: undefined, environment: undefined, home })).toEqual({
        kind: 'error',
        message: 'omne: no home directory for the default state path\n',
      })
    },
  )
})

describe('resolveStateDirectory does not touch the filesystem', () => {
  it('creates none of the flag, environment, or default paths', () => {
    const flag = join(root, 'flag', 'state')
    const environment = join(root, 'env', 'state')
    const home = join(root, 'home')
    expect(resolveStateDirectory({ flag, environment, home })).toMatchObject({ path: flag })
    expect(resolveStateDirectory({ flag: undefined, environment, home })).toMatchObject({
      path: environment,
    })
    expect(resolveStateDirectory({ flag: undefined, environment: undefined, home })).toMatchObject({
      path: join(home, '.omne'),
    })
    expect(readdirSync(root)).toEqual([])
  })

  it('resolves a path occupied by a regular file without inspecting it', () => {
    const occupied = join(root, 'occupied')
    writeFileSync(occupied, 'file')
    expect(
      resolveStateDirectory({ flag: occupied, environment: undefined, home: undefined }),
    ).toEqual({
      kind: 'resolved',
      path: occupied,
      source: 'flag',
    })
  })
})

describe('ensureStateDirectory', () => {
  it('creates a missing directory and its parents with nothing inside', () => {
    const target = join(root, 'a', 'b', 'state')
    expect(ensureStateDirectory(target)).toEqual({ kind: 'ready', path: target })
    expect(statSync(target).isDirectory()).toBe(true)
    expect(readdirSync(target)).toEqual([])
  })

  it('keeps an existing directory and its entries', () => {
    const target = join(root, 'state')
    mkdirSync(target)
    writeFileSync(join(target, 'sentinel'), 'kept')
    expect(ensureStateDirectory(target)).toEqual({ kind: 'ready', path: target })
    expect(readdirSync(target)).toEqual(['sentinel'])
    expect(readFileSync(join(target, 'sentinel'), 'utf8')).toBe('kept')
  })

  it('refuses a regular file at the path and leaves the file in place', () => {
    const target = join(root, 'state')
    writeFileSync(target, 'blocking')
    expect(ensureStateDirectory(target)).toEqual({
      kind: 'error',
      message: `omne: state directory ${target} is not a directory\n`,
    })
    expect(readFileSync(target, 'utf8')).toBe('blocking')
  })

  it('reports ENOTDIR when a parent is a regular file and leaves that file in place', () => {
    const parent = join(root, 'parent')
    writeFileSync(parent, 'blocking')
    const target = join(parent, 'state')
    expect(ensureStateDirectory(target)).toEqual({
      kind: 'error',
      message: `omne: cannot create state directory ${target}: ENOTDIR\n`,
    })
    expect(readFileSync(parent, 'utf8')).toBe('blocking')
  })

  it.skipIf(cannotDenyWrite)('reports EACCES when the parent is not writable', () => {
    const parent = join(root, 'read-only')
    mkdirSync(parent)
    chmodSync(parent, 0o555)
    const target = join(parent, 'state')
    try {
      expect(ensureStateDirectory(target)).toEqual({
        kind: 'error',
        message: `omne: cannot create state directory ${target}: EACCES\n`,
      })
    } finally {
      chmodSync(parent, 0o755)
    }
    expect(existsSync(target)).toBe(false)
  })
})
