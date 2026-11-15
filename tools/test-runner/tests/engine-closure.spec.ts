import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTestRunsConfig } from '../src/testing/config.ts'
import { classify } from '../src/testing/scope.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const MEMBER = 'tools/test-runner'
const ENTRIES = [`${MEMBER}/src/testing/cli.ts`, `${MEMBER}/src/testing/check.ts`]
const RULES = readTestRunsConfig().affected

interface PathLoaded {
  readonly path: string
  readonly loader: string
  readonly why: string
}
const PATH_LOADED: readonly PathLoaded[] = [
  {
    path: `${MEMBER}/src/testing/filter-guard.ts`,
    loader: '根 vitest.tiers.mts 的 FILTER_GUARD：带过滤运行时挂成每个成员 vitest 的报告器',
    why: '过滤后一条用例都没跑就判失败；它挂在每个成员的 vitest 上，改了所有成员的测试通过与否都会变。它不参与算计划，但改了它，所有成员的测试通过与否都会变，所以留在全局清单里',
  },
  {
    path: `${MEMBER}/src/testing/timing-reporter.ts`,
    loader: '根 vitest.tiers.mts 的 TIMING_REPORTER：运行器设了报告目录时挂成计时报告器',
    why: '写每个成员的计时报告（文件导入耗时、用例时限与标签），账本与慢文件判断读它；run.ts 也类型导入它，本身已在闭包里',
  },
]

const STATEMENT =
  /^[ \t]*(?:import|export)(?:[ \t]+type)?([\w\s,{}*$]*?)\bfrom[ \t]*['"]([^'"\n]+)['"]/gmu
const SIDE_EFFECT = /^[ \t]*import[ \t]*['"]([^'"\n]+)['"]/gmu
const INVOKED = /\bnode\b[^\n]*?(tools\/test-runner\/src\/[\w/.-]+\.ts)/gu

const rel = (root: string, path: string) => relative(root, path).split(sep).join('/')

function relativeSpecifiers(text: string): string[] {
  const specs = [
    ...[...text.matchAll(STATEMENT)].map(match => match[2]),
    ...[...text.matchAll(SIDE_EFFECT)].map(match => match[1]),
  ]
  return specs.filter(
    (spec): spec is string =>
      spec !== undefined && (spec.startsWith('./') || spec.startsWith('../')),
  )
}

function resolveRelative(root: string, from: string, spec: string): string {
  const target = resolve(dirname(from), spec)
  const src = join(root, MEMBER, 'src')
  if (!target.startsWith(src + sep) || !existsSync(target))
    throw new Error(
      `${rel(root, from)} 的导入 ${spec} 解析不到 ${MEMBER}/src 下的文件；闭包只沿 src 走，这条要先看`,
    )
  return target
}

function engineClosure(root: string, entries: readonly string[]): string[] {
  const seen = new Set<string>()
  const pending = entries.map(entry => join(root, entry))
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    if (!existsSync(file)) throw new Error(`入口 ${rel(root, file)} 不存在`)
    seen.add(file)
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8')))
      pending.push(resolveRelative(root, file, spec))
  }
  return [...seen].map(file => rel(root, file)).sort()
}

function invokedEngineFiles(root: string): string[] {
  const shell = readdirSync(join(root, 'scripts'))
    .filter(name => name.endsWith('.sh'))
    .map(name => join(root, 'scripts', name))
  const texts = [join(root, 'package.json'), ...shell].map(file => readFileSync(file, 'utf8'))
  const direct = texts.flatMap(text => [...text.matchAll(INVOKED)].map(match => match[1] ?? ''))
  const pkg = JSON.parse(readFileSync(join(root, MEMBER, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>
  }
  const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {})
  return [...direct, ...bins.map(value => `${MEMBER}/${value.replace(/^\.\//u, '')}`)]
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

const PATH_TOKEN = /[\w@./-]*\.ts(?![\w])/gu

function sourceFiles(root: string): string[] {
  return readdirSync(join(root, MEMBER, 'src'), { encoding: 'utf8', recursive: true })
    .filter(name => name.endsWith('.ts'))
    .map(name => rel(root, join(root, MEMBER, 'src', name)))
    .sort()
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function targetsOf(
  root: string,
  from: string,
  token: string,
  sources: readonly string[],
): string[] {
  if (token.startsWith('./') || token.startsWith('../')) {
    const target = rel(root, resolve(root, dirOf(from), token))
    return sources.includes(target) ? [target] : []
  }
  if (token.includes('/'))
    return sources.filter(
      file => file === token || file.endsWith(`/${token}`) || file === `${MEMBER}/${token}`,
    )
  const sameDirectory = sources.filter(
    file => nameOf(file) === token && dirOf(file) === dirOf(from),
  )
  return sameDirectory.length > 0 ? sameDirectory : sources.filter(file => nameOf(file) === token)
}

function pathReferences(root: string, scanned: readonly string[]): string[] {
  const sources = sourceFiles(root)
  const found = new Set<string>()
  for (const from of scanned)
    for (const match of readFileSync(join(root, from), 'utf8').matchAll(PATH_TOKEN))
      for (const target of targetsOf(root, from, match[0], sources)) found.add(target)
  return [...found].sort()
}

describe('影响面引擎的导入闭包', () => {
  it('闭包里每个引擎文件都归全局：改它判全量，清单由这条用例守住', () => {
    const closure = engineClosure(ROOT, ENTRIES)
    const missing = closure.filter(file => classify(file, [], RULES).category !== 'global')
    expect(
      missing,
      [
        '以下引擎文件在导入闭包里，却不归 affected.globalPaths（改了它们计划只按成员算，不判全量）。',
        '请把它们加进 tools/test-runner/test-runs.config.json 的 affected.globalPaths：',
        ...missing.map(file => `  ${file}`),
      ].join('\n'),
    ).toEqual([])
  })

  it('入口没有漏：根 package.json 与 scripts/*.sh 经 node 调用的引擎源码、以及 test-runner 的 bin，都是入口', () => {
    const missing = invokedEngineFiles(ROOT).filter(file => !ENTRIES.includes(file))
    expect(
      missing,
      [
        '以下引擎源码被根脚本或入口脚本直接调用，却不在本文件的 ENTRIES 里：',
        ...missing.map(file => `  ${file}`),
      ].join('\n'),
    ).toEqual([])
  })

  it('防漏：导入闭包内文件与根 vitest.tiers.mts 里指向引擎文件的 .ts 路径记号，指到的文件都在闭包里或在 PATH_LOADED 里', () => {
    const closure = engineClosure(ROOT, ENTRIES)
    const inClosure = new Set(closure)
    const listed = new Set(PATH_LOADED.map(entry => entry.path))
    const missing = pathReferences(ROOT, [...closure, 'vitest.tiers.mts']).filter(
      file => !inClosure.has(file) && !listed.has(file),
    )
    expect(
      missing,
      [
        '以下引擎文件被导入闭包内文件或根 vitest.tiers.mts 按路径指到，却既不在导入闭包里，也不在 PATH_LOADED 里。',
        '请在 PATH_LOADED 里写明加载方与理由，并把它加进 affected.globalPaths：',
        ...missing.map(file => `  ${file}`),
      ].join('\n'),
    ).toEqual([])
  })

  it('PATH_LOADED 每条都存在、归全局，并且真有 .ts 路径记号指向它（清单不过时）', () => {
    const referenced = new Set(
      pathReferences(ROOT, [...engineClosure(ROOT, ENTRIES), 'vitest.tiers.mts']),
    )
    const paths = PATH_LOADED.map(entry => entry.path)
    expect(
      paths.filter(path => !existsSync(join(ROOT, path))),
      '以下 PATH_LOADED 条目的文件不存在',
    ).toEqual([])
    expect(
      paths.filter(path => classify(path, [], RULES).category !== 'global'),
      '以下 PATH_LOADED 条目没归全局：请加进 affected.globalPaths',
    ).toEqual([])
    expect(
      paths.filter(path => !referenced.has(path)),
      '以下 PATH_LOADED 条目已没有 .ts 路径记号指向它：加载方若已改，请核对后删除该条目',
    ).toEqual([])
  })

  it('解析只认行首的导入语句：import type、多行子句、export … from 与副作用导入都进闭包；字符串与注释里的 import 行不进', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'engine-closure-')))
    try {
      write(
        root,
        `${MEMBER}/src/a/entry.ts`,
        [
          "import type { Kind } from './types.ts'",
          'import {',
          '  first,',
          '  second,',
          "} from './multi.ts'",
          'import { type Mode, mode } from "./quoted.ts"',
          "export * from './star.ts'",
          "export { named } from './named.ts'",
          "import './side.ts'",
          'const text = "import ghost from \'./ghost.ts\'"',
          "// import ghost2 from './ghost2.ts'",
          'const list = [',
          '  "import ghost3 from \'./ghost3.ts\'",',
          ']',
          '',
        ].join('\n'),
      )
      for (const path of ['types', 'multi', 'quoted', 'named', 'side'])
        write(root, `${MEMBER}/src/a/${path}.ts`, 'export {}\n')
      write(
        root,
        `${MEMBER}/src/a/star.ts`,
        "import { leaf } from './deep/leaf.ts'\nexport * from '../b/up.ts'\n",
      )
      write(root, `${MEMBER}/src/a/deep/leaf.ts`, 'export {}\n')
      write(root, `${MEMBER}/src/b/up.ts`, 'export {}\n')
      expect(engineClosure(root, [`${MEMBER}/src/a/entry.ts`])).toEqual(
        [
          `${MEMBER}/src/a/entry.ts`,
          `${MEMBER}/src/a/types.ts`,
          `${MEMBER}/src/a/multi.ts`,
          `${MEMBER}/src/a/quoted.ts`,
          `${MEMBER}/src/a/star.ts`,
          `${MEMBER}/src/a/named.ts`,
          `${MEMBER}/src/a/side.ts`,
          `${MEMBER}/src/a/deep/leaf.ts`,
          `${MEMBER}/src/b/up.ts`,
        ].sort(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
