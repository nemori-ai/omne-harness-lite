// 增量的纯函数部分（incremental.ts）：快照放在哪、怎样关、读不出时按没有快照处理、交给 Stryker 的只有上次被杀的、
// 去掉 Stryker 带回来的范围外变异体、补回复用的 static 变异体的运行记录。真起 Stryker 的见 mutation-stryker-incremental.spec.ts。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import {
  branchDirectory,
  dropCarriedOver,
  inScope,
  incrementalMode,
  memberFingerprint,
  nextStore,
  readStore,
  reusedCount,
  seedReport,
  storeFingerprint,
  storePath,
  withCarriedRuns,
  writeStore,
  type MemberFingerprint,
  type Store,
} from '../src/mutation/incremental.ts'
import type { MutationReport, ReportMutant } from '../src/mutation/report.ts'
import type { RunRecord } from '../src/mutation/run-reporter.ts'
import type { MutationTarget } from '../src/mutation/scope.ts'
import { temporary } from './fixtures/mutation.ts'

const MEMBER: TestMember = {
  path: 'packages/core/alpha',
  name: '@x/alpha',
  script: 'vitest run',
  dependencies: [],
}
/** a.ts 变异第 3～4 行，b.ts 整份变异。 */
const TARGET: MutationTarget = {
  member: MEMBER,
  lines: new Map([
    ['packages/core/alpha/src/a.ts', [[3, 4]] as const],
    ['packages/core/alpha/src/b.ts', [[1, Number.POSITIVE_INFINITY]] as const],
  ]),
}

const mutant = (
  id: string,
  line: number,
  status: ReportMutant['status'],
  extra: Partial<ReportMutant> = {},
): ReportMutant => ({
  id,
  mutatorName: 'ConditionalExpression',
  replacement: `r${id}`,
  status,
  location: { start: { line, column: 1 }, end: { line, column: 5 } },
  ...extra,
})

describe('快照的位置与开关', () => {
  it('分支名转成一层目录：斜杠与 Windows 不认的字符编码，. 与 .. 另起名字', () => {
    expect(branchDirectory('PanQiWei/cl-mutation')).toBe('PanQiWei%2Fcl-mutation')
    expect(branchDirectory('a\\b:c*d?e"f<g>h|i')).not.toMatch(/[\\/:*?"<>|]/u)
    expect(branchDirectory('..')).toBe('%..')
    expect(branchDirectory('a/b')).not.toBe(branchDirectory('a_b'))
  })

  it('缺省放在主检出的 tmp/mutation-incremental/<分支>/；参数或环境变量关掉；环境变量可改根目录', () => {
    const base = { disabled: false, force: false, mainRoot: '/main', branch: 'u/x', env: {} }
    expect(incrementalMode(base)).toEqual({
      kind: 'on',
      dir: join('/main', 'tmp', 'mutation-incremental', 'u%2Fx'),
      force: false,
    })
    expect(incrementalMode({ ...base, disabled: true })).toEqual({ kind: 'off' })
    expect(incrementalMode({ ...base, env: { OMNE_MUTATION_INCREMENTAL: '0' } })).toEqual({
      kind: 'off',
    })
    expect(incrementalMode({ ...base, env: { OMNE_MUTATION_INCREMENTAL: '1' } }).kind).toBe('on')
    expect(
      incrementalMode({ ...base, force: true, env: { OMNE_MUTATION_INCREMENTAL_HOME: '/h' } }),
    ).toEqual({ kind: 'on', dir: join('/h', 'u%2Fx'), force: true })
    expect(storePath('/s', 'packages/core/alpha')).toBe(join('/s', 'packages__core__alpha.json'))
  })

  it('指纹随用例时限变', () => {
    expect(storeFingerprint(60)).toBe(storeFingerprint(60))
    expect(storeFingerprint(60)).not.toBe(storeFingerprint(61))
  })
})

const STORE: Store = {
  report: {
    schemaVersion: '1.0',
    files: {
      'src/a.ts': {
        language: 'typescript',
        source: 'a',
        mutants: [
          mutant('1', 3, 'Killed', { killedBy: ['0'] } as Partial<ReportMutant>),
          mutant('2', 3, 'Survived'),
          mutant('3', 4, 'Timeout'),
          mutant('4', 4, 'RuntimeError'),
          mutant('5', 4, 'NoCoverage'),
        ],
      },
      'src/gone.ts': { language: 'typescript', source: 'g', mutants: [mutant('6', 1, 'Killed')] },
    },
    testFiles: { 'tests/a.spec.ts': { source: 't', tests: [{ id: '0', name: 'a' }] } },
  },
  meta: { fingerprint: 'f', workerSeconds: 12, mutants: 5, staticRuns: {} },
}

describe('读快照', () => {
  it('写了再读回来；没有、读不出、形状不对、指纹对不上都按没有快照处理并给出原因', () => {
    const dir = temporary('mutation-store-')
    const path = storePath(dir, MEMBER.path)
    expect(readStore(path, 'f')).toEqual({ miss: '没有快照' })
    expect(writeStore(path, STORE)).toBeUndefined()
    expect(readStore(path, 'f')).toEqual({ store: STORE })
    expect(readStore(path, 'other')).toEqual({ miss: expect.stringContaining('版本') })
    writeFileSync(path, '{ not json')
    expect(readStore(path, 'f')).toEqual({ miss: expect.stringContaining('读不出') })
    writeFileSync(path, JSON.stringify({ files: {}, omne: { fingerprint: 'f' } }))
    expect(readStore(path, 'f')).toEqual({ miss: '快照形状不对' })
  })

  it('写不进去时返回原因，不抛，也不留半份', () => {
    const dir = temporary('mutation-store-')
    // 目标路径是一个目录：改名失败。
    const path = join(dir, 'blocked.json')
    mkdirSync(path)
    expect(writeStore(path, STORE)).toEqual(expect.any(String))
    expect(readdirSync(dir)).toEqual(['blocked.json'])
  })
})

describe('交给 Stryker 的 incremental 文件', () => {
  it('只给这次要变异的文件里上次被杀的变异体，测试文件原样给', () => {
    const seed = seedReport(TARGET, STORE) as {
      files: Record<string, { mutants: ReportMutant[] }>
      testFiles: unknown
    }
    expect(Object.keys(seed.files)).toEqual(['src/a.ts'])
    expect(seed.files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(seed.files['src/a.ts']?.mutants[0]).toMatchObject({ killedBy: ['0'] })
    expect(seed.testFiles).toEqual(STORE.report['testFiles'])
    expect(seed).not.toHaveProperty('omne')
  })

  it('范围与 Stryker 一样：整个变异体在要变异的某一段行里，整份变异的文件全算', () => {
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 3, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 4, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 5, 'Killed'))).toBe(false)
    expect(inScope(TARGET, 'src/a.ts', mutant('1', 2, 'Killed'))).toBe(false)
    // 跨出范围的不算：Stryker 不为它生成变异体。
    expect(
      inScope(TARGET, 'src/a.ts', {
        ...mutant('1', 4, 'Killed'),
        location: { start: { line: 4, column: 1 }, end: { line: 5, column: 2 } },
      }),
    ).toBe(false)
    expect(inScope(TARGET, 'src/b.ts', mutant('1', 999, 'Killed'))).toBe(true)
    expect(inScope(TARGET, 'src/c.ts', mutant('1', 1, 'Killed'))).toBe(false)
  })

  it('去掉 Stryker 带回来的范围外变异体，这次生成的一个不少', () => {
    const report: MutationReport = {
      files: {
        'src/a.ts': {
          source: 'a',
          mutants: [mutant('1', 3, 'Killed'), mutant('src/a.ts@9:1-9:5', 9, 'Killed')],
        },
        'src/c.ts': { source: 'c', mutants: [mutant('src/c.ts@1:1-1:5', 1, 'RuntimeError')] },
      },
    }
    const kept = dropCarriedOver(TARGET, report)
    expect(kept.files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(kept.files['src/c.ts']?.mutants).toEqual([])
  })
})

describe('写回快照', () => {
  it('只留落在这次范围里的被杀变异体，记下耗时、生成的变异体数与 static 变异体的运行记录', () => {
    const written = {
      ...STORE.report,
      files: {
        'src/a.ts': {
          source: 'a',
          mutants: [
            mutant('1', 3, 'Killed', { static: true }),
            mutant('2', 3, 'Survived', { static: true }),
            mutant('3', 9, 'Killed'),
          ],
        },
      },
    }
    const runs: RunRecord[] = [
      { mode: 'dry-run', typeTests: 2, typecheck: true },
      { mode: 'mutant', activeMutant: '1', typeTests: 0, typecheck: true },
      { mode: 'mutant', activeMutant: '2', typeTests: 0, typecheck: true },
    ]
    const store = nextStore(TARGET, written, runs, { fingerprint: 'f', workerSeconds: 7 })
    const files = store.report['files'] as Record<string, { mutants: ReportMutant[] }>
    expect(files['src/a.ts']?.mutants.map(m => m.id)).toEqual(['1'])
    expect(store.meta).toMatchObject({ fingerprint: 'f', workerSeconds: 7, mutants: 2 })
    expect(Object.values(store.meta.staticRuns)).toEqual([[runs[1]]])
  })

  it('复用的 static 变异体这次没有运行记录：按身份带回快照里的，换成这次的 id；这次跑了的不带', () => {
    const killed = mutant('1', 3, 'Killed', { static: true })
    const written = { files: { 'src/a.ts': { source: 'a', mutants: [killed] } } }
    const old: RunRecord = { mode: 'mutant', activeMutant: '1', typeTests: 0, typecheck: true }
    const store = nextStore(TARGET, written, [old], { fingerprint: 'f', workerSeconds: 1 })
    const now: MutationReport = {
      files: { 'src/a.ts': { source: 'a', mutants: [{ ...killed, id: '17' }] } },
    }
    const dry: RunRecord = { mode: 'dry-run', typeTests: 2, typecheck: true }
    expect(withCarriedRuns(now, [dry], store)).toEqual([dry, { ...old, activeMutant: '17' }])
    const ran: RunRecord = { mode: 'mutant', activeMutant: '17', typeTests: 2, typecheck: true }
    expect(withCarriedRuns(now, [dry, ran], store)).toEqual([dry, ran])
    expect(withCarriedRuns(now, 'unreadable', store)).toBe('unreadable')
    expect(withCarriedRuns(now, [dry], undefined)).toEqual([dry])
  })
})

it('复用数取自 Stryker 的日志，颜色码不碍事；没有那一行时为 undefined', () => {
  expect(
    reusedCount(
      '\u001B[32mINFO\u001B[39m Result:\t\t\u001B[93m189\u001B[39m of 210 mutant result(s) are reused.',
    ),
  ).toBe(189)
  expect(reusedCount('No incremental result file found')).toBeUndefined()
})

describe('成员指纹：Stryker 不比较的四类内容', () => {
  const touch = (root: string, path: string, content: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  /** 一个 git 仓库：成员有配置、一个夹具、一个 spec，根有分层配置，.gitignore 忽略 tests/ignored/。 */
  function repo() {
    const root = temporary('mutation-fp-')
    execFileSync('git', ['init', '-q'], { cwd: root })
    touch(root, '.gitignore', 'ignored/\n')
    touch(root, 'vitest.tiers.mts', 'tiers 1')
    touch(root, 'm/vitest.config.mts', 'config 1')
    touch(root, 'm/tests/helper.ts', 'helper 1')
    touch(root, 'm/tests/a.spec.ts', 'spec 1')
    touch(root, 'm/tests/ignored/x.ts', 'x 1')
    return root
  }
  const of = (root: string): MemberFingerprint => {
    const print = memberFingerprint(root, 'm', 60)
    if ('unavailable' in print) throw new Error(print.unavailable)
    return print
  }
  const storeFor = (print: MemberFingerprint): Store => ({
    ...STORE,
    meta: { ...STORE.meta, fingerprint: print.fingerprint, parts: print.parts },
  })
  const missAfter = (root: string, change: () => void) => {
    const before = of(root)
    const dir = temporary('mutation-store-')
    const path = storePath(dir, 'm')
    writeStore(path, storeFor(before))
    expect(readStore(path, before.fingerprint, before.parts)).toHaveProperty('store')
    change()
    const after = of(root)
    expect(after.fingerprint).not.toBe(before.fingerprint)
    return readStore(path, after.fingerprint, after.parts)
  }

  it('夹具与辅助文件变了，整份失效并说明是夹具', () => {
    const root = repo()
    expect(missAfter(root, () => touch(root, 'm/tests/helper.ts', 'helper 2'))).toEqual({
      miss: expect.stringContaining('夹具与辅助文件'),
    })
  })

  it('夹具文件新增或删除也失效', () => {
    const root = repo()
    expect(missAfter(root, () => touch(root, 'm/tests/extra.ts', 'e'))).toHaveProperty('miss')
    expect(missAfter(root, () => rmSync(join(root, 'm/tests/helper.ts')))).toHaveProperty('miss')
  })

  it('成员的 vitest 配置变了，整份失效并说明是成员配置', () => {
    const root = repo()
    expect(missAfter(root, () => touch(root, 'm/vitest.config.mts', 'config 2'))).toEqual({
      miss: expect.stringContaining('成员的 vitest 配置'),
    })
  })

  it('根目录的 vitest.tiers.mts 变了，整份失效并说明是它', () => {
    const root = repo()
    expect(missAfter(root, () => touch(root, 'vitest.tiers.mts', 'tiers 2'))).toEqual({
      miss: expect.stringContaining('vitest.tiers.mts'),
    })
  })

  it('只改 *.spec.ts 或 Git 忽略的文件，指纹不变：复用交给 Stryker 按测试文件判断', () => {
    const root = repo()
    const before = of(root)
    touch(root, 'm/tests/a.spec.ts', 'spec 2')
    touch(root, 'm/tests/ignored/x.ts', 'x 2')
    expect(of(root)).toEqual(before)
  })

  it('没有分项的旧快照，在带分项读取时按旧格式整份失效', () => {
    const root = repo()
    const print = of(root)
    const dir = temporary('mutation-store-')
    const path = storePath(dir, 'm')
    writeStore(path, { ...STORE, meta: { ...STORE.meta, fingerprint: 'old' } })
    expect(readStore(path, print.fingerprint, print.parts)).toEqual({ miss: '快照来自旧格式' })
  })

  it('列文件的 git 命令失败时给出原因，不当作内容为空', () => {
    const notRepo = temporary('mutation-fp-')
    touch(notRepo, 'm/tests/helper.ts', 'h')
    expect(memberFingerprint(notRepo, 'm', 60)).toEqual({
      unavailable: expect.stringContaining('git ls-files'),
    })
  })
  describe('测试读到的外部输入', () => {
    /** 成员 m 的 spec 经相对路径导入 shared/helper.ts，它再导入 shared/deep.ts。 */
    function linked() {
      const root = repo()
      touch(root, 'm/tests/a.spec.ts', "import { h } from '../../shared/helper.ts'\n")
      touch(root, 'shared/helper.ts', "export { d as h } from './deep.ts'\n")
      touch(root, 'shared/deep.ts', 'export const d = 1\n')
      return root
    }

    it('改成员外的夹具，整份失效并说明是成员外文件', () => {
      const root = linked()
      expect(
        missAfter(root, () => touch(root, 'shared/helper.ts', 'export const h = 2\n')),
      ).toEqual({
        miss: expect.stringContaining('测试读到的外部输入变了'),
      })
    })

    it('删掉成员外的夹具也失效', () => {
      const root = linked()
      expect(missAfter(root, () => rmSync(join(root, 'shared/helper.ts')))).toHaveProperty('miss')
    })

    it('夹具再导入的文件变了也失效：递归追踪', () => {
      const root = linked()
      expect(missAfter(root, () => touch(root, 'shared/deep.ts', 'export const d = 2\n'))).toEqual({
        miss: expect.stringContaining('测试读到的外部输入变了'),
      })
    })

    it('文件互相导入时能返回：防环', () => {
      const root = linked()
      touch(root, 'shared/helper.ts', "import './deep.ts'\nexport const h = 1\n")
      touch(root, 'shared/deep.ts', "import './helper.ts'\nexport const d = 1\n")
      expect(of(root).fingerprint).toMatch(/^[0-9a-f]{64}$/u)
    })

    it('成员内 tests/ 之外的辅助文件被测试导入时，改它指纹变；没人导入时不变', () => {
      const root = linked()
      touch(root, 'm/test-support/assert.ts', 'export const strict = true\n')
      touch(root, 'm/test-support/unused.ts', 'export const u = 1\n')
      touch(root, 'm/tests/b.spec.ts', "import { strict } from '../test-support/assert.ts'\n")
      const change = () => touch(root, 'm/test-support/assert.ts', 'export const strict = false\n')
      expect(missAfter(root, change)).toEqual({
        miss: expect.stringContaining('测试读到的外部输入变了'),
      })
      const before = of(root)
      touch(root, 'm/test-support/unused.ts', 'export const u = 2\n')
      expect(of(root).parts.external).toBe(before.parts.external)
    })

    it('只改成员 src/ 下的文件，这一项不变：src 归 Stryker 比较', () => {
      const root = linked()
      touch(root, 'm/src/code.ts', "import '../../shared/deep.ts'\nexport const c = 1\n")
      touch(
        root,
        'm/tests/a.spec.ts',
        "import { c } from '../src/code.ts'\nimport '../../shared/helper.ts'\n",
      )
      const before = of(root)
      touch(root, 'm/src/code.ts', 'export const c = 2\n')
      expect(of(root).parts.external).toBe(before.parts.external)
    })

    it('测试经成员 src/ 间接导入成员外文件，改它指纹变：追踪穿过 src/', () => {
      const root = linked()
      touch(
        root,
        'm/src/code.ts',
        "import { d } from '../../shared/deep2.ts'\nexport const c = d\n",
      )
      touch(root, 'shared/deep2.ts', 'export const d = 1\n')
      touch(root, 'm/tests/b.spec.ts', "import { c } from '../src/code.ts'\n")
      expect(missAfter(root, () => touch(root, 'shared/deep2.ts', 'export const d = 2\n'))).toEqual(
        { miss: expect.stringContaining('测试读到的外部输入变了') },
      )
    })

    it('require 的相对路径同 import：改它指纹变', () => {
      const root = repo()
      touch(root, 'm/tests/a.spec.ts', "const { x } = require('../../shared/x.cjs')\n")
      touch(root, 'shared/x.cjs', 'exports.x = 1\n')
      expect(missAfter(root, () => touch(root, 'shared/x.cjs', 'exports.x = 2\n'))).toHaveProperty(
        'miss',
      )
    })

    describe('new URL(<字面量>, import.meta.url)', () => {
      /** spec 里写一个 new URL 表达式；shared/data.json 与 shared/assets/ 下的两个文件在仓库里。 */
      const withUrl = (expression: string) => {
        const root = repo()
        touch(root, 'm/tests/a.spec.ts', `const u = ${expression}\n`)
        touch(root, 'shared/data.json', '{"a":1}')
        touch(root, 'shared/assets/one.txt', '1')
        touch(root, 'shared/assets/ignored/z.txt', 'z')
        return root
      }
      const literal = "new URL('../../shared/data.json', import.meta.url)"
      const template = 'new URL(`../../shared/assets/pre-${name}`, import.meta.url)'

      it('字面量：改目标、删目标，指纹都变', () => {
        const root = withUrl(literal)
        expect(missAfter(root, () => touch(root, 'shared/data.json', '{"a":2}'))).toHaveProperty(
          'miss',
        )
        const other = withUrl(literal)
        expect(missAfter(other, () => rmSync(join(other, 'shared/data.json')))).toHaveProperty(
          'miss',
        )
      })

      it('模板：取 ${ 之前的目录，改一个文件、加一个文件指纹都变，加被忽略的文件不变', () => {
        const edited = withUrl(template)
        expect(missAfter(edited, () => touch(edited, 'shared/assets/one.txt', '2'))).toHaveProperty(
          'miss',
        )
        const added = withUrl(template)
        expect(missAfter(added, () => touch(added, 'shared/assets/two.txt', '2'))).toHaveProperty(
          'miss',
        )
        const ignored = withUrl(template)
        const before = of(ignored)
        touch(ignored, 'shared/assets/ignored/y.txt', 'y')
        touch(ignored, 'shared/assets/ignored/z.txt', 'z2')
        expect(of(ignored)).toEqual(before)
      })

      it('指向仓库根的只记存在：根下改一个文件，指纹不变', () => {
        const root = withUrl("new URL('../../', import.meta.url)")
        touch(root, 'other.txt', 'o1')
        const before = of(root)
        touch(root, 'other.txt', 'o2')
        touch(root, 'shared/data.json', '{"a":2}')
        expect(of(root)).toEqual(before)
      })

      it('指向成员目录本身的只记存在：成员里 tests/ 与 src/ 之外的文件改了，指纹不变', () => {
        const root = withUrl("new URL('../', import.meta.url)")
        touch(root, 'm/notes.txt', 'n1')
        const before = of(root)
        touch(root, 'm/notes.txt', 'n2')
        expect(of(root)).toEqual(before)
      })

      it('第二个参数不是 import.meta.url 的不追', () => {
        const root = withUrl("new URL('../../shared/data.json', base)")
        const before = of(root)
        touch(root, 'shared/data.json', '{"a":2}')
        expect(of(root)).toEqual(before)
      })
    })

    it('文件数超过上限时给出原因，不复用', () => {
      const root = repo()
      const imports = Array.from({ length: 2001 }, (_, i) => `import '../../shared/f${i}.ts'`).join(
        '\n',
      )
      touch(root, 'm/tests/a.spec.ts', imports)
      for (let i = 0; i < 2001; i += 1) touch(root, `shared/f${i}.ts`, 'export {}')
      expect(memberFingerprint(root, 'm', 60)).toEqual({
        unavailable: expect.stringContaining('2000'),
      })
    })
  })
})
