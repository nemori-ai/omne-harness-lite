import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkCookieKeyProbe,
  COOKIE_KEY_FAILURE_TTL_MS,
  COOKIE_KEY_PROBE_TEXT,
  COOKIE_KEY_READ_ATTEMPTS,
  cookieKeyProbeLine,
  cookieKeyWriterArgs,
  cookieKeyWriterCrashHandler,
  type CookieKeyDeps,
  parseCookieKeyProbe,
  readCookieKeyState,
  storeCookieKeyFirst,
} from '../src/main/cookie-key.ts'
import { COOKIE_KEY_WRITER_FAILED_FILE } from '../src/startup-signals.ts'

const USER_DATA = '/ud'
const LOCAL_STATE = join(USER_DATA, 'Local State')
const RECORD = join(USER_DATA, COOKIE_KEY_WRITER_FAILED_FILE)
const WITH_KEY = JSON.stringify({ os_crypt: { encrypted_key: 'RFBBUEk=' } })
const NOW = new Date('2026-11-20T12:00:00Z')

function disk(files: Record<string, string>, afterWriter: Record<string, string> = {}) {
  const spawned: string[][] = []
  const deps: Partial<CookieKeyDeps> = {
    read: path => {
      if (path in files) return files[path]!
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    },
    write: (path, text) => void (files[path] = text),
    remove: path => void delete files[path],
    sleep: () => {},
    now: () => 0,
    date: () => NOW,
    spawn: (command, args) => {
      spawned.push([command, ...args])
      Object.assign(files, afterWriter)
      return { status: 0, stdout: cookieKeyProbeLine(new Uint8Array([1, 2, 3])) }
    },
  }
  return { files, spawned, deps }
}

const launch = (platform: NodeJS.Platform = 'win32') => ({
  platform,
  userData: USER_DATA,
  execPath: '/app/omne.exe',
  appPath: undefined,
  appVersion: '1.0.0',
})

describe('Windows 上预写 cookie 密钥', () => {
  it('不是 Windows，或者已经有密钥：不起写入者；有密钥时删掉失败记录', () => {
    const other = disk({})
    expect(storeCookieKeyFirst(launch('darwin'), other.deps)).toEqual({ kind: 'none' })
    const stored = disk({ [LOCAL_STATE]: WITH_KEY, [RECORD]: '{}' })
    expect(storeCookieKeyFirst(launch(), stored.deps)).toEqual({ kind: 'none' })
    expect(stored.spawned).toEqual([])
    expect(stored.files).not.toHaveProperty(RECORD)
  })

  it('没有密钥：起一份带开关、同一个目录、不用 GPU 的写入者，存下了就报 stored 并带探针', () => {
    const run = disk({}, { [LOCAL_STATE]: WITH_KEY })
    const outcome = storeCookieKeyFirst(launch(), run.deps)
    expect(run.spawned).toEqual([
      ['/app/omne.exe', ...cookieKeyWriterArgs({ userData: USER_DATA, appPath: undefined })],
    ])
    expect(run.spawned[0]).toContain('--omne-cookie-key-writer')
    expect(outcome).toMatchObject({ kind: 'ran', key: 'stored', status: 0, probe: 'AQID' })
    expect(cookieKeyWriterArgs({ userData: USER_DATA, appPath: '/dist/test' })[0]).toBe(
      '/dist/test',
    )
  })

  it('写入者之后还是没有密钥：留下失败记录，同一版本一天之内跳过，换版本或过期又跑', () => {
    const run = disk({})
    expect(storeCookieKeyFirst(launch(), run.deps)).toMatchObject({ kind: 'ran', key: 'missing' })
    expect(JSON.parse(run.files[RECORD]!)).toMatchObject({ version: '1.0.0' })
    expect(storeCookieKeyFirst(launch(), run.deps)).toEqual({
      kind: 'skipped',
      failedAt: NOW.toISOString(),
    })
    expect(storeCookieKeyFirst({ ...launch(), appVersion: '1.0.1' }, run.deps)).toMatchObject({
      kind: 'ran',
    })
    const later = new Date(NOW.getTime() + COOKIE_KEY_FAILURE_TTL_MS)
    expect(storeCookieKeyFirst(launch(), { ...run.deps, date: () => later })).toMatchObject({
      kind: 'ran',
    })
  })

  it('Local State 读不出：重读几次仍读不出就报 unknown，不留失败记录', () => {
    let reads = 0
    const run = disk({})
    const outcome = storeCookieKeyFirst(launch(), {
      ...run.deps,
      read: path => {
        if (path === LOCAL_STATE && run.spawned.length > 0) {
          reads += 1
          throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        }
        return run.deps.read!(path)
      },
    })
    expect(outcome).toMatchObject({ kind: 'ran', key: 'unknown', readError: 'busy' })
    expect(reads).toBe(COOKIE_KEY_READ_ATTEMPTS)
    expect(run.files).not.toHaveProperty(RECORD)
  })

  it('Local State 的几种样子', () => {
    const state = (text: string) => readCookieKeyState(USER_DATA, () => text)
    expect(state(WITH_KEY)).toEqual({ state: 'stored' })
    expect(state('{"os_crypt":{}}')).toEqual({ state: 'missing' })
    expect(state('{"os_crypt":{"encrypted_key":""}}')).toEqual({ state: 'missing' })
    expect(state('{half')).toHaveProperty('state', 'unknown')
  })

  it('探针：只认格式对的一行；解得回原文才算用的是存下的密钥；写入者出错立刻非零退出', () => {
    expect(parseCookieKeyProbe('noise\r\nCOOKIE_KEY_PROBE AQID\r\n')).toBe('AQID')
    expect(parseCookieKeyProbe('COOKIE_KEY_PROBE not base64!')).toBeUndefined()
    expect(checkCookieKeyProbe('AQID', () => COOKIE_KEY_PROBE_TEXT)).toEqual({ ok: true })
    expect(checkCookieKeyProbe('AQID', () => 'other')).toMatchObject({ ok: false })
    const thrown = checkCookieKeyProbe('AQID', () => {
      throw new Error('bad key')
    })
    expect(thrown).toEqual({ ok: false, reason: 'bad key' })
    const exits: number[] = []
    cookieKeyWriterCrashHandler(code => exits.push(code))()
    expect(exits).toEqual([1])
  })
})
