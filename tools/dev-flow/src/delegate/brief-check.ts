import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { posix, resolve } from 'node:path'

/** The input to a check is wrong (not the spec): bad option, unreadable file, git failure. */
export class BriefInputError extends Error {
  override name = 'BriefInputError'
}

/** One finding. `item` is the check number of SPEC.md; `line` is the 1-based line of the spec. */
export interface Finding {
  item: number
  message: string
  line: number | null
}
export interface BriefReport {
  errors: Finding[]
  warnings: Finding[]
}
export interface GrepHit {
  path: string
  line: number
  text: string
}
/** What the checks need to know about the repository at the base commit and about local files. */
export interface BriefRepository {
  existsAtBase(path: string): boolean
  readAtBase(path: string): string | undefined
  /** Whole-word hits of `identifier` in tracked source files. */
  grep(identifier: string): GrepHit[]
  /** Lines of tracked source files that import or re-export a relative module. */
  relativeImports(): GrepHit[]
  /** A local file, absolute or relative to the checkout. */
  fileExists(path: string): boolean
}

const DEVELOPER_TASK_FIELDS = [
  '身份与位置',
  '模型与推理强度',
  '目标边界',
  '验收清单',
  '实施规格',
  '性质及证据义务',
  '施工计划',
  '自主范围与动作授权',
  '工作树与协调',
  '方法与知识入口',
  '当前认知',
  '返回与恢复',
] as const
const SUPPLEMENT_SECTIONS = ['已知会受影响的现有用例', '停止条件', '追加记录'] as const
const REQUIRED_SECTIONS: readonly string[] = [...DEVELOPER_TASK_FIELDS, ...SUPPLEMENT_SECTIONS]
const IDENTITY_ROWS = ['闭包', '卡与修订', '工作树', '分支', '基线', '清晰度'] as const
const DESCRIPTIVE = [/定义.*的文件/, /及其测试/, /或/, /先找到/]
const SCOPE_LINE = /^- `([^`]+)`(（新建）)?(?: — (.*))?$/
const COMMIT = /^[0-9a-f]{40}$/
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const REPOSITORY_PATH = /^[\w.@-]+(?:\/[\w.@-]+)+\.[A-Za-z0-9]+$/
const SOURCE_PATHSPEC = ['*.ts', '*.mts', '*.js', '*.mjs']
const MODULE_EXTENSION = /\.[cm]?[jt]s$/

interface Line {
  no: number
  text: string
}
interface Section {
  heading: Line
  body: Line[]
}

/** The `##` sections of the spec, outside code fences; the first section of a title wins. */
function parseSections(spec: string): Map<string, Section> {
  const sections = new Map<string, Section>()
  let current: Section | undefined
  let fenced = false
  spec.split(/\r?\n/).forEach((text, index) => {
    const line = { no: index + 1, text }
    if (/^\s*```/.test(text)) fenced = !fenced
    const title = fenced ? undefined : /^##\s+(.+?)\s*$/.exec(text)?.[1]
    if (title !== undefined) {
      current = { heading: line, body: [] }
      if (!sections.has(title)) sections.set(title, current)
    } else current?.body.push(line)
  })
  return sections
}
/** The lines under `### <title>` up to the next `###` heading. */
function subsection(section: Section | undefined, title: string): Section | undefined {
  if (section === undefined) return undefined
  const start = section.body.findIndex(line => line.text.trim() === `### ${title}`)
  if (start < 0) return undefined
  const rest = section.body.slice(start + 1)
  const end = rest.findIndex(line => /^###\s/.test(line.text))
  return { heading: section.body[start] as Line, body: end < 0 ? rest : rest.slice(0, end) }
}
const stripTicks = (value: string) =>
  value
    .trim()
    .replace(/^`+|`+$/g, '')
    .trim()
function row(section: Section, label: string): { value: string; line: number } | undefined {
  for (const line of section.body) {
    const match = new RegExp(`^-\\s*${label}\\s*[：:]\\s*(.*)$`).exec(line.text)
    if (match !== null) return { value: stripTicks(match[1] ?? ''), line: line.no }
  }
  return undefined
}
const stem = (path: string) => path.replace(MODULE_EXTENSION, '')

interface ScopeEntry {
  path: string
  isNew: boolean
  line: number
}

class Findings {
  readonly errors: Finding[] = []
  readonly warnings: Finding[] = []
  error(item: number, message: string, line: number | null): void {
    this.errors.push({ item, message, line })
  }
  warning(item: number, message: string, line: number | null): void {
    this.warnings.push({ item, message, line })
  }
}

function checkIdentity(sections: Map<string, Section>, out: Findings): void {
  for (const title of REQUIRED_SECTIONS)
    if (!sections.has(title)) out.error(1, `missing-section: "${title}"`, null)
  const identity = sections.get('身份与位置')
  if (identity === undefined) return
  for (const label of IDENTITY_ROWS) {
    const found = row(identity, label)
    if (found === undefined) out.error(1, `missing-identity-row: "${label}"`, identity.heading.no)
    else if (found.value === '') out.error(1, `empty-identity-row: "${label}"`, found.line)
  }
  const base = row(identity, '基线')
  if (base !== undefined && base.value !== '' && !COMMIT.test(base.value))
    out.error(1, `bad-baseline: 基线 must be 40 hexadecimal digits, got "${base.value}"`, base.line)
  const clarity = row(identity, '清晰度')
  if (clarity !== undefined && clarity.value !== '' && !['定', '界', '探'].includes(clarity.value))
    out.error(1, `bad-clarity: 清晰度 must be 定, 界 or 探, got "${clarity.value}"`, clarity.line)
  const tree = row(identity, '工作树')
  if (tree !== undefined && tree.value !== '' && !ABSOLUTE_PATH.test(tree.value))
    out.error(1, `bad-worktree: 工作树 must be an absolute path, got "${tree.value}"`, tree.line)
}

function repositoryRelative(path: string): boolean {
  return !/^(?:\/|[A-Za-z]:)/.test(path) && !path.includes('\\') && !path.split('/').includes('..')
}
function parseScope(sections: Map<string, Section>, out: Findings): ScopeEntry[] {
  const boundary = sections.get('目标边界')
  if (boundary === undefined) return []
  const scope = subsection(boundary, '写范围')
  if (scope === undefined) {
    out.error(
      2,
      'missing-write-scope: "### 写范围" not found under "目标边界"',
      boundary.heading.no,
    )
    return []
  }
  const entries: ScopeEntry[] = []
  for (const { no, text } of scope.body) {
    const trimmed = text.trim()
    if (!trimmed.startsWith('- ')) continue
    const head = trimmed.split(' — ')[0] ?? trimmed
    if (DESCRIPTIVE.some(pattern => pattern.test(head))) {
      out.error(2, `scope-line-descriptive: name the file, not a description: ${trimmed}`, no)
      continue
    }
    const match = SCOPE_LINE.exec(trimmed)
    const path = match?.[1]
    if (match === null || path === undefined || !repositoryRelative(path)) {
      out.error(
        2,
        `scope-line-format: expected "- \`<repository-relative path>\`（新建）? — <reason>": ${trimmed}`,
        no,
      )
      continue
    }
    if ((match[3] ?? '').trim() === '')
      out.error(2, `scope-line-reason: no reason for ${path} after " — "`, no)
    entries.push({ path, isNew: match[2] !== undefined, line: no })
  }
  if (entries.length === 0 && !out.errors.some(error => error.item === 2))
    out.error(2, 'empty-write-scope: "### 写范围" lists no file', scope.heading.no)
  return entries
}
function excludedPaths(sections: Map<string, Section>): Set<string> {
  const excluded = subsection(sections.get('目标边界'), '排除的调用方')
  const paths = new Set<string>()
  for (const { text } of excluded?.body ?? []) {
    const path = /^\s*- `([^`]+)`/.exec(text)?.[1]
    if (path !== undefined) paths.add(path)
  }
  return paths
}

function checkScopePaths(scope: ScopeEntry[], repository: BriefRepository, out: Findings): void {
  for (const entry of scope)
    if (!entry.isNew && !repository.existsAtBase(entry.path))
      out.error(3, `scope-path-missing: ${entry.path} is not on the base commit`, entry.line)
}

/** The line of a declaration or export-list entry of `identifier` in `content`, if any. */
function definitionLine(content: string, identifier: string): number | undefined {
  const escaped = identifier.replace(/[$]/g, '\\$')
  const declaration = new RegExp(
    `^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|interface|type)\\s+${escaped}(?![\\w$])`,
    'm',
  )
  const lineAt = (offset: number) => content.slice(0, offset).split('\n').length
  const declared = declaration.exec(content)
  const found: number[] = declared === null ? [] : [lineAt(declared.index)]
  const list = /export\s*(?:type\s*)?\{([^}]*)\}(?!\s*from)/g
  for (let match = list.exec(content); match !== null; match = list.exec(content)) {
    const names = (match[1] ?? '').split(',').flatMap(entry => entry.trim().split(/\s+as\s+/))
    if (names.includes(identifier)) {
      const inside = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).exec(match[1] ?? '')
      found.push(lineAt(match.index + (match[0].indexOf('{') + 1) + (inside?.index ?? 0)))
    }
  }
  return found.length === 0 ? undefined : Math.min(...found)
}
function backtickWords(section: Section | undefined): string[] {
  const words: string[] = []
  for (const { text } of section?.body ?? [])
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const word = match[1] ?? ''
      if (IDENTIFIER.test(word) && !words.includes(word)) words.push(word)
    }
  return words
}

function checkCallers(
  sections: Map<string, Section>,
  scope: ScopeEntry[],
  repository: BriefRepository,
  out: Findings,
): void {
  const covered = new Set([...scope.map(entry => entry.path), ...excludedPaths(sections)])
  const identifiers = [
    ...new Set([
      ...backtickWords(sections.get('实施规格')),
      ...backtickWords(sections.get('当前认知')),
    ]),
  ]
  let imports: GrepHit[] | undefined
  const fileText = new Map<string, string | undefined>()
  const text = (path: string) => {
    if (!fileText.has(path)) fileText.set(path, repository.readAtBase(path))
    return fileText.get(path)
  }
  for (const identifier of identifiers) {
    const hits = repository.grep(identifier)
    const definitions = new Map<string, number>()
    for (const path of new Set(hits.map(hit => hit.path))) {
      const content = text(path)
      const line = content === undefined ? undefined : definitionLine(content, identifier)
      if (line !== undefined) definitions.set(path, line)
    }
    for (const [defined, definedLine] of definitions) {
      const candidates = new Map<string, number>()
      const note = (path: string, line: number) =>
        candidates.set(path, Math.min(line, candidates.get(path) ?? line))
      note(defined, definedLine)
      for (const hit of hits) if (hit.path !== defined) note(hit.path, hit.line)
      imports ??= repository.relativeImports()
      for (const hit of imports) {
        const specifier = /\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/.exec(hit.text)?.[1]
        if (specifier === undefined || hit.path === defined) continue
        const target = posix.normalize(posix.join(posix.dirname(hit.path), specifier))
        if (stem(target) === stem(defined)) note(hit.path, hit.line)
      }
      for (const [path, line] of candidates)
        if (!covered.has(path))
          out.warning(
            4,
            `caller-outside-scope: ${path}:${line} references ${identifier} (defined in ${defined})`,
            null,
          )
    }
  }
}

function memberScripts(repository: BriefRepository, directory: string): Set<string> {
  const path = directory === '' ? 'package.json' : `${directory.replace(/\/$/, '')}/package.json`
  const names = new Set<string>()
  const content = repository.readAtBase(path)
  if (content === undefined) return names
  try {
    const scripts: unknown = (JSON.parse(content) as { scripts?: unknown }).scripts
    if (typeof scripts === 'object' && scripts !== null)
      Object.keys(scripts).forEach(n => names.add(n))
  } catch {
    // A package.json that does not parse defines no script.
  }
  return names
}
function nearestMember(repository: BriefRepository, path: string): string | undefined {
  for (let directory = posix.dirname(path); directory !== '.'; directory = posix.dirname(directory))
    if (repository.readAtBase(`${directory}/package.json`) !== undefined) return directory
  return undefined
}
function checkAcceptance(
  sections: Map<string, Section>,
  scope: ScopeEntry[],
  repository: BriefRepository,
  out: Findings,
): void {
  const acceptance = sections.get('验收清单')
  if (acceptance === undefined) return
  const members = new Set<string>()
  for (const entry of scope) {
    const member = nearestMember(repository, entry.path)
    if (member !== undefined) members.add(member)
  }
  const scopePaths = new Set(scope.map(entry => entry.path))
  let fenced = false
  for (const { no, text } of acceptance.body) {
    if (/^\s*```/.test(text)) fenced = !fenced
    const directories = ['', ...members]
    for (const match of text.matchAll(/\bcd\s+([^\s&;`]+)/g)) directories.push(match[1] ?? '')
    for (const match of text.matchAll(/\bpnpm\s+run\s+([\w:.-]+)/g)) {
      const script = match[1] ?? ''
      if (!directories.some(directory => memberScripts(repository, directory).has(script)))
        out.error(
          5,
          `script-missing: pnpm run ${script} is in no package.json of the root or members`,
          no,
        )
    }
    const words = fenced
      ? text.split(/\s+/)
      : [...text.matchAll(/`([^`\n]+)`/g)].flatMap(match => (match[1] ?? '').split(/\s+/))
    for (const word of words) {
      const path = word
        .replace(/^\.\//, '')
        .replace(/#.*$/, '')
        .replace(/[,;。，；]+$/, '')
      if (!REPOSITORY_PATH.test(path) || path.startsWith('..') || path.startsWith('tmp/')) continue
      if (!repository.existsAtBase(path) && !scopePaths.has(path))
        out.error(
          5,
          `acceptance-path-missing: ${path} is not on the base commit or in the write scope`,
          no,
        )
    }
  }
}

function checkStopConditions(sections: Map<string, Section>, out: Findings): void {
  const stop = sections.get('停止条件')
  if (stop === undefined) return
  const content = stop.body
    .map(line => line.text)
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
  if (content.trim() === '')
    out.error(6, 'empty-stop-conditions: "停止条件" has no content', stop.heading.no)
}
function checkReadFirst(
  sections: Map<string, Section>,
  repository: BriefRepository,
  out: Findings,
): void {
  const methods = sections.get('方法与知识入口')
  if (methods === undefined) return
  const found = row(methods, '先读')
  if (found === undefined || found.value === '')
    out.error(
      8,
      'read-first-missing: no "- 先读：<path>" line under "方法与知识入口"',
      methods.heading.no,
    )
  else if (!repository.fileExists(found.value))
    out.error(8, `read-first-missing: ${found.value} does not exist`, found.line)
}

/** Runs the checks of SPEC.md on a closure spec. `strict` turns the caller warnings into errors. */
export function checkBrief(
  spec: string,
  repository: BriefRepository,
  options: { strict?: boolean } = {},
): BriefReport {
  const sections = parseSections(spec)
  const out = new Findings()
  checkIdentity(sections, out)
  const scope = parseScope(sections, out)
  checkScopePaths(scope, repository, out)
  checkCallers(sections, scope, repository, out)
  checkAcceptance(sections, scope, repository, out)
  checkStopConditions(sections, out)
  checkReadFirst(sections, repository, out)
  if (options.strict === true) {
    out.errors.push(...out.warnings.splice(0))
    out.errors.sort((a, b) => a.item - b.item)
  }
  return { errors: out.errors, warnings: out.warnings }
}

function git(root: string, args: string[], allowedStatus: number[] = [0]) {
  const result = spawnSync('git', ['-C', root, '-c', 'core.quotepath=off', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  if (
    result.error !== undefined ||
    result.status === null ||
    !allowedStatus.includes(result.status)
  )
    throw new BriefInputError(
      `git ${args.slice(0, 2).join(' ')} failed${result.error === undefined ? `: ${result.stderr.trim()}` : `: ${result.error.message}`}`,
    )
  return { status: result.status, stdout: result.stdout }
}
/** The git root of `directory`. */
export function gitRoot(directory: string): string {
  return git(directory, ['rev-parse', '--show-toplevel']).stdout.trim()
}
/** The 40-digit commit that `ref` names in the repository at `root`. */
export function resolveCommit(root: string, ref: string): string {
  const result = spawnSync(
    'git',
    ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    { encoding: 'utf8' },
  )
  const commit = result.stdout?.trim() ?? ''
  if (result.status !== 0 || !COMMIT.test(commit))
    throw new BriefInputError(`--base ${ref} is not a commit in ${root}`)
  return commit
}

/** The repository at `root` as seen at `commit` through git. */
export function gitRepository(root: string, commit: string): BriefRepository {
  const grep = (extra: string[]): GrepHit[] => {
    const { status, stdout } = git(
      root,
      ['grep', '-n', '-z', ...extra, commit, '--', ...SOURCE_PATHSPEC],
      [0, 1],
    )
    if (status === 1) return []
    const hits: GrepHit[] = []
    for (const record of stdout.split('\n')) {
      // With -z git prints `<commit>:<path> NUL <line> NUL <text>`.
      const [file, line, ...text] = record.split('\0')
      if (file === undefined || line === undefined || !/^\d+$/.test(line)) continue
      hits.push({ path: file.slice(commit.length + 1), line: Number(line), text: text.join('\0') })
    }
    return hits
  }
  let imports: GrepHit[] | undefined
  return {
    existsAtBase: path =>
      spawnSync('git', ['-C', root, 'cat-file', '-e', `${commit}:${path}`]).status === 0,
    readAtBase(path) {
      const result = spawnSync('git', ['-C', root, 'cat-file', '-p', `${commit}:${path}`], {
        encoding: 'utf8',
        maxBuffer: 1 << 28,
      })
      return result.status === 0 ? result.stdout : undefined
    },
    grep: identifier => grep(['-F', '-w', '-e', identifier]),
    relativeImports: () => (imports ??= grep(['-E', '-e', `from[[:space:]]*['"]\\.\\.?/`])),
    fileExists: path => existsSync(resolve(root, path)),
  }
}
