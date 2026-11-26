import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  entryOfVersion,
  installVersion,
  POINTER_FILE,
  readVersions,
  refusedByPointer,
  switchVersion,
  tellVersions,
  VERSIONS_DIR,
} from '../src/local/install-root.ts'
import { versionsCommand } from '../src/local/versions-command.ts'

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'install-root-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let count = 0
function built(mark: string): string {
  const directory = join(scratch, `built-${String(count++)}`)
  mkdirSync(join(directory, 'dist'), { recursive: true })
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ version: '1.2.3', bin: { 'harness-server': './dist/bin.js' } }),
  )
  writeFileSync(join(directory, 'dist', 'bin.js'), `// ${mark}\n`)
  symlinkSync('dist/bin.js', join(directory, 'link'))
  return directory
}
const emptyRoot = (): string => {
  const root = join(scratch, `root-${String(count++)}`)
  mkdirSync(root)
  return root
}

describe('安装根：一版一个目录', () => {
  it('装一版：目录名带版本与内容摘要；内容相同再装一次是同一版；内容不同是另一版', () => {
    const root = emptyRoot()
    const first = installVersion(root, built('one'))
    expect(first.outcome).toBe('moved')
    expect(first.version).toMatch(/^1\.2\.3-[0-9a-f]{12}$/)
    expect(readVersions(root)).toEqual({
      installed: { [first.version]: 'complete' },
      pointer: null,
    })
    expect(entryOfVersion(root, first.version)).toBe(
      join(root, VERSIONS_DIR, first.version, 'dist', 'bin.js'),
    )
    expect(readFileSync(join(root, VERSIONS_DIR, first.version, 'link'), 'utf8')).toBe('// one\n')

    expect(installVersion(root, built('one'))).toEqual({ version: first.version, outcome: 'same' })
    const other = installVersion(root, built('two'))
    expect(other.version).not.toBe(first.version)
    expect(Object.keys(readVersions(root).installed).sort()).toEqual(
      [first.version, other.version].sort(),
    )
  })

  it('装到一半中断留下的那一份算装到一半：切不过去；再装一次清掉重来', () => {
    const root = emptyRoot()
    const source = built('half')
    const { version } = installVersion(emptyRoot(), source)
    const partial = join(root, VERSIONS_DIR, `${version}.partial`)
    mkdirSync(partial, { recursive: true })
    writeFileSync(join(partial, 'left-over'), 'from the install that was cut')
    expect(readVersions(root)).toEqual({ installed: { [version]: 'partial' }, pointer: null })
    expect(switchVersion(root, version)).toEqual({ outcome: 'not-complete', pointer: null })
    expect(existsSync(join(root, POINTER_FILE))).toBe(false)

    expect(installVersion(root, source)).toEqual({ version, outcome: 'moved' })
    expect(readVersions(root).installed).toEqual({ [version]: 'complete' })
    expect(readdirSync(join(root, VERSIONS_DIR, version)).sort()).toEqual([
      'dist',
      'link',
      'package.json',
    ])
  })

  it('没装的版本切不过去，指针不动', () => {
    const root = emptyRoot()
    expect(switchVersion(root, '9.9.9-000000000000')).toEqual({
      outcome: 'not-complete',
      pointer: null,
    })
  })
})

describe('安装根：指针', () => {
  it('切到装好的一版；起稳了它成为退路；新的一版连着倒到上限退回它', () => {
    const root = emptyRoot()
    const good = installVersion(root, built('good')).version
    const bad = installVersion(root, built('bad')).version
    expect(switchVersion(root, good)).toEqual({
      outcome: 'moved',
      pointer: { current: good, previous: null, settled: false },
    })
    expect(tellVersions(root, good, 'settled')).toEqual({
      outcome: 'moved',
      pointer: { current: good, previous: good, settled: true },
    })
    switchVersion(root, bad)
    expect(JSON.parse(readFileSync(join(root, POINTER_FILE), 'utf8'))).toEqual({
      current: bad,
      previous: good,
      settled: false,
    })
    expect(tellVersions(root, bad, 'fell-to-limit')).toEqual({
      outcome: 'rolled-back',
      pointer: { current: good, previous: good, settled: true },
    })
    expect(tellVersions(root, good, 'fell-to-limit').outcome).toBe('no-fallback')
  })

  it('指针已经指着别的一版：起稳与倒到上限都不是说它的，指针不动', () => {
    const root = emptyRoot()
    const first = installVersion(root, built('first')).version
    const second = installVersion(root, built('second')).version
    switchVersion(root, first)
    switchVersion(root, second)
    const pointer = { current: second, previous: null, settled: false }
    expect(tellVersions(root, first, 'settled')).toEqual({ outcome: 'superseded', pointer })
    expect(tellVersions(root, first, 'fell-to-limit')).toEqual({ outcome: 'superseded', pointer })
    expect(readVersions(root).pointer).toEqual(pointer)
  })

  it('写指针写到一半留下的临时文件不算数：读到的是旧的完整内容', () => {
    const root = emptyRoot()
    const version = installVersion(root, built('whole')).version
    switchVersion(root, version)
    writeFileSync(join(root, `${POINTER_FILE}.tmp`), '{"current":"cut-of')
    expect(readVersions(root).pointer).toEqual({ current: version, previous: null, settled: false })
  })

  it('指针文件不是指针：读它是一个错，不当成没有', () => {
    const root = emptyRoot()
    writeFileSync(join(root, POINTER_FILE), '{"current":')
    expect(() => readVersions(root)).toThrow(/current\.json is not a pointer/)
  })
})

describe('这一份构建是不是指针指着的那一版', () => {
  it('是：放行。指针指着别的一版、没有指针、不在安装根下、指针读不成：各有原因', () => {
    const root = emptyRoot()
    const one = installVersion(root, built('one')).version
    const two = installVersion(root, built('two')).version
    const entry = (version: string) => entryOfVersion(root, version)
    expect(refusedByPointer(root, entry(one))).toBe(
      `version-not-current: the pointer under ${root} names no version; this build is ${one}`,
    )
    switchVersion(root, one)
    expect(refusedByPointer(root, entry(one))).toBeNull()
    expect(refusedByPointer(root, entry(two))).toBe(
      `version-not-current: the pointer under ${root} names ${one}; this build is ${two}`,
    )
    expect(refusedByPointer(root, join(built('elsewhere'), 'dist', 'bin.js'))).toBe(
      `version-not-current: the pointer under ${root} names ${one}; this build is not a version under it`,
    )
    writeFileSync(join(root, POINTER_FILE), 'not json')
    expect(refusedByPointer(root, entry(one))).toMatch(
      /^version-pointer-unreadable: .*not a pointer/,
    )
  })
})

describe('versions 子命令', () => {
  function run(argv: readonly string[]) {
    const out: unknown[] = []
    const err: string[] = []
    const code = versionsCommand(
      argv,
      line => out.push(JSON.parse(line)),
      line => err.push(line),
    )
    return { code, out, err }
  }

  it('装、切、看：每一步答一条记录；没装好的切不过去，以 3 退出；在用的不重装，以 3 退出', () => {
    const root = emptyRoot()
    const at = ['--install-root', root]
    const installed = run(['install', ...at, '--from', built('cli'), '--label', 'r1'])
    const version = (installed.out[0] as { version: string }).version
    expect(installed).toEqual({
      code: 0,
      out: [{ kind: 'version-installed', version, outcome: 'moved' }],
      err: [],
    })
    expect(version).toMatch(/^r1-[0-9a-f]{12}$/)

    expect(run(['switch', ...at, 'r9-000000000000'])).toEqual({
      code: 3,
      out: [
        {
          kind: 'version-switched',
          version: 'r9-000000000000',
          outcome: 'not-complete',
          pointer: null,
        },
      ],
      err: [],
    })
    const pointer = { current: version, previous: null, settled: false }
    expect(run(['switch', ...at, version])).toEqual({
      code: 0,
      out: [{ kind: 'version-switched', version, outcome: 'moved', pointer }],
      err: [],
    })
    expect(run(['switch', ...at, version]).out).toEqual([
      { kind: 'version-switched', version, outcome: 'same', pointer },
    ])
    expect(run(['install', ...at, '--from', built('cli'), '--label', 'r1'])).toEqual({
      code: 3,
      out: [{ kind: 'version-installed', version, outcome: 'in-use' }],
      err: [],
    })
    expect(run(['show', ...at])).toEqual({
      code: 0,
      out: [{ kind: 'versions', pointer, versions: [{ version, standing: 'trial' }] }],
      err: [],
    })
  })

  it('用法不对抛用法错；装不了的来源以 2 退出并写明', () => {
    const root = emptyRoot()
    expect(() => run(['show'])).toThrow(/--install-root must be an absolute path/)
    expect(() => run(['install', '--install-root', root])).toThrow(/--from must be an absolute/)
    expect(() => run(['remove', '--install-root', root])).toThrow(/expected install, switch/)
    const none = run(['install', '--install-root', root, '--from', join(scratch, 'not-there')])
    expect(none.code).toBe(2)
    expect(none.err.join()).toMatch(/^versions: .*not-there/)
    const named = run(['install', '--install-root', root, '--from', built('x'), '--label', 'a/b'])
    expect(named).toMatchObject({ code: 2, out: [] })
    expect(named.err.join()).toContain('a version is named by letters, digits')
  })
})
