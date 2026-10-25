// 契约 API 快照的文件格式：结构化模型与它的 Markdown 写法、读法都只在这里定义。
// 生成层产出模型，由 renderSnapshot 写成文本；分类层只经 parseSnapshot 读回模型，不自己拆文本。
// 快照有两部分：每个入口导出了哪些名字（给人读，也给分类对齐导出），以及入口可达的 dist 声明文件，
// 经 TypeScript 打印器规范化。声明文件可以原样还原成一组能编译的 .d.ts，分类器在它上面跑检查器。
// 格式改了就提高 SNAPSHOT_FORMAT：读到别的版本时报错，要求重新生成，不按旧规则猜。

export const SNAPSHOT_FORMAT = 1

/** 按 UTF-16 码元比较，与区域设置无关；快照与报告里一切排序都用它。 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 导出的名字声明在哪里：本成员的某个声明文件、别的包，或是本成员某个文件的命名空间导出（`export * as ns`）。 */
export type ExportOrigin =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'package'; readonly name: string }
  | { readonly kind: 'namespace'; readonly path: string }

export interface EntryExport {
  /** 导出名；命名空间导出的成员写成 `ns.A`。 */
  readonly name: string
  /** 改名导出的原名（`export { A as B }` 的 `A`）。 */
  readonly renamedFrom?: string
  /** 值经 `export type` 导出，消费者只能当类型用。 */
  readonly typeOnly: boolean
  readonly origin: ExportOrigin
}

export interface EntrySection {
  /** `exports` 的子路径。 */
  readonly subpath: string
  /** 入口的声明文件，dist 内相对路径。 */
  readonly file: string
  readonly exports: readonly EntryExport[]
}

export interface DeclarationFile {
  /** dist 内相对路径，例如 `facilities/files.d.ts`；本成员的声明按它与名字定位。 */
  readonly path: string
  readonly code: string
}

export interface ApiSnapshot {
  readonly packageName: string
  readonly entries: readonly EntrySection[]
  readonly files: readonly DeclarationFile[]
}

const FORMAT_LINE = (version: number) => `<!-- omne-contract-api 快照格式 ${version} -->`
const NOTE = '> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。'
const EMPTY = '（无）'

function originText(origin: ExportOrigin): string {
  switch (origin.kind) {
    case 'file':
      return `\`${origin.path}\``
    case 'package':
      return `包 \`${origin.name}\``
    case 'namespace':
      return `命名空间 \`${origin.path}\``
    default: {
      const _exhaustive: never = origin
      return _exhaustive
    }
  }
}

function exportLine(item: EntryExport): string {
  const renamed = item.renamedFrom === undefined ? '' : ` = \`${item.renamedFrom}\``
  return `- \`${item.name}\`${renamed}${item.typeOnly ? ' 仅类型' : ''} · ${originText(item.origin)}`
}

/** 写成文本：入口按子路径、导出按名字、文件按路径排序，同一模型永远写出同样的字节。 */
export function renderSnapshot(snapshot: ApiSnapshot): string {
  const lines = [
    `# ${snapshot.packageName} 的 API 快照`,
    '',
    FORMAT_LINE(SNAPSHOT_FORMAT),
    '',
    NOTE,
  ]
  for (const entry of [...snapshot.entries].sort((a, b) => byCodeUnit(a.subpath, b.subpath))) {
    lines.push('', `## 入口 \`${entry.subpath}\` · \`${entry.file}\``, '')
    const exports = [...entry.exports].sort((a, b) => byCodeUnit(a.name, b.name))
    if (exports.length === 0) lines.push(EMPTY)
    for (const item of exports) lines.push(exportLine(item))
  }
  for (const file of [...snapshot.files].sort((a, b) => byCodeUnit(a.path, b.path)))
    lines.push('', `## 声明文件 \`${file.path}\``, '', '```ts', file.code, '```')
  return lines.join('\n') + '\n'
}

const ENTRY = /^## 入口 `([^`]+)` · `([^`]+)`$/u
const FILE = /^## 声明文件 `([^`]+)`$/u
const EXPORT =
  /^- `([^`]+)`(?: = `([^`]+)`)?( 仅类型)? · (?:`([^`]+)`|包 `([^`]+)`|命名空间 `([^`]+)`)$/u

export class SnapshotFormatError extends Error {}

/** 读回快照；格式版本不对、行认不出、入口或文件重复、同一入口里导出名重复时抛 SnapshotFormatError。 */
export function parseSnapshot(text: string): ApiSnapshot {
  return new SnapshotReader(text.split('\n')).read()
}

interface OpenEntry {
  readonly subpath: string
  readonly file: string
  readonly exports: EntryExport[]
}

class SnapshotReader {
  private readonly entries: OpenEntry[] = []
  private readonly files: DeclarationFile[] = []
  private readonly seen = new Set<string>()
  private current: OpenEntry | undefined
  private readonly lines: readonly string[]

  constructor(lines: readonly string[]) {
    this.lines = lines
  }

  read(): ApiSnapshot {
    const packageName = this.header()
    for (let index = 3; index < this.lines.length; index += 1) {
      const line = this.lines[index] ?? ''
      if (line === '' || (index === 4 && line === NOTE)) continue
      index = this.readLine(index, line)
    }
    return { packageName, entries: this.entries, files: this.files }
  }

  private fail(index: number, why: string): never {
    throw new SnapshotFormatError(`快照第 ${index + 1} 行${why}`)
  }

  /** 标题与格式版本；返回包名。 */
  private header(): string {
    const title = /^# (.+) 的 API 快照$/u.exec(this.lines[0] ?? '')?.[1]
    if (title === undefined) return this.fail(0, '不是快照标题')
    const format = /^<!-- omne-contract-api 快照格式 (\d+) -->$/u.exec(this.lines[2] ?? '')?.[1]
    if (format === undefined) return this.fail(2, '没有格式版本')
    if (Number(format) !== SNAPSHOT_FORMAT)
      this.fail(2, `是格式 ${format}，本工具读格式 ${SNAPSHOT_FORMAT}；用本工具重新 --write`)
    return title
  }

  /** 读一行（入口标题、导出行或声明文件），返回读到的最后一行。 */
  private readLine(index: number, line: string): number {
    const entry = ENTRY.exec(line)
    if (entry !== null) return this.openEntry(index, entry[1] ?? '', entry[2] ?? '')
    const file = FILE.exec(line)
    if (file !== null) return this.readFile(index, file[1] ?? '')
    const current = this.current
    if (current === undefined) return this.fail(index, `认不出：${line}`)
    if (line === EMPTY) return index
    const match = EXPORT.exec(line)
    if (match === null) return this.fail(index, `认不出：${line}`)
    const item = exportOf(match)
    if (current.exports.some(other => other.name === item.name))
      this.fail(index, `重复了导出 ${item.name}`)
    current.exports.push(item)
    return index
  }

  private openEntry(index: number, subpath: string, file: string): number {
    this.claim(index, `入口 ${subpath}`)
    this.current = { subpath, file, exports: [] }
    this.entries.push(this.current)
    return index
  }

  private readFile(index: number, path: string): number {
    this.claim(index, `声明文件 ${path}`)
    this.current = undefined
    if (this.lines[index + 1] !== '' || this.lines[index + 2] !== '```ts')
      this.fail(index, '的声明文件后面没有 ts 代码块')
    const end = this.lines.indexOf('```', index + 3)
    if (end < 0) return this.fail(index, '的代码块没有结束')
    this.files.push({ path, code: this.lines.slice(index + 3, end).join('\n') })
    return end
  }

  private claim(index: number, what: string): void {
    if (this.seen.has(what)) this.fail(index, `重复了${what}`)
    this.seen.add(what)
  }
}

function exportOf(match: RegExpExecArray): EntryExport {
  const origin: ExportOrigin =
    match[4] !== undefined
      ? { kind: 'file', path: match[4] }
      : match[5] !== undefined
        ? { kind: 'package', name: match[5] }
        : { kind: 'namespace', path: match[6] ?? '' }
  return {
    name: match[1] ?? '',
    ...(match[2] === undefined ? {} : { renamedFrom: match[2] }),
    typeOnly: match[3] !== undefined,
    origin,
  }
}
