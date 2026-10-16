import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { parse } from 'yaml'
import { isLegacyDirectory } from '../core/check-scope.ts'

export const SCENARIO_ID = /^[A-Z]{1,3}\d{1,3}[a-z]?$/u
const CELL_SPLIT = /(?<!\\)\|/u

/** 去掉两端空白、`*` 与反引号：`**S1**`、`` `S4b` `` 都读成编号本身。 */
export function bareLabel(text: string): string {
  return text
    .trim()
    .replace(/^[*`]+|[*`]+$/gu, '')
    .trim()
}

/** 表格行第一格里的场景编号；不是带编号的场景行就返回 undefined。 */
export function scenarioId(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return undefined
  const first = bareLabel(trimmed.replace(/^\|+|\|+$/gu, '').split(CELL_SPLIT)[0] ?? '')
  return SCENARIO_ID.test(first) ? first : undefined
}

/** 一份 acceptance.md 里带编号的场景行：编号 → 出现的行号（1 起），按出现先后。 */
export function scenarioRows(text: string): Map<string, number[]> {
  const rows = new Map<string, number[]>()
  text.split('\n').forEach((line, index) => {
    const id = scenarioId(line)
    if (id !== undefined) rows.set(id, [...(rows.get(id) ?? []), index + 1])
  })
  return rows
}

export interface ProductTopic {
  /** 当前产品目录的 slug。 */
  readonly dir: string
  /** README 元数据中的 PD 身份。 */
  readonly topic: string
  /** 这个 topic 的 acceptance.md 里带编号的场景行；没有这份文件时为空。 */
  readonly scenarios: ReadonlyMap<string, readonly number[]>
}

const isDirectory = (path: string) => statSync(path, { throwIfNoEntry: false })?.isDirectory()
const isFile = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() === true

/** 当前产品目录及其编号场景。无编号场景仍返回 topic，由调用方报告未覆盖。 */
export function readProductTopics(productRoot: string): ProductTopic[] {
  if (isDirectory(productRoot) !== true) throw new Error(`产品区不存在或不是目录：${productRoot}`)
  const root = realpathSync(productRoot)
  const inside = (path: string): string => {
    const actual = realpathSync(path)
    const rel = relative(root, actual)
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
      throw new Error(`产品路径越界：${path}`)
    return actual
  }
  const identities = new Set<string>()
  return readdirSync(root)
    .sort()
    .flatMap(dir => {
      if (dir.startsWith('.')) return []
      const entry = lstatSync(join(root, dir))
      if (entry.isSymbolicLink()) throw new Error(`产品目录是越界或别名链接：${dir}`)
      if (!entry.isDirectory()) return []
      if (isLegacyDirectory(dir)) return []
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(dir))
        throw new Error(`产品目录不是合法 slug：${dir}`)
      inside(join(root, dir))
      const readme = join(root, dir, 'README.md')
      if (!isFile(readme)) throw new Error(`产品缺 README：${dir}`)
      const text = readFileSync(inside(readme), 'utf8')
      const front = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(text)
      if (front === null) throw new Error(`产品缺元数据：${dir}`)
      const metadata: unknown = parse(front[1] ?? '')
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
        throw new Error(`产品元数据不是对象：${dir}`)
      if (!('id' in metadata) || typeof metadata.id !== 'string')
        throw new Error(`产品缺身份：${dir}`)
      if (identities.has(metadata.id)) throw new Error(`产品身份重复：${metadata.id}`)
      identities.add(metadata.id)
      if (metadata.id !== `PD-${dir}`) throw new Error(`产品身份与 slug 不一致：${dir}`)
      if (
        !('revision' in metadata) ||
        !Number.isSafeInteger(metadata.revision) ||
        typeof metadata.revision !== 'number' ||
        metadata.revision < 1
      )
        throw new Error(`产品 revision 必须是正整数：${dir}`)
      if (
        !('status' in metadata) ||
        typeof metadata.status !== 'string' ||
        metadata.status.trim() === ''
      )
        throw new Error(`产品缺 status：${dir}`)
      const design = join(root, dir, 'design.md')
      if (!isFile(design)) throw new Error(`产品缺正文：${dir}`)
      inside(design)
      const acceptance = join(root, dir, 'acceptance.md')
      return [
        {
          dir,
          topic: metadata.id,
          scenarios: isFile(acceptance)
            ? scenarioRows(readFileSync(inside(acceptance), 'utf8'))
            : new Map<string, number[]>(),
        },
      ]
    })
}
