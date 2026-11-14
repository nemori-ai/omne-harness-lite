import { readFileSync } from 'node:fs'

export const HYGIENE_BASELINE_PATH = 'tools/product-checks/hygiene-baseline.json'

export const LIMIT_KEYS = [
  'fileLines',
  'functionLines',
  'specLines',
  'commentRunLines',
  'commentFloorLines',
  'commentPercent',
] as const

export type HygieneLimits = Readonly<Record<(typeof LIMIT_KEYS)[number], number>>

export interface FunctionBand {
  readonly count: number
  readonly longest: number
}

export interface HygieneBaseline {
  readonly limits: HygieneLimits
  readonly documents: readonly string[]
  readonly comments: Readonly<Record<string, number>>
  readonly sizes: {
    readonly files: Readonly<Record<string, number>>
    readonly functions: Readonly<Record<string, FunctionBand>>
  }
}

export const DEFAULT_LIMITS: HygieneLimits = {
  fileLines: 1000,
  functionLines: 150,
  specLines: 600,
  commentRunLines: 3,
  commentFloorLines: 6,
  commentPercent: 1,
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${where} 须为对象`)
  return value as Record<string, unknown>
}

function exactKeys(body: Record<string, unknown>, keys: readonly string[], where: string): void {
  const actual = Object.keys(body).sort(compare)
  const expected = [...keys].sort(compare)
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    throw new Error(`${where} 的键须恰为 ${expected.join('、')}`)
}

function count(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error(`${where} 须为正整数`)
  return value
}

function mapOf<T>(
  value: unknown,
  where: string,
  parse: (entry: unknown, where: string) => T,
): Record<string, T> {
  const body = record(value, where)
  const keys = Object.keys(body)
  if (keys.some((key, index) => index > 0 && compare(keys[index - 1] ?? '', key) >= 0))
    throw new Error(`${where} 的键须按路径字典序排列且不重复`)
  return Object.fromEntries(keys.map(key => [key, parse(body[key], `${where}[${key}]`)]))
}

export function parseHygieneBaseline(text: string, label: string): HygieneBaseline {
  try {
    const body = record(JSON.parse(text), '基线')
    exactKeys(body, ['limits', 'documents', 'comments', 'sizes'], '基线')
    const limits = record(body['limits'], 'limits')
    exactKeys(limits, LIMIT_KEYS, 'limits')
    const documents = body['documents']
    if (!Array.isArray(documents) || documents.some(entry => typeof entry !== 'string'))
      throw new Error('documents 须为字符串数组')
    if (documents.some((entry, index) => index > 0 && compare(documents[index - 1], entry) >= 0))
      throw new Error('documents 须按路径字典序排列且不重复')
    const sizes = record(body['sizes'], 'sizes')
    exactKeys(sizes, ['files', 'functions'], 'sizes')
    return {
      limits: Object.fromEntries(
        LIMIT_KEYS.map(key => [key, count(limits[key], `limits.${key}`)]),
      ) as HygieneLimits,
      documents: documents as string[],
      comments: mapOf(body['comments'], 'comments', count),
      sizes: {
        files: mapOf(sizes['files'], 'sizes.files', count),
        functions: mapOf(sizes['functions'], 'sizes.functions', (entry, where) => {
          const band = record(entry, where)
          exactKeys(band, ['count', 'longest'], where)
          return {
            count: count(band['count'], `${where}.count`),
            longest: count(band['longest'], `${where}.longest`),
          }
        }),
      },
    }
  } catch (error) {
    throw new Error(`${label}：${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

export function readHygieneBaseline(path: string): HygieneBaseline {
  return parseHygieneBaseline(readFileSync(path, 'utf8'), path)
}

const sortedEntries = <T>(entries: Readonly<Record<string, T>>): [string, T][] =>
  Object.entries(entries).sort(([a], [b]) => compare(a, b))

export function renderHygieneBaseline(baseline: HygieneBaseline): string {
  const body = {
    limits: baseline.limits,
    documents: [...baseline.documents].sort(compare),
    comments: Object.fromEntries(sortedEntries(baseline.comments)),
    sizes: {
      files: Object.fromEntries(sortedEntries(baseline.sizes.files)),
      functions: Object.fromEntries(
        sortedEntries(baseline.sizes.functions).map(([path, band]) => [
          path,
          { count: band.count, longest: band.longest },
        ]),
      ),
    },
  }
  return `${JSON.stringify(body, null, 2)}\n`
}
