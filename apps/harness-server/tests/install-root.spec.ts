import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  installVersion,
  POINTER_FILE,
  switchVersion,
  VERSIONS_DIR,
} from '@omne-harness/assembly-cordis'
import { entryOfVersion, refusedByPointer } from '../src/local/install-root.ts'
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

describe('这一份构建是不是指针指着的那一版', () => {
  it('是：放行。指针指着别的一版、没有指针、不在安装根下、指针读不成：各有原因', () => {
    const root = emptyRoot()
    const one = installVersion(root, built('one')).version
    const two = installVersion(root, built('two')).version
    const entry = (version: string) => entryOfVersion(root, version)
    expect(entry(one)).toBe(join(root, VERSIONS_DIR, one, 'dist', 'bin.js'))
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
