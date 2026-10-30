// 增量（借鉴 unclebob/ub-mode 的 mutator 的差分快照）：同一任务里重跑时，上次被杀、代码与杀死它的测试都没变的变异体
// 不再跑，结果由 Stryker 的 incremental 模式复用。每个成员一份快照，放在主检出的 `tmp/mutation-incremental/<分支>/`。
// 快照只留上次被杀、落在当时变异范围里的变异体：存活、无覆盖、超时、运行错误与不能计分的照样重跑，读数与不开增量时相同。
// 快照读不出、对不上版本或写不进去，都按没有快照处理：整份重跑，不让入口失败，也不让读数少算。
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { slugOf } from '../testing/run.ts'
import { mutantIdentity, type MutationReport, type ReportMutant } from './report.ts'
import type { RunRecord } from './run-reporter.ts'
import type { MutationTarget } from './scope.ts'

/** 设为 `0` 关掉增量：不读、不写快照，Stryker 的配置与读数同没有增量时一样。 */
export const INCREMENTAL_ENV = 'OMNE_MUTATION_INCREMENTAL'
/** 快照的根目录；不设时为主检出的 `tmp/mutation-incremental`。 */
export const INCREMENTAL_HOME_ENV = 'OMNE_MUTATION_INCREMENTAL_HOME'
/** 快照格式；改了快照里存的东西就加一，旧快照对不上指纹，按没有快照处理。 */
const STORE_FORMAT = 1

export type IncrementalMode =
  | { readonly kind: 'off' }
  | {
      readonly kind: 'on'
      /** 本分支的快照目录。 */
      readonly dir: string
      /** 不复用快照里的结果，全部重跑，跑完照样写快照。 */
      readonly force: boolean
    }

/** 分支名转成一层安全的目录名：路径分隔符与 Windows 不认的字符按百分号编码，`.`、`..` 与空名另起名字。 */
export function branchDirectory(branch: string): string {
  const encoded = encodeURIComponent(branch).replaceAll(
    /[*'()!~]/gu,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )
  return encoded === '' || encoded === '.' || encoded === '..' ? `%${encoded}` : encoded
}

export function incrementalMode(options: {
  readonly disabled: boolean
  readonly force: boolean
  readonly mainRoot: string
  readonly branch: string
  readonly env: Readonly<Record<string, string | undefined>>
}): IncrementalMode {
  if (options.disabled || options.env[INCREMENTAL_ENV] === '0') return { kind: 'off' }
  const home = options.env[INCREMENTAL_HOME_ENV]
  const base =
    home === undefined || home === '' ? join(options.mainRoot, 'tmp', 'mutation-incremental') : home
  return { kind: 'on', dir: join(base, branchDirectory(options.branch)), force: options.force }
}

export const storePath = (dir: string, member: string) => join(dir, `${slugOf(member)}.json`)

const require = createRequire(import.meta.url)
const versionOf = (name: string): string => {
  try {
    return String((require(`${name}/package.json`) as { version?: unknown }).version)
  } catch {
    return 'unknown'
  }
}

/**
 * 快照的指纹：格式、Stryker 与 vitest 的版本、变异时用例的时限。换了任何一个，变异体的生成或判定可能不同，旧快照不用。
 */
export function storeFingerprint(testTimeoutSeconds: number): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        format: STORE_FORMAT,
        stryker: versionOf('@stryker-mutator/core'),
        vitestRunner: versionOf('@stryker-mutator/vitest-runner'),
        vitest: versionOf('vitest'),
        testTimeoutSeconds,
      }),
    )
    .digest('hex')
}

/** 指纹的五类分项摘要：版本与时限、成员的 vitest 配置、根目录的分层配置、成员 tests/ 下的夹具与辅助文件、测试读的成员外文件。 */
export interface FingerprintParts {
  readonly versions: string
  readonly config: string
  readonly tiers: string
  readonly fixtures: string
  readonly external: string
}

/** 一个成员的指纹：合并哈希加分项，分项用来在失效时说明是哪一类变了。 */
export interface MemberFingerprint {
  readonly fingerprint: string
  readonly parts: FingerprintParts
}

const PART_LABELS: Readonly<Record<keyof FingerprintParts, string>> = {
  versions: '快照来自不同的 Stryker、vitest 版本或用例时限',
  config: '快照之后成员的 vitest 配置变了',
  tiers: '快照之后根目录的 vitest.tiers.mts 变了',
  fixtures: '快照之后成员 tests/ 下的夹具与辅助文件变了',
  external: '快照之后测试读的成员外文件变了',
}
const PART_KEYS = Object.keys(PART_LABELS) as (keyof FingerprintParts)[]

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** 读文件内容摘要；文件不存在记作 `absent`（删掉也是一种变化），其他读不出的原因抛出。 */
function digestOf(path: string): string {
  try {
    return sha(readFileSync(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    throw error
  }
}

/** 测试的外部输入最多追踪的文件数；超过时这一次不复用。 */
const EXTERNAL_LIMIT = 2000
const SOURCE_FILE = /\.[cm]?[jt]s$/u
// 只追相对路径的静态导入：行首的 import／export … from（含 import type 与跨行的名单）、行首的副作用导入、import()。
const STATIC_IMPORT = /^[ \t]*(?:import|export)\b[^'";]*?\bfrom\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1/gmu
const BARE_IMPORT = /^[ \t]*import\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1/gmu
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1\s*\)/gu
const REQUIRE_CALL = /\brequire\s*\(\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1\s*\)/gu
// 只认第二个参数正好是 import.meta.url 的 new URL：第一个参数是字符串字面量或模板字面量。
const URL_READ = /\bnew\s+URL\s*\(\s*(['"`])((?:(?!\1)[^\n])*)\1\s*,\s*import\.meta\.url\s*\)/gu

function relativeSpecifiers(text: string): string[] {
  return [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT, REQUIRE_CALL].flatMap(pattern =>
    [...text.matchAll(pattern)].map(match => match[2] ?? ''),
  )
}

/** `new URL(<字面量>, import.meta.url)` 的第一个参数；带 `${` 的模板只取第一个 `${` 之前、最后一个 `/` 为止的前缀，当作目录。 */
function urlTargets(text: string): string[] {
  return [...text.matchAll(URL_READ)].flatMap(match => {
    const literal = match[2] ?? ''
    if (/^[a-z][a-z0-9+.-]*:/iu.test(literal)) return []
    const template = literal.indexOf('${')
    if (template < 0) return [literal]
    const head = literal.slice(0, template)
    return [head.slice(0, head.lastIndexOf('/') + 1) || './']
  })
}

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 相对导入落到哪个文件：原样、`.js` 换 `.ts`、补扩展名、目录的 index；都没有返回 undefined。 */
function resolveImport(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier)
  const stem = base.replace(/\.[cm]?js$/u, '')
  const candidates = [
    base,
    ...(stem === base ? [] : [`${stem}.ts`, `${stem}.mts`]),
    `${base}.ts`,
    `${base}.mts`,
    `${base}.js`,
    join(base, 'index.ts'),
    join(base, 'index.mts'),
    join(base, 'index.js'),
  ]
  return candidates.find(isFile)
}

/**
 * 成员测试（`tests/` 下全部 .ts／.mts，含 spec）读到的、不在成员 `src/` 下的文件（含成员内的 `test-support/` 等辅助文件），排序后取内容摘要。
 * 读到的方式：相对的 import／require，以及 `new URL(<字面量>, import.meta.url)`；源码文件接着往下追。
 * 解析不到的目标记作 `missing:<路径>`，删掉文件也会变。成员 `src/` 下的文件照样读、照样往下追，只是自己不进摘要，归 Stryker 比较。
 * `new URL` 指向目录（含带 `${` 的模板取前缀）时，用 `git ls-files` 列出其中未被忽略的文件逐个进摘要，不追这些文件的导入。
 * 目标是仓库根或成员目录的祖先目录（含成员目录本身）时不列文件，只记 `dir:<路径>` 表示存在：这样的写法只拿目录当锚点、再拼路径读文件，那些读取不追。
 * 不追：包名导入、拿仓库根或成员祖先目录当锚点再拼路径读到的文件、经函数拼出的路径（如 `join(dirname(fileURLToPath(import.meta.url)), …)`）、相对当前目录的读取、`__dirname` 拼接。
 * 访问过的文件超过上限、或目录列不出时抛出。
 */
function externalInputs(root: string, memberDir: string, entries: readonly string[]): string[][] {
  const visited = new Set<string>()
  const counted = new Set<string>()
  const found = new Map<string, string>()
  const srcDir = join(memberDir, 'src') + sep
  const rel = (path: string) => relative(root, path).split(sep).join('/')
  const count = (file: string): void => {
    if (counted.has(file)) return
    if (counted.size >= EXTERNAL_LIMIT)
      throw new Error(`测试读的成员外文件超过 ${EXTERNAL_LIMIT} 个，追踪不完`)
    counted.add(file)
  }
  const record = (file: string): void => {
    if (!file.startsWith(srcDir)) found.set(rel(file), digestOf(file))
  }
  const listDirectory = (directory: string): void => {
    const listed = spawnSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', rel(directory) || '.'],
      { cwd: root, encoding: 'utf8' },
    )
    if (listed.error !== undefined || listed.status !== 0)
      throw new Error(
        `git ls-files ${rel(directory)} 失败：${listed.error?.message ?? (listed.stderr.trim() || `退出码 ${listed.status}`)}`,
      )
    for (const path of new Set(listed.stdout.split('\0').filter(item => item !== ''))) {
      const file = join(root, path)
      // 指向目录的符号链接等不是文件，读不了内容，跳过。
      if (isDirectory(file)) continue
      count(file)
      record(file)
    }
  }
  const visit = (file: string): void => {
    if (visited.has(file)) return
    visited.add(file)
    count(file)
    if (!SOURCE_FILE.test(file)) return
    const text = readFileSync(file, 'utf8')
    const follow = (target: string): void => {
      record(target)
      visit(target)
    }
    for (const specifier of relativeSpecifiers(text)) {
      const target = resolveImport(file, specifier)
      if (target === undefined)
        found.set(`missing:${rel(resolve(dirname(file), specifier))}`, 'absent')
      else follow(target)
    }
    for (const urlPath of urlTargets(text)) {
      const target = resolve(dirname(file), urlPath)
      if (isFile(target)) follow(target)
      else if (isDirectory(target)) {
        // 仓库根与成员目录的祖先（含成员目录本身）只当锚点，再拼路径读文件；那样的读取不追，列全仓会让增量永远不复用。
        if (target === memberDir || memberDir.startsWith(target + sep))
          found.set(`dir:${rel(target) || '.'}`, 'present')
        else listDirectory(target)
      } else found.set(`missing:${rel(target)}`, 'absent')
    }
  }
  for (const entry of entries) visit(entry)
  return [...found.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * 成员的指纹：在 `storeFingerprint` 的版本与时限之外，加上成员的 `vitest.config.*`、根目录的 `vitest.tiers.mts`、
 * 成员 `tests/` 下所有非 `*.spec.ts` 文件（Git 忽略的不算，按路径排序）的内容摘要，
 * 以及测试经相对导入、require 与 `new URL(…, import.meta.url)` 读到的成员外文件的摘要（`externalInputs`）。Stryker 的增量只比被变异的代码与杀死变异体的测试文件，
 * 这四类变了它不知道。列文件或读内容失败时给出原因（`unavailable`），调用方这一次不复用也不写快照，不能当作内容为空。
 */
export function memberFingerprint(
  root: string,
  memberPath: string,
  testTimeoutSeconds: number,
): MemberFingerprint | { readonly unavailable: string } {
  try {
    const memberDir = join(root, memberPath)
    const config = readdirSync(memberDir)
      .filter(name => name.startsWith('vitest.config.'))
      .sort()
      .map(name => [name, digestOf(join(memberDir, name))])
    const listed = spawnSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', `${memberPath}/tests`],
      { cwd: root, encoding: 'utf8' },
    )
    if (listed.error !== undefined || listed.status !== 0)
      throw new Error(
        `git ls-files 失败：${listed.error?.message ?? (listed.stderr.trim() || `退出码 ${listed.status}`)}`,
      )
    const tracked = [...new Set(listed.stdout.split('\0').filter(path => path !== ''))]
    const external = externalInputs(
      root,
      memberDir,
      tracked.filter(path => SOURCE_FILE.test(path)).map(path => join(root, path)),
    )
    const fixtures = tracked
      .filter(path => !path.endsWith('.spec.ts'))
      .sort()
      .map(path => [path, digestOf(join(root, path))])
    const parts: FingerprintParts = {
      versions: storeFingerprint(testTimeoutSeconds),
      config: sha(JSON.stringify(config)),
      tiers: digestOf(join(root, 'vitest.tiers.mts')),
      fixtures: sha(JSON.stringify(fixtures)),
      external: sha(JSON.stringify(external)),
    }
    return { fingerprint: sha(JSON.stringify(parts)), parts }
  } catch (error) {
    return { unavailable: `指纹的输入读不出：${(error as Error).message}` }
  }
}

/** 快照里与 Stryker 的报告并排放的自己的记录。 */
export interface StoreMeta {
  readonly fingerprint: string
  /** 指纹的分项；旧格式的快照没有，带分项的读取按旧格式整份失效。 */
  readonly parts?: FingerprintParts
  /** 上次第一遍（不含复核）的墙钟秒数乘以它用的工作进程数，排成员并行时当工作量。 */
  readonly workerSeconds: number
  /** 上次落在变异范围里的变异体数，排成员并行时当工作进程的上限。 */
  readonly mutants: number
  /** 快照里 static 变异体（按 `mutantIdentity`）的运行记录：复用时带回来，类型测试的读数才与重跑时相同。 */
  readonly staticRuns: Readonly<Record<string, readonly RunRecord[]>>
}

/** 一份快照：Stryker 的 incremental 报告（原样的 JSON，字段不止 `MutationReport` 那几个）加 `omne`。 */
export interface Store {
  readonly report: Readonly<Record<string, unknown>>
  readonly meta: StoreMeta
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rawFiles(report: Readonly<Record<string, unknown>>): [string, Record<string, unknown>][] {
  const files = report['files']
  if (!isRecord(files)) return []
  return Object.entries(files).filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1]),
  )
}

const rawMutants = (file: Record<string, unknown>): ReportMutant[] =>
  Array.isArray(file['mutants']) ? (file['mutants'] as ReportMutant[]) : []

function isStoreMeta(value: unknown): value is StoreMeta {
  return (
    isRecord(value) &&
    typeof value['fingerprint'] === 'string' &&
    (value['parts'] === undefined ||
      (isRecord(value['parts']) &&
        PART_KEYS.every(
          key => typeof (value['parts'] as Record<string, unknown>)[key] === 'string',
        ))) &&
    typeof value['workerSeconds'] === 'number' &&
    typeof value['mutants'] === 'number' &&
    isRecord(value['staticRuns']) &&
    Object.values(value['staticRuns']).every(Array.isArray)
  )
}

/** 读一份快照；没有、读不出、形状不对或指纹对不上时给出原因，按没有快照处理。 */
export function readStore(
  path: string,
  fingerprint: string,
  parts?: FingerprintParts,
): { readonly store: Store } | { readonly miss: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { miss: '没有快照' }
      : { miss: `快照读不出：${(error as Error).message}` }
  }
  if (!isRecord(parsed) || !isRecord(parsed['files']) || !isStoreMeta(parsed['omne']))
    return { miss: '快照形状不对' }
  if (parsed['omne'].fingerprint !== fingerprint) {
    if (parts === undefined) return { miss: PART_LABELS.versions }
    const stored = parsed['omne'].parts
    if (stored === undefined) return { miss: '快照来自旧格式' }
    const changed = PART_KEYS.filter(key => stored[key] !== parts[key])
    return {
      miss: changed.length === 0 ? '快照指纹不符' : changed.map(key => PART_LABELS[key]).join('；'),
    }
  }
  const { omne, ...report } = parsed
  return { store: { report, meta: omne } }
}

/**
 * 变异体是否落在这次的变异范围里，与 Stryker 判断一样（`mutate` 条目按整行给，列从行首到行尾）：
 * 整个变异体在某一段要变异的行里。Stryker 只为这样的节点生成变异体。`file` 是报告里的键（相对成员目录）。
 */
export function inScope(target: MutationTarget, file: string, mutant: ReportMutant): boolean {
  const ranges = target.lines.get(`${target.member.path}/${file}`)
  return (
    ranges !== undefined &&
    ranges.some(
      ([start, end]) => start <= mutant.location.start.line && mutant.location.end.line <= end,
    )
  )
}

function filterMutants(
  report: Readonly<Record<string, unknown>>,
  keep: (file: string, mutant: ReportMutant) => boolean,
  keepFile: (file: string) => boolean = () => true,
): Record<string, unknown> {
  return {
    ...report,
    files: Object.fromEntries(
      rawFiles(report)
        .filter(([file]) => keepFile(file))
        .map(([file, entry]) => [
          file,
          { ...entry, mutants: rawMutants(entry).filter(mutant => keep(file, mutant)) },
        ]),
    ),
  }
}

/**
 * 交给 Stryker 的 incremental 文件：快照里这个成员这次要变异的文件中、上次被杀的变异体，
 * 加上全部测试文件（Stryker 按它判断杀死变异体的测试变没变）。其余状态不给 Stryker，都重跑。
 */
export function seedReport(
  target: MutationTarget,
  store: Store,
): Readonly<Record<string, unknown>> {
  return filterMutants(
    store.report,
    (_, mutant) => mutant.status === 'Killed',
    file => target.lines.has(`${target.member.path}/${file}`),
  )
}

/**
 * 去掉 Stryker 从 incremental 文件里原样带回、这次没有生成的变异体：Stryker 把不在这次变异范围里的旧变异体留在报告里
 * （@stryker-mutator/core 10.0.0 的 `IncrementalDiffer.diff` 末尾「aren't forgotten」一段），不开增量时报告里没有它们。
 * Stryker 生成的变异体都在范围里，所以只按范围筛，留下的正好是这次生成的。
 */
export function dropCarriedOver(target: MutationTarget, report: MutationReport): MutationReport {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files).map(([file, entry]) => [
        file,
        { ...entry, mutants: entry.mutants.filter(mutant => inScope(target, file, mutant)) },
      ]),
    ),
  }
}

const isMutantRun = (run: RunRecord) => run.mode === 'mutant' && run.activeMutant !== undefined

/**
 * 补回复用的 static 变异体的运行记录：这次没有它的运行记录、快照里按身份找得到的，带回快照里的记录并换成这次的 id。
 * 位置挪动过的找不到，就仍没有记录，读数里少算一次 static 运行（`staticRuns` 只数有记录的）。
 */
export function withCarriedRuns(
  report: MutationReport,
  runs: readonly RunRecord[] | 'unreadable',
  store: Store | undefined,
): readonly RunRecord[] | 'unreadable' {
  if (runs === 'unreadable' || store === undefined) return runs
  const ran = new Set(runs.filter(isMutantRun).map(run => run.activeMutant))
  const carried = Object.entries(report.files).flatMap(([file, entry]) =>
    entry.mutants
      .filter(mutant => mutant.static === true && mutant.status === 'Killed' && !ran.has(mutant.id))
      .flatMap(mutant =>
        (store.meta.staticRuns[mutantIdentity(file, mutant)] ?? []).map(record => ({
          ...record,
          activeMutant: mutant.id,
        })),
      ),
  )
  return [...runs, ...carried]
}

/**
 * 这次运行后的快照：Stryker 写出的 incremental 报告里、落在这次范围里的被杀变异体，
 * 加上它们之中 static 变异体的运行记录（含带回来的）。
 */
export function nextStore(
  target: MutationTarget,
  written: Readonly<Record<string, unknown>>,
  runs: readonly RunRecord[] | 'unreadable',
  facts: {
    readonly fingerprint: string
    readonly parts?: FingerprintParts
    readonly workerSeconds: number
  },
): Store {
  const report = filterMutants(
    written,
    (file, mutant) => mutant.status === 'Killed' && inScope(target, file, mutant),
    file => target.lines.has(`${target.member.path}/${file}`),
  )
  const generated = rawFiles(written).reduce(
    (sum, [file, entry]) =>
      sum + rawMutants(entry).filter(mutant => inScope(target, file, mutant)).length,
    0,
  )
  const byId = new Map<string, RunRecord[]>()
  for (const run of runs === 'unreadable' ? [] : runs.filter(isMutantRun)) {
    const id = run.activeMutant ?? ''
    byId.set(id, [...(byId.get(id) ?? []), run])
  }
  const staticRuns = Object.fromEntries(
    rawFiles(report).flatMap(([file, entry]) =>
      rawMutants(entry)
        .filter(mutant => mutant.static === true && byId.has(mutant.id))
        .map(mutant => [mutantIdentity(file, mutant), byId.get(mutant.id) ?? []]),
    ),
  )
  return {
    report,
    meta: {
      fingerprint: facts.fingerprint,
      ...(facts.parts === undefined ? {} : { parts: facts.parts }),
      workerSeconds: facts.workerSeconds,
      mutants: generated,
      staticRuns,
    },
  }
}

/** 写快照：先写同目录的临时文件再改名，读的一方不会读到半份。写不进去返回原因，不抛。 */
export function writeStore(path: string, store: Store): string | undefined {
  const temporary = `${path}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporary, `${JSON.stringify({ ...store.report, omne: store.meta })}\n`)
    renameSync(temporary, path)
    return undefined
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // 临时文件删不掉只多留一个文件；快照本身没有被改。
    }
    return (error as Error).message
  }
}

/** Stryker 日志里「N of M mutant result(s) are reused」的 N；没有这一行时为 undefined。 */
export function reusedCount(log: string): number | undefined {
  // Stryker 的日志带颜色码（数字本身也可能被上色），先去掉再找。
  const matched = /(\d+) of \d+ mutant result\(s\) are reused/u.exec(stripVTControlCharacters(log))
  return matched === null ? undefined : Number(matched[1])
}
