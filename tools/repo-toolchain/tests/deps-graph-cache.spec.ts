// 工作树依赖图的缓存：指纹对每一类能改变图的输入都失效（取掉指纹里的某一类，对应用例变红），
// 命中读缓存、未命中重算并写缓存、坏文件按未命中、开关关掉后不读不写、只留最近几份。
// 指纹用例只跑 git，归快层；真起 dependency-cruiser 的用例单条标 slow。
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  WORKING_CACHE_SWITCH,
  workingGraph,
  workingGraphFingerprint,
  type DependencyGraph,
} from '../src/deps/graph.ts'
import {
  commit,
  copyRepository,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

/** 三个成员：a 导入 b，c 独立；提交过一次，工作树干净。不登记进 removeTemporaries，整个文件共用，最后删。 */
let template: string
beforeAll(() => {
  template = repository(
    realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-graph-cache-template-'))),
  )
  write(template, '.gitignore', 'node_modules/\n')
  write(template, 'tsconfig.base.json', '{}\n')
  write(
    template,
    'packages/model/a/src/index.ts',
    "import { b } from '../../b/src/index.ts'\nexport const a = b\n",
  )
  write(template, 'packages/model/b/src/index.ts', 'export const b = 1\n')
  write(template, 'packages/model/c/src/index.ts', 'export const c = 1\n')
  commit(template, 'members')
})
afterEach(() => {
  removeTemporaries()
  vi.restoreAllMocks()
})
afterAll(() => rmSync(template, { recursive: true, force: true }))

const digest = (root: string): string => {
  const key = workingGraphFingerprint(root)
  expect(key).toBeDefined()
  return key?.digest ?? ''
}

/** 把 `env` 里的键临时设成给定值（undefined 为删掉），跑完恢复。 */
function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('工作树依赖图的指纹', () => {
  it('同一棵树算两次相同；不在 git 仓库里的目录没有指纹', () => {
    const root = copyRepository(template)
    expect(digest(root)).toBe(digest(root))
    const loose = temporaryDirectory('omne-graph-cache-nogit-')
    write(loose, 'packages/model/a/src/index.ts', 'export const a = 1\n')
    expect(workingGraphFingerprint(loose)).toBeUndefined()
  })

  it('已跟踪文件的内容改了（未提交）就变', () => {
    const root = copyRepository(template)
    const before = digest(root)
    write(root, 'packages/model/b/src/index.ts', 'export const b = 2\n')
    expect(digest(root)).not.toBe(before)
  })

  it('新增未跟踪文件就变，删掉它回到原指纹；扫描根之外的未跟踪文件不算', () => {
    const root = copyRepository(template)
    const before = digest(root)
    write(root, 'packages/model/c/src/extra.ts', 'export const extra = 1\n')
    const added = digest(root)
    expect(added).not.toBe(before)
    rmSync(join(root, 'packages/model/c/src/extra.ts'))
    expect(digest(root)).toBe(before)
    write(root, 'docs/note.md', 'note\n')
    expect(digest(root)).toBe(before)
  })

  it('被忽略的单个文件进图，所以它的内容改了也变', () => {
    const root = copyRepository(template)
    write(root, '.gitignore', 'node_modules/\npackages/model/a/src/generated.ts\n')
    commit(root, 'ignore one file')
    write(root, 'packages/model/a/src/generated.ts', 'export const g = 1\n')
    const first = digest(root)
    write(root, 'packages/model/a/src/generated.ts', 'export const g = 2\n')
    expect(digest(root)).not.toBe(first)
  })

  it('被忽略的目录只记存在与否：新增就变，删掉回到原指纹，目录里的内容不算', () => {
    const root = copyRepository(template)
    write(root, '.gitignore', 'node_modules/\ndist/\n')
    commit(root, 'ignore dist')
    const before = digest(root)
    write(root, 'packages/model/a/dist/index.js', 'export const a = 1\n')
    const withDist = digest(root)
    expect(withDist).not.toBe(before)
    write(root, 'packages/model/a/dist/index.js', 'export const a = 2\n')
    expect(digest(root)).toBe(withDist)
    rmSync(join(root, 'packages/model/a/dist'), { recursive: true })
    expect(digest(root)).toBe(before)
  })

  it('被忽略的路径清单不变、目录从「只忽略里面的文件」改成「整个被忽略」也变：只有 ignoredDirectories 的结果记下了这一差别', () => {
    const root = copyRepository(template)
    write(root, '.gitignore', 'node_modules/\npackages/model/a/src/gen/g.ts\n')
    commit(root, 'ignore one generated file')
    write(root, 'packages/model/a/src/gen/g.ts', 'export const g = 1\n')
    const fileOnly = workingGraphFingerprint(root)
    // 根 .gitignore 不在扫描根下，未提交的改动不进「改动的文件」一组；两种写法下 ls-files 列出的被忽略路径相同。
    write(root, '.gitignore', 'node_modules/\npackages/model/a/src/gen/**\n')
    const wholeDir = workingGraphFingerprint(root)
    const others = (inputs: readonly string[] = []) =>
      inputs.filter(line => !line.startsWith('ignored-dirs '))
    expect(others(wholeDir?.inputs)).toEqual(others(fileOnly?.inputs))
    expect(wholeDir?.digest).not.toBe(fileOnly?.digest)
  })

  it('pnpm-lock.yaml 出现或内容改了就变（它不在扫描根下，只走安装状态这一项）', () => {
    const root = copyRepository(template)
    const before = digest(root)
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
    const first = digest(root)
    expect(first).not.toBe(before)
    write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\nimporters: {}\n')
    expect(digest(root)).not.toBe(first)
  })

  it('node_modules/.modules.yaml 出现或内容改了就变（node_modules 被忽略，只走安装状态这一项）', () => {
    const root = copyRepository(template)
    const before = digest(root)
    write(root, 'node_modules/.modules.yaml', 'layoutVersion: 5\n')
    const first = digest(root)
    expect(first).not.toBe(before)
    write(root, 'node_modules/.modules.yaml', 'layoutVersion: 6\n')
    expect(digest(root)).not.toBe(first)
  })

  it('规则文件、解析配置及其 extends 链上的文件改了就变', () => {
    const root = copyRepository(template)
    const runner = temporaryDirectory('omne-graph-cache-runner-')
    const rules = (name: string) =>
      `module.exports = { forbidden: [{ name: '${name}', severity: 'error', from: {}, to: { path: '^never$' } }], options: {} }\n`
    write(runner, '.dependency-cruiser.cjs', rules('one'))
    write(runner, 'tsconfig.base.json', '{ "extends": "./base.json" }\n')
    write(runner, 'base.json', '{ "compilerOptions": { "customConditions": ["source"] } }\n')
    withEnv({ OMNE_RUNNER_ROOT: runner }, () => {
      const before = digest(root)
      write(runner, '.dependency-cruiser.cjs', rules('two'))
      const rulesChanged = digest(root)
      expect(rulesChanged).not.toBe(before)
      write(runner, 'base.json', '{ "compilerOptions": { "customConditions": ["import"] } }\n')
      const baseChanged = digest(root)
      expect(baseChanged).not.toBe(rulesChanged)
      write(runner, 'tsconfig.base.json', '{ "extends": "./base.json", "files": [] }\n')
      expect(digest(root)).not.toBe(baseChanged)
    })
  })

  it('换了 HEAD 就变，即使工作树的内容相同', () => {
    const root = copyRepository(template)
    const before = digest(root)
    write(root, 'packages/model/c/src/index.ts', 'export const c = 2\n')
    const dirty = digest(root)
    expect(dirty).not.toBe(before)
    commit(root, 'c')
    expect(digest(root)).not.toBe(dirty)
    expect(digest(root)).not.toBe(before)
  })
})

describe('工作树依赖图的缓存', () => {
  const cacheDir = (root: string) => join(root, '.git', 'omne-dep-graph')
  const entries = (root: string) =>
    readdirSync(cacheDir(root)).filter(
      name => name.startsWith('working-') && name.endsWith('.json'),
    )
  const pairs = (graph: DependencyGraph) => graph.edges.map(edge => `${edge.from} → ${edge.to}`)
  const marker: DependencyGraph = {
    members: [{ path: 'packages/model/marker', group: 'packages/model', name: 'marker' }],
    modules: [],
    edges: [],
    dependencies: [],
    findings: [],
  }

  it(
    '命中读缓存、关掉开关或缓存坏了就重算：三种情况的图逐字节相同，缓存文件按指纹命名',
    { tags: ['slow'], timeout: 120_000 },
    () => {
      const root = copyRepository(template)
      const computed = JSON.stringify(workingGraph(root))
      const key = workingGraphFingerprint(root)
      expect(entries(root)).toEqual([`working-${key?.digest ?? ''}.json`])
      const file = join(cacheDir(root), entries(root)[0] ?? '')
      expect(JSON.stringify(workingGraph(root))).toBe(computed)

      // 缺陷：命中时仍起 dependency-cruiser——换掉缓存里的图，命中就该读到换掉的那张。
      const entry = JSON.parse(readFileSync(file, 'utf8')) as { graph: DependencyGraph }
      writeFileSync(file, JSON.stringify({ ...entry, graph: marker }))
      expect(workingGraph(root).members.map(member => member.path)).toEqual([
        'packages/model/marker',
      ])
      // 关掉开关：不读也不写，缓存里的标记图留在原处。
      expect(
        JSON.stringify(withEnv({ [WORKING_CACHE_SWITCH]: '0' }, () => workingGraph(root))),
      ).toBe(computed)
      expect((JSON.parse(readFileSync(file, 'utf8')) as { graph: DependencyGraph }).graph).toEqual(
        marker,
      )
      // JSON 坏了按未命中：重算、重写。
      writeFileSync(file, '{"format":')
      expect(JSON.stringify(workingGraph(root))).toBe(computed)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ fingerprint: key?.digest })
      // 形状不对（没有 edges 等数组）也按未命中。
      writeFileSync(file, JSON.stringify({ ...entry, graph: { members: [] } }))
      expect(JSON.stringify(workingGraph(root))).toBe(computed)
      // 指纹对不上（文件名对、内容是别的指纹）也按未命中。
      writeFileSync(file, JSON.stringify({ ...entry, fingerprint: 'other', graph: marker }))
      expect(JSON.stringify(workingGraph(root))).toBe(computed)
    },
  )

  it(
    '改动之后不命中：图反映改动，旧的那份还在；只留最近 10 份',
    { tags: ['slow'], timeout: 120_000 },
    () => {
      const root = copyRepository(template)
      expect(pairs(workingGraph(root))).toEqual(['packages/model/a → packages/model/b'])
      write(
        root,
        'packages/model/b/src/index.ts',
        "import { c } from '../../c/src/index.ts'\nexport const b = c\n",
      )
      expect(pairs(workingGraph(root))).toEqual([
        'packages/model/a → packages/model/b',
        'packages/model/b → packages/model/c',
      ])
      expect(entries(root)).toHaveLength(2)

      const stale = Date.now() - 3_600_000
      for (let index = 0; index < 12; index += 1) {
        const file = join(cacheDir(root), `working-fake${index}.json`)
        writeFileSync(file, '{}')
        utimesSync(file, new Date(stale + index * 1000), new Date(stale + index * 1000))
      }
      write(root, 'packages/model/c/src/index.ts', 'export const c = 2\n')
      workingGraph(root)
      const kept = entries(root)
      expect(kept).toHaveLength(10)
      expect(kept.filter(name => name.startsWith('working-fake'))).toEqual(
        Array.from({ length: 7 }, (_, index) => `working-fake${11 - index}.json`).sort(),
      )
    },
  )

  it(
    '目录改成整个被忽略后不命中：目录里的模块随之出图，缓存不会交回旧图',
    { tags: ['slow'], timeout: 120_000 },
    () => {
      const root = copyRepository(template)
      write(root, '.gitignore', 'node_modules/\npackages/model/a/src/gen/g.ts\n')
      commit(root, 'ignore one generated file')
      write(
        root,
        'packages/model/a/src/gen/g.ts',
        "import { c } from '../../../c/src/index.ts'\nexport const g = c\n",
      )
      const fileOnly = workingGraph(root)
      expect(fileOnly.modules).toContain('packages/model/a/src/gen/g.ts')
      expect(pairs(fileOnly)).toContain('packages/model/a → packages/model/c')
      write(root, '.gitignore', 'node_modules/\npackages/model/a/src/gen/**\n')
      const wholeDir = workingGraph(root)
      expect(wholeDir.modules).not.toContain('packages/model/a/src/gen/g.ts')
      expect(pairs(wholeDir)).toEqual(['packages/model/a → packages/model/b'])
    },
  )

  it('命中与否只在 stderr 是终端时打一行', { tags: ['slow'], timeout: 120_000 }, () => {
    const root = copyRepository(template)
    const stderr = process.stderr as { isTTY?: boolean }
    const original = stderr.isTTY
    const written: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      written.push(String(chunk))
      return true
    })
    try {
      stderr.isTTY = false
      workingGraph(root)
      expect(written).toEqual([])
      stderr.isTTY = true
      workingGraph(root)
      expect(written).toEqual([expect.stringMatching(/^依赖图缓存：命中 working-[0-9a-f]{12}\n$/u)])
      write(root, 'packages/model/c/src/index.ts', 'export const c = 3\n')
      workingGraph(root)
      expect(written[1]).toMatch(/^依赖图缓存：未命中 working-[0-9a-f]{12}，重算\n$/u)
    } finally {
      if (original === undefined) delete stderr.isTTY
      else stderr.isTTY = original
    }
  })

  it('非 git 目录照常出图，不写缓存', { tags: ['slow'], timeout: 120_000 }, () => {
    const root = temporaryDirectory('omne-graph-cache-nogit-')
    write(root, 'tsconfig.base.json', '{}\n')
    write(root, 'packages/model/a/src/index.ts', 'export const a = 1\n')
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    expect(workingGraph(root).members.map(member => member.path)).toEqual(['packages/model/a'])
    expect(readdirSync(root)).not.toContain('.git')
  })
})
