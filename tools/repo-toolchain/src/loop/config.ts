import { validLines, type Lines } from './bands.ts'
import { readToolchainSection, toolchainConfigPath } from '../core/toolchain-config.ts'

export const INDICATORS = [
  'redMembers',
  'functionsOverAlert',
  'stableOnUnstable',
  'cochangePairs',
  'newEdges',
  'testsWithoutAssertions',
  'duplicationPercent',
  'topicRevChurn',
  'worktrees',
  'worktreeSharedMembers',
  'acceptanceSeconds',
  'acceptanceSlowestSeconds',
  'addedAssemblyFacts',
  'removedAssemblyFacts',
  'changedAssemblyFacts',
  'architectureChanges',
  'unresolvedServiceNames',
] as const
export type IndicatorId = (typeof INDICATORS)[number]

export const SWITCHED_SENSORS = [
  'stability',
  'cochange',
  'duplication',
  'assertions',
  'newEdges',
  'topicChurn',
  'worktrees',
  'acceptance',
  'architecture',
] as const
export type SwitchedSensor = (typeof SWITCHED_SENSORS)[number]

export const BUDGET_ITEMS = ['overAlert', 'risk', 'duplication', 'testsWithoutAssertions'] as const
export type BudgetItem = (typeof BUDGET_ITEMS)[number]

export interface IndicatorConfig {
  readonly lines: Lines | null
  readonly baseline: boolean
  readonly note?: string
}

export interface LoopConfig {
  readonly primaryBranch: string
  readonly relapseLimit: number
  readonly explainTop: number
  readonly indicators: Readonly<Record<IndicatorId, IndicatorConfig>>
  readonly memberBudget: Readonly<Record<BudgetItem, Lines>>
  readonly budgetExcludeGroups: readonly string[]
  readonly budgetBaseline: boolean
  readonly sensors: {
    readonly stability: { readonly enabled: boolean; readonly margin: number }
    readonly cochange: {
      readonly enabled: boolean
      readonly window: number
      readonly maxMembersPerCommit: number
      readonly minTogether: number
      readonly minRatio: number
    }
    readonly duplication: {
      readonly enabled: boolean
      readonly minTokens: number
      readonly minLines: number
    }
    readonly assertions: {
      readonly enabled: boolean
      readonly assertionPattern: RegExp
      readonly helperPattern: RegExp | undefined
      readonly typeTestPattern: RegExp | undefined
    }
    readonly newEdges: { readonly enabled: boolean }
    readonly topicChurn: {
      readonly enabled: boolean
      readonly productRoot: string
      readonly windowDays: number
    }
    readonly worktrees: { readonly enabled: boolean }
    readonly acceptance: { readonly enabled: boolean; readonly excludeRoots: readonly string[] }
    readonly architecture: { readonly enabled: boolean }
    readonly catalogue: { readonly path: string; readonly doctrinePath: string }
  }
  readonly health: Readonly<Record<HealthWindow, number>>
  readonly hook: HookConfig
}

export interface HookConfig {
  readonly enabled: boolean
  readonly maxItems: number
  readonly maxChars: number
  readonly timeoutSeconds: number
  readonly stateLimit: number
}

export const HEALTH_WINDOWS = ['commits', 'runs'] as const
export type HealthWindow = (typeof HEALTH_WINDOWS)[number]

type Raw = Readonly<Record<string, unknown>>

function object(value: unknown, name: string): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${name} 须为对象`)
  return value as Raw
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${name} 须为非负数`)
  return value
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error(`${name} 须为正整数`)
  return value
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} 须为 true 或 false`)
  return value
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${name} 须为非空字符串`)
  return value
}

function pattern(value: unknown, name: string): RegExp {
  const source = text(value, name)
  try {
    return new RegExp(source, 'u')
  } catch (error) {
    throw new Error(`${name} 不是合法的正则表达式：${String(error)}`, { cause: error })
  }
}

function optionalPattern(value: unknown, name: string): RegExp | undefined {
  if (value === '') return undefined
  return pattern(value, name)
}

function lines(value: unknown, name: string): Lines {
  const raw = object(value, name)
  const parsed = {
    warn: number(raw['warn'], `${name}.warn`),
    act: number(raw['act'], `${name}.act`),
    release: number(raw['release'], `${name}.release`),
  }
  if (!validLines(parsed)) throw new Error(`${name} 须满足 release ≤ warn ≤ act`)
  return parsed
}

function exactly<K extends string, V>(
  value: unknown,
  ids: readonly K[],
  name: string,
  parse: (item: unknown, itemName: string) => V,
): Record<K, V> {
  const raw = object(value, name)
  const extra = Object.keys(raw).filter(key => !(ids as readonly string[]).includes(key))
  if (extra.length > 0) throw new Error(`${name} 里有认不出的项：${extra.join('、')}`)
  const out = {} as Record<K, V>
  for (const id of ids) {
    if (!(id in raw)) throw new Error(`${name} 缺 ${id}`)
    out[id] = parse(raw[id], `${name}.${id}`)
  }
  return out
}

function hook(value: unknown): HookConfig {
  const raw = object(value, 'hook')
  const known = ['enabled', 'maxItems', 'maxChars', 'timeoutSeconds', 'stateLimit']
  const extra = Object.keys(raw).filter(key => !known.includes(key))
  if (extra.length > 0) throw new Error(`hook 里有认不出的项：${extra.join('、')}`)
  return {
    enabled: bool(raw['enabled'], 'hook.enabled'),
    maxItems: integer(raw['maxItems'], 'hook.maxItems'),
    maxChars: integer(raw['maxChars'], 'hook.maxChars'),
    timeoutSeconds: integer(raw['timeoutSeconds'], 'hook.timeoutSeconds'),
    stateLimit: integer(raw['stateLimit'], 'hook.stateLimit'),
  }
}

function indicator(value: unknown, name: string): IndicatorConfig {
  const raw = object(value, name)
  if (!('lines' in raw)) throw new Error(`${name}.lines 须给出（没有绝对线写 null）`)
  return {
    lines: raw['lines'] === null ? null : lines(raw['lines'], `${name}.lines`),
    baseline: bool(raw['baseline'], `${name}.baseline`),
    ...('note' in raw ? { note: text(raw['note'], `${name}.note`) } : {}),
  }
}

function roots(value: unknown, name: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item !== ''))
    throw new Error(`${name} 须为仓库相对目录的数组（可以为空）`)
  return value
}

function groups(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item !== ''))
    throw new Error(`${name} 须为成员组名的数组（可以为空）`)
  return value
}

export function parseLoopConfig(parsed: unknown): LoopConfig {
  const raw = object(parsed, '配置')
  const { excludeGroups, baseline, ...budgetLines } = object(raw['memberBudget'], 'memberBudget')
  const sensors = object(raw['sensors'], 'sensors')
  const stability = object(sensors['stability'], 'sensors.stability')
  const cochange = object(sensors['cochange'], 'sensors.cochange')
  const duplication = object(sensors['duplication'], 'sensors.duplication')
  const assertions = object(sensors['assertions'], 'sensors.assertions')
  const newEdges = object(sensors['newEdges'], 'sensors.newEdges')
  const topicChurn = object(sensors['topicChurn'], 'sensors.topicChurn')
  const worktrees = object(sensors['worktrees'], 'sensors.worktrees')
  const acceptance = object(sensors['acceptance'], 'sensors.acceptance')
  if ('reflexion' in sensors) throw new Error('sensors.reflexion 已移除；使用 sensors.architecture')
  const architecture = object(sensors['architecture'], 'sensors.architecture')
  const extra = Object.keys(architecture).filter(key => key !== 'enabled')
  if (extra.length > 0) throw new Error(`sensors.architecture 里有认不出的项：${extra.join('、')}`)
  const indicators = exactly(raw['indicators'], INDICATORS, 'indicators', indicator)
  for (const id of [
    'addedAssemblyFacts',
    'removedAssemblyFacts',
    'changedAssemblyFacts',
    'architectureChanges',
  ] as const) {
    if (indicators[id].lines !== null || indicators[id].baseline)
      throw new Error(`indicators.${id} 是中性事实计数，必须 lines:null、baseline:false`)
  }
  const catalogue = object(sensors['catalogue'], 'sensors.catalogue')
  const minRatio = number(cochange['minRatio'], 'sensors.cochange.minRatio')
  if (minRatio > 1) throw new Error('sensors.cochange.minRatio 须在 0 到 1 之间')
  return {
    primaryBranch: text(raw['primaryBranch'], 'primaryBranch'),
    relapseLimit: integer(raw['relapseLimit'], 'relapseLimit'),
    explainTop: integer(raw['explainTop'], 'explainTop'),
    indicators,
    memberBudget: exactly(budgetLines, BUDGET_ITEMS, 'memberBudget', lines),
    budgetExcludeGroups: groups(excludeGroups, 'memberBudget.excludeGroups'),
    budgetBaseline: bool(baseline, 'memberBudget.baseline'),
    sensors: {
      stability: {
        enabled: bool(stability['enabled'], 'sensors.stability.enabled'),
        margin: number(stability['margin'], 'sensors.stability.margin'),
      },
      cochange: {
        enabled: bool(cochange['enabled'], 'sensors.cochange.enabled'),
        window: integer(cochange['window'], 'sensors.cochange.window'),
        maxMembersPerCommit: integer(
          cochange['maxMembersPerCommit'],
          'sensors.cochange.maxMembersPerCommit',
        ),
        minTogether: integer(cochange['minTogether'], 'sensors.cochange.minTogether'),
        minRatio,
      },
      duplication: {
        enabled: bool(duplication['enabled'], 'sensors.duplication.enabled'),
        minTokens: integer(duplication['minTokens'], 'sensors.duplication.minTokens'),
        minLines: integer(duplication['minLines'], 'sensors.duplication.minLines'),
      },
      assertions: {
        enabled: bool(assertions['enabled'], 'sensors.assertions.enabled'),
        assertionPattern: pattern(
          assertions['assertionPattern'],
          'sensors.assertions.assertionPattern',
        ),
        helperPattern: optionalPattern(
          assertions['helperPattern'],
          'sensors.assertions.helperPattern',
        ),
        typeTestPattern: optionalPattern(
          assertions['typeTestPattern'],
          'sensors.assertions.typeTestPattern',
        ),
      },
      newEdges: { enabled: bool(newEdges['enabled'], 'sensors.newEdges.enabled') },
      topicChurn: {
        enabled: bool(topicChurn['enabled'], 'sensors.topicChurn.enabled'),
        productRoot: text(topicChurn['productRoot'], 'sensors.topicChurn.productRoot'),
        windowDays: integer(topicChurn['windowDays'], 'sensors.topicChurn.windowDays'),
      },
      worktrees: { enabled: bool(worktrees['enabled'], 'sensors.worktrees.enabled') },
      acceptance: {
        enabled: bool(acceptance['enabled'], 'sensors.acceptance.enabled'),
        excludeRoots: roots(acceptance['excludeRoots'], 'sensors.acceptance.excludeRoots'),
      },
      architecture: { enabled: bool(architecture['enabled'], 'sensors.architecture.enabled') },
      catalogue: {
        path: text(catalogue['path'], 'sensors.catalogue.path'),
        doctrinePath: text(catalogue['doctrinePath'], 'sensors.catalogue.doctrinePath'),
      },
    },
    health: exactly(raw['health'], HEALTH_WINDOWS, 'health', integer),
    hook: hook(raw['hook']),
  }
}

export function readLoopConfig(path: string = toolchainConfigPath()): LoopConfig {
  try {
    return parseLoopConfig(readToolchainSection('loop', path))
  } catch (error) {
    throw new Error(`${path} loop: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
