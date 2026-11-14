import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const WAVES = ['A', 'B', 'C', 'D', 'E'] as const
export type Wave = (typeof WAVES)[number]

export const CATEGORIES = ['A', 'B', 'C', 'none'] as const
export type Category = (typeof CATEGORIES)[number]

export interface RetireItem {
  readonly id: string
  readonly category: Category
  readonly exports: readonly string[]
  readonly exists: boolean
  readonly retireWave: Exclude<Wave, 'E'> | null
  readonly dueBy: Wave | null
  readonly ownerKind: 'line' | 'reduce' | null
  readonly note: string
}

export interface RetireTable {
  readonly source: { readonly file: string; readonly sha256: string; readonly ref: string }
  readonly refreshedAt: string
  readonly items: readonly RetireItem[]
}

export class TableError extends Error {
  override readonly name = 'TableError'
}

export const DEFAULT_TABLE_PATH = fileURLToPath(
  new URL('../../retire-doubles.json', import.meta.url),
)

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function field<T>(
  holder: Record<string, unknown>,
  key: string,
  where: string,
  accept: (value: unknown) => value is T,
  expected: string,
): T {
  const value = holder[key]
  if (!accept(value)) throw new TableError(`${where}的 ${key} 缺失或不合法（应为${expected}）`)
  return value
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNonEmpty = (value: unknown): value is string => isString(value) && value !== ''
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isWave = (value: unknown): value is Wave => WAVES.includes(value as Wave)
const isCategory = (value: unknown): value is Category => CATEGORIES.includes(value as Category)
const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmpty)
const nullable =
  <T>(accept: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || accept(value)
const isCommit = (value: unknown): value is string =>
  isString(value) && /^[0-9a-f]{40}$/u.test(value)
const isSha256 = (value: unknown): value is string =>
  isString(value) && /^[0-9a-f]{64}$/u.test(value)
const isOwnerKind = (value: unknown): value is 'line' | 'reduce' =>
  value === 'line' || value === 'reduce'

function parseItem(value: unknown, index: number): RetireItem {
  if (!isObject(value)) throw new TableError(`items[${index}] 不是对象`)
  const id = field(value, 'id', `items[${index}]`, isNonEmpty, '非空字符串')
  const where = `项 ${id}`
  const category = field(value, 'category', where, isCategory, 'A、B、C 或 none')
  const exportsField = field(value, 'exports', where, isNames, '非空字符串数组')
  const exists = field(value, 'exists', where, isBoolean, '布尔值')
  const retireWave = field(value, 'retireWave', where, nullable(isWave), 'A 至 D 或 null')
  if (retireWave === 'E') throw new TableError(`${where}的 retireWave 不能是 E`)
  const dueBy = field(value, 'dueBy', where, nullable(isWave), 'A 至 E 或 null')
  const ownerKind = field(value, 'ownerKind', where, nullable(isOwnerKind), 'line、reduce 或 null')
  const note = field(value, 'note', where, isString, '字符串')
  if (dueBy !== null && (category === 'C' || category === 'none'))
    throw new TableError(`${where}是 ${category} 类，不到期，dueBy 必须为 null`)
  return { id, category, exports: exportsField, exists, retireWave, dueBy, ownerKind, note }
}

export function parseRetireTable(text: string): RetireTable {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new TableError(`不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isObject(raw)) throw new TableError('顶层不是对象')
  const sourceRaw = raw['source']
  if (!isObject(sourceRaw)) throw new TableError('缺少来源头部 source')
  const source = {
    file: field(sourceRaw, 'file', 'source', isNonEmpty, '非空字符串'),
    sha256: field(sourceRaw, 'sha256', 'source', isSha256, '64 位十六进制'),
    ref: field(sourceRaw, 'ref', 'source', isCommit, '40 位提交号'),
  }
  const refreshedAt = field(raw, 'refreshedAt', '头部', isCommit, '40 位提交号')
  const list = raw['items']
  if (!Array.isArray(list) || list.length === 0) throw new TableError('items 缺失或为空')
  const items = list.map(parseItem)
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) throw new TableError(`项 id 重复：${item.id}`)
    seen.add(item.id)
  }
  return { source, refreshedAt, items }
}

export function readRetireTable(path: string = DEFAULT_TABLE_PATH): RetireTable {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new TableError(
      `读不到 ${path}：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return parseRetireTable(text)
}

export function isDue(item: RetireItem, wave: Wave): boolean {
  return item.dueBy !== null && WAVES.indexOf(item.dueBy) <= WAVES.indexOf(wave)
}
