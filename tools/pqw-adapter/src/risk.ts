export type Level = 0 | 1 | 2 | 3

export interface PathRule {
  readonly id: string
  readonly level: Level
  readonly reason: string
  readonly pattern: RegExp
}

export const PATH_RULES: readonly PathRule[] = [
  { id: 'ci', level: 3, reason: 'CI 与 gate 定义（.github/）', pattern: /^\.github\// },
  {
    id: 'gate',
    level: 3,
    reason: 'gate 命令（dev-flow integration/gate*）',
    pattern: /^tools\/dev-flow\/src\/integration\/gate[^/]*$/,
  },
  {
    id: 'acceptance',
    level: 3,
    reason: '验收目录（acceptance/）',
    pattern: /(?:^|\/)acceptance\//,
  },
  {
    id: 'contract-snapshot',
    level: 3,
    reason: '契约快照（<成员>/api/<包>.api.md）',
    pattern: /(?:^|\/)api\/[^/]+\.api\.md$/,
  },
]

export const TOOLCHAIN_RULE = {
  id: 'toolchain',
  level: 3,
  reason: '工具链路径（github-gate 的 gate/toolchain-paths.txt）',
} as const

export const PUBLIC_ENTRY_RULE = {
  id: 'public-entry',
  level: 2,
  reason: '公开入口（成员 package.json exports 的 source），公开契约可能有增加',
} as const

const DOCUMENT = /\.md$/

export function toolchainPathspecs(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(line => `:(glob)${line}`)
}

export function publicEntriesOf(member: string, manifest: unknown): string[] {
  const exports =
    typeof manifest === 'object' && manifest !== null
      ? (manifest as { exports?: unknown }).exports
      : undefined
  if (typeof exports !== 'object' || exports === null) return []
  return Object.values(exports).flatMap(entry => {
    const source =
      typeof entry === 'object' && entry !== null
        ? (entry as { source?: unknown }).source
        : undefined
    return typeof source === 'string' ? [`${member}/${source.replace(/^\.\//, '')}`] : []
  })
}

export interface Hit {
  readonly id: string
  readonly level: Level
  readonly reason: string
  readonly paths: readonly string[]
}

export interface RiskInput {
  readonly changed: readonly string[]
  readonly toolchain: readonly string[]
  readonly publicEntries: ReadonlySet<string>
}

export interface Risk {
  readonly level: Level
  readonly hits: readonly Hit[]
}

export function classify({ changed, toolchain, publicEntries }: RiskInput): Risk {
  const hits: Hit[] = []
  const add = (rule: Omit<Hit, 'paths'>, paths: readonly string[]) => {
    if (paths.length > 0) hits.push({ ...rule, paths })
  }
  for (const rule of PATH_RULES)
    add(
      rule,
      changed.filter(path => rule.pattern.test(path)),
    )
  add(TOOLCHAIN_RULE, toolchain)
  add(
    PUBLIC_ENTRY_RULE,
    changed.filter(path => publicEntries.has(path)),
  )
  const floor: Level = changed.length > 0 && changed.every(path => DOCUMENT.test(path)) ? 0 : 1
  const level = hits.reduce<Level>((top, hit) => (hit.level > top ? hit.level : top), floor)
  return { level, hits }
}

const listed = (paths: readonly string[]) =>
  paths.length <= 3 ? paths.join('、') : `${paths.slice(0, 3).join('、')} 等 ${paths.length} 个`

export function riskLines(
  risk: Risk,
  context: { base: string; changed: number; missing?: string },
): string[] {
  return [
    `风险级别 L${risk.level}（改动路径推出的下限，级别定义见 docs/engineering/quality.md）${context.missing === undefined ? '' : '；不完整'}`,
    `基线 ${context.base.slice(0, 9)} 到工作树，改动 ${context.changed} 个文件${risk.hits.length === 0 ? '，没有命中路径规则' : ''}`,
    ...risk.hits.map(hit => `- L${hit.level} ${hit.reason}：${listed(hit.paths)}`),
    ...(context.missing === undefined ? [] : [`没判的规则：${context.missing}`]),
  ]
}
