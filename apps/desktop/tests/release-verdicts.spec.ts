import { describe, expect, it } from 'vitest'
import { asarFile, asarHeaderHash, readAsar, sha256 } from '../scripts/asar.ts'
import {
  launchProcesses,
  leftoverProcesses,
  missingKinds,
  parsePsListing,
  parseWindowsListing,
  type ProcessInfo,
} from '../scripts/release-processes.ts'
import { judgeSigning, parseAuthenticode, requiresSigning } from '../scripts/release-signing.ts'
import {
  judgeCookieKey,
  judgeStartup,
  observeCookieKey,
  type StartupObservation,
} from '../scripts/release-startup.ts'
import {
  checkAsarContents,
  checkManifest,
  type CheckResult,
  judgeRefusal,
  launchGate,
  pipeReply,
  summarize,
} from '../scripts/release-verdicts.ts'
import {
  COOKIE_KEY_CHECKED_MESSAGE,
  COOKIE_KEY_MISMATCH_MESSAGE,
  COOKIE_KEY_STORED_MESSAGE,
  REMOTE_DEBUGGING_REFUSED_MESSAGE,
} from '../src/startup-signals.ts'

const result = (id: number, status: CheckResult['status'], reason = 'why'): CheckResult => ({
  id,
  name: `c${id}`,
  status,
  reason,
})
const line = (record: object) => JSON.stringify({ process: 'main', ...record })

describe('结论', () => {
  it('失败为 1；1 到 4 有跳过、缺了或没写理由的不算验过；签名只在要发行时算必需', () => {
    const passed = [1, 2, 3, 4].map(id => result(id, 'pass'))
    expect(summarize([...passed, result(5, 'skipped')]).exitCode).toBe(0)
    expect(summarize([...passed, result(5, 'skipped')], { signingRequired: true }).exitCode).toBe(2)
    expect(summarize([...passed.slice(0, 3), result(4, 'skipped')]).exitCode).toBe(2)
    expect(summarize(passed.slice(0, 3)).exitCode).toBe(2)
    expect(summarize([...passed.slice(0, 3), result(4, 'pass', ' ')]).exitCode).toBe(1)
    expect(summarize([...passed.slice(0, 3), result(4, 'fail')]).exitCode).toBe(1)
  })

  it('Linux 沙箱起不来：跳过要起应用的检查并说怎样打开，或按开关不带沙箱跑', () => {
    expect(launchGate('darwin', 'x', false)).toEqual({ run: true, switches: [] })
    expect(launchGate('linux', 'runs as root (euid 0)', false).note).toContain('other than root')
    expect(
      launchGate('linux', 'kernel.apparmor_restrict_unprivileged_userns=1', false).note,
    ).toContain('apparmor')
    expect(launchGate('linux', 'x', true)).toMatchObject({ run: true, switches: ['--no-sandbox'] })
    expect(launchGate('linux', 'x', false, true).note).toContain('replaced a chrome-sandbox')
  })
})

describe('包里的文件', () => {
  function archive(files: Record<string, string>, extra: Record<string, unknown> = {}) {
    let offset = 0
    const header: Record<string, unknown> = {}
    const data: Buffer[] = []
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split('/')
      let node = header
      for (const part of parts.slice(0, -1))
        node = ((node[part] ??= { files: {} }) as { files: Record<string, unknown> }).files
      const bytes = Buffer.from(text)
      node[parts.at(-1)!] = {
        size: bytes.length,
        offset: String(offset),
        integrity: { hash: sha256(bytes) },
        ...extra,
      }
      data.push(bytes)
      offset += bytes.length
    }
    const json = Buffer.from(JSON.stringify({ files: header }))
    const pickle = Buffer.alloc(16)
    pickle.writeUInt32LE(4, 0)
    pickle.writeUInt32LE(json.length + 8, 4)
    pickle.writeUInt32LE(json.length + 4, 8)
    pickle.writeUInt32LE(json.length, 12)
    return Buffer.concat([pickle, json, ...data])
  }

  it('读出文件与完整性；与 dist/release 逐字节一致才通过', () => {
    const files = { 'package.json': '{}', 'main/main.js': 'm', 'page/index.html': 'p' }
    const bytes = archive(files)
    const asar = readAsar(bytes)
    expect(asarFile(bytes, asar, 'main/main.js').toString()).toBe('m')
    expect(asarHeaderHash(asar)).toHaveLength(64)
    const built = new Map(Object.entries(files).map(([path, text]) => [path, sha256(text)]))
    const digest = (path: string) => sha256(asarFile(bytes, asar, path))
    expect(checkAsarContents(asar.entries, built, digest).problems).toEqual([])
    const changed = new Map([
      ...built,
      ['main/main.js', sha256('other')],
      ['utility/entry.js', 'u'],
    ])
    expect(checkAsarContents(asar.entries, changed, digest).problems).toEqual([
      'main/main.js in app.asar is not the file in dist/release',
      'app.asar does not contain utility/entry.js',
    ])
    const fewer = new Map([...built].filter(([path]) => path !== 'page/index.html'))
    expect(checkAsarContents(asar.entries, fewer, digest).problems).toEqual([
      'app.asar contains page, which the release build does not',
      'app.asar contains page/index.html, which the release build does not',
    ])
    const unpacked = readAsar(archive({ 'a.js': 'a' }, { unpacked: true }))
    expect(
      checkAsarContents(unpacked.entries, new Map([['a.js', sha256('a')]]), digest).problems,
    ).toEqual(['app.asar keeps a.js unpacked, outside the archive'])
  })

  it.each([
    { size: -1, offset: '0' },
    { size: null, offset: '0' },
    { size: '1', offset: '0' },
    { size: 1 },
    { size: 1, offset: '-1' },
    { size: 0, offset: '' },
    { size: 0, offset: false },
    { size: 1, offset: null },
    { size: 1, offset: '9007199254740992' },
  ])('文件记录的大小或偏移不合法就拒绝：%j', record => {
    const json = JSON.stringify({ files: { bad: record } })
    const pickle = Buffer.alloc(16)
    pickle.writeUInt32LE(4, 0)
    pickle.writeUInt32LE(json.length + 8, 4)
    pickle.writeUInt32LE(json.length + 4, 8)
    pickle.writeUInt32LE(json.length, 12)
    expect(() => readAsar(Buffer.concat([pickle, Buffer.from(json)]))).toThrow(
      'no valid size or offset',
    )
  })

  it('数据区末尾的空文件读得出来', () => {
    const bytes = archive({ nonempty: 'data', empty: '' })
    expect(asarFile(bytes, readAsar(bytes), 'empty')).toHaveLength(0)
  })

  it('package.json 从主进程包进，名字与版本对得上', () => {
    const expected = { name: 'omne', productName: 'omne', version: '1.0.0' }
    expect(checkManifest({ ...expected, main: 'main/main.js' }, expected).problems).toEqual([])
    expect(
      checkManifest({ ...expected, main: 'x.js', version: '2' }, expected).problems,
    ).toHaveLength(2)
    expect(checkManifest('x', expected).problems).toHaveLength(1)
  })
})

describe('拒绝远程调试的那次启动', () => {
  const refused = {
    code: 97,
    signal: null,
    timedOut: false,
    stdout: line({ msg: REMOTE_DEBUGGING_REFUSED_MESSAGE, switch: 'remote-debugging-port' }),
  }
  it('只认退出码 97、一行拒绝、开关对、没起别的、端点没开、没有残留', () => {
    expect(judgeRefusal(refused, 'remote-debugging-port', { listened: false }).ok).toBe(true)
    const fails = [
      judgeRefusal(refused, 'remote-debugging-port', { listened: true }),
      judgeRefusal(refused, 'remote-debugging-port', { listened: false, answered: true }),
      judgeRefusal({ ...refused, code: 0 }, 'remote-debugging-port', { listened: false }),
      judgeRefusal(refused, 'remote-debugging-pipe', { listened: false }),
      judgeRefusal(
        { ...refused, stdout: `${line({ msg: 'build profile' })}\n${refused.stdout}` },
        'remote-debugging-port',
        { listened: false },
      ),
      judgeRefusal(refused, 'remote-debugging-port', { listened: false }, [
        { pid: 9, ppid: 1, command: 'x' },
      ]),
    ]
    for (const verdict of fails) expect(verdict.ok).toBe(false)
    expect(pipeReply('junk\0{"id":1,"result":{"product":"Chrome/1"}}\0', 1)).toEqual({
      product: 'Chrome/1',
    })
    expect(pipeReply('{"id":2,"result":{}}', 1)).toBeUndefined()
  })
})

describe('进程归属', () => {
  const ROOT = { pid: 100, spawnedAt: Date.parse('Fri Nov 20 12:00:00 2026') }
  const LOCATION = { command: '/o/omne.app/Contents/MacOS/omne', processDir: '/o/omne.app' }
  const at = (seconds: number) => ROOT.spawnedAt + seconds * 1000
  const proc = (
    pid: number,
    ppid: number,
    command: string,
    startedAt = at(1),
    pgid = 1,
  ): ProcessInfo => ({ pid, ppid, pgid, command, startedAt })

  it('只算启动建出的：之前就在的、启动前开始的、僵尸都不算；子孙、同组、同目录的算', () => {
    const listing = [
      proc(100, 1, '/o/omne.app/Contents/MacOS/omne', at(0), 100),
      proc(101, 100, '/o/omne.app/Contents/Frameworks/omne Helper (Renderer) --type=renderer'),
      proc(102, 1, 'stray helper', at(1), 100),
      proc(
        103,
        1,
        '/o/omne.app/Contents/Frameworks/x --type=utility --utility-sub-type=node.mojom.NodeService',
      ),
      proc(200, 1, '/o/omne.app/Contents/MacOS/omne', at(-60)),
      proc(201, 1, 'unrelated'),
      { ...proc(104, 100, 'zombie'), zombie: true },
    ]
    const created = launchProcesses(listing, ROOT, new Set([200]), LOCATION, 'darwin').map(
      process => process.pid,
    )
    expect(created).toEqual([100, 101, 102, 103])
    const kinds = launchProcesses(listing, ROOT, new Set([200]), LOCATION, 'darwin')
    expect(missingKinds(kinds, 100)).toEqual([])
    const left = leftoverProcesses(
      [listing[1]!, listing[4]!],
      kinds,
      ROOT,
      new Set([200]),
      LOCATION,
      'darwin',
    )
    expect(left.map(process => process.pid)).toEqual([101])
  })

  it('读 ps 与 Windows 的进程清单', () => {
    const ps =
      '  100     1   100 Ss   Fri Nov 20 12:00:00 2026     /o/omne --flag\n  101   100   100 Z    Fri Nov 20 12:00:01 2026     [x]\n'
    expect(parsePsListing(ps)).toMatchObject([
      { pid: 100, pgid: 100, command: '/o/omne --flag', zombie: false },
      { pid: 101, zombie: true },
    ])
    expect(
      parseWindowsListing(
        '{"ProcessId":5,"ParentProcessId":1,"ExecutablePath":"C:\\\\a.exe","CommandLine":"a","Created":7}',
      ),
    ).toEqual([{ pid: 5, ppid: 1, command: 'a', executable: 'C:\\a.exe', startedAt: 7 }])
    expect(() => parseWindowsListing('nope')).toThrow('not JSON')
  })
})

describe('启动冒烟', () => {
  const good: StartupObservation = {
    platform: 'darwin',
    rootPid: 1,
    profile: 'release',
    readyMs: 900,
    readyTimeoutMs: 30_000,
    quit: {
      method: 'SIGTERM',
      outcome: { code: 0, signal: null, timedOut: false, stdout: '' },
      ms: 60,
      timeoutMs: 15_000,
    },
    launched: [
      { pid: 1, ppid: 0, command: 'main' },
      { pid: 2, ppid: 1, command: 'x --type=renderer' },
      { pid: 3, ppid: 1, command: 'x --type=utility --utility-sub-type=node.mojom.NodeService' },
    ],
    leftovers: [],
    userData: { written: ['Local State', 'Partitions'], missing: [] },
    realUserData: { path: '/u/omne', before: 'absent', after: 'absent' },
    cookieKey: observeCookieKey([], false),
  }

  it('报 release、窗口就绪、退出 0、进程全走、只写给它的目录才通过', () => {
    expect(judgeStartup(good).status).toBe('pass')
    const failures: Partial<StartupObservation>[] = [
      { profile: 'test' },
      { profile: undefined },
      { readyMs: undefined },
      { quit: { ...good.quit!, outcome: { code: 1, signal: null, timedOut: false, stdout: '' } } },
      { leftovers: [{ pid: 2, ppid: 1, command: 'x --type=renderer' }] },
      { launched: good.launched.slice(0, 2) },
      { userData: { written: [], missing: ['Local State'] } },
      { realUserData: { path: '/u/omne', before: 'absent', after: 'dir' } },
    ]
    for (const change of failures) expect(judgeStartup({ ...good, ...change }).status).toBe('fail')
    const locked = judgeStartup({ ...good, readyMs: undefined, screenAtFailure: { locked: true } })
    expect(locked.reason).toContain('locked')
  })

  it('cookie 密钥：Windows 上新目录要各有一次存下与核对，别处一行都不能有', () => {
    const lines = [{ msg: COOKIE_KEY_STORED_MESSAGE, ms: 120 }, { msg: COOKIE_KEY_CHECKED_MESSAGE }]
    expect(judgeCookieKey('win32', observeCookieKey(lines, false)).problems).toEqual([])
    expect(judgeCookieKey('win32', observeCookieKey([], false)).problems).toHaveLength(1)
    expect(
      judgeCookieKey(
        'win32',
        observeCookieKey([...lines, { msg: COOKIE_KEY_MISMATCH_MESSAGE }], true),
      ).problems,
    ).toHaveLength(2)
    expect(judgeCookieKey('darwin', observeCookieKey(lines, false)).problems).toHaveLength(1)
  })
})

describe('签名', () => {
  it('本地包可以不签；要发行的 macOS 与 Windows 包必须签好；Linux 没有这一项', () => {
    expect(judgeSigning({ platform: 'darwin', signature: 'adhoc' }, false).status).toBe('skipped')
    expect(judgeSigning({ platform: 'darwin', signature: 'adhoc' }, true).status).toBe('fail')
    const ok = { ok: true, output: 'source=Notarized Developer ID' }
    expect(
      judgeSigning(
        { platform: 'darwin', signature: 'identity', verify: ok, staple: ok, gatekeeper: ok },
        true,
      ).status,
    ).toBe('pass')
    expect(
      judgeSigning(
        {
          platform: 'darwin',
          signature: 'identity',
          verify: ok,
          staple: { ok: false, output: 'no' },
          gatekeeper: ok,
        },
        true,
      ).status,
    ).toBe('fail')
    expect(
      judgeSigning(parseAuthenticode('{"Status":"NotSigned","StatusMessage":"m"}'), false).status,
    ).toBe('skipped')
    expect(
      judgeSigning(parseAuthenticode('{"Status":"NotSigned","StatusMessage":"m"}'), true).status,
    ).toBe('fail')
    expect(judgeSigning(parseAuthenticode('{"Status":"Valid","Signer":"CN=x"}'), true).status).toBe(
      'pass',
    )
    expect(judgeSigning({ platform: 'linux' }, true).status).toBe('skipped')
    expect(requiresSigning('linux', true)).toBe(false)
    expect(requiresSigning('win32', true)).toBe(true)
  })
})
