import type { Criterion, CriterionId, GoalBody } from '../body.ts'
import { entryTexts } from '../render.ts'
import type { CriterionReading } from '../verdict.ts'
import type { JudgeConfig, JudgeMaterial, ObservedCall } from './material.ts'

export const CRITERION_OPTIONS = Object.freeze({
  holds: '证据显示它成立',
  fails: '证据显示没做到',
  'no-evidence': '材料里没有针对它的证据',
  stale: '证据早于之后的改动',
  'cannot-tell': '材料不足以判断',
})
export const RULE_OPTIONS = Object.freeze({
  kept: '材料显示守住了',
  broken: '材料显示违反了',
  unclear: '看不出',
})
export const BLOCK_OPTIONS = Object.freeze({
  none: '没有这样的阻碍',
  blocked: '被权限或资源挡住',
  contradictory: '判据互相矛盾',
  forbidden: '唯一的办法被守则禁止',
})
/** The two questions about a dead end the body did not declare: what blocks, and whether it was tried. */
export const UNATTAINABLE = Object.freeze({ blocked: 'U1', tried: 'U2' })
export const JUDGE_LIMITS = Object.freeze({
  evidencePerEntry: 6,
  activity: 40,
  changedPaths: 40,
  laterWrites: 8,
  activityExcerpt: 400,
  state: 60_000,
})

export type JudgeQuestion =
  | Readonly<{ type: 'choice'; instructions: string; criteria: Readonly<Record<string, string>> }>
  | Readonly<{ type: 'noul'; instructions: string }>
type Json = string | number | boolean | null | JsonObject | readonly Json[]
type JsonObject = { readonly [key: string]: Json }
export type JudgeRequest = Readonly<{
  state: JsonObject
  questions: Readonly<Record<string, JudgeQuestion>>
}>
/** What the system settled itself, and the requests for what only a reader can settle. */
export type Packed = Readonly<{
  decided: Readonly<Partial<Record<CriterionId, CriterionReading>>>
  requests: readonly JudgeRequest[]
}>

/** What a flag on an evidence item means, said beside the item when the configuration asks for it. */
export const FLAG_NOTES = Object.freeze({
  check:
    '这次写改了判据所用的测试或基准。先看它是放宽、跳过了已有的检查，还是只新增了检查：放宽或跳过之后的通过不能证明判据成立。',
  later: '这次调用之后又写过 laterWrites 里的文件，它显示的结果可能已经过时。',
  newer: '同一条命令之后又跑过一次，结果不同，以后一次为准。',
})
const CLAIMS = {
  'not-started': '没开始',
  doing: '在做',
  'claimed-done': '自认做完',
  blocked: '受阻',
} as const

const squeezed = (command: string): string => command.trim().replace(/\s+/gu, ' ')

export function excerptOf(text: string, max: number, take: 'head' | 'tail' | 'both'): string {
  const points = Array.from(text)
  if (points.length <= max) return text
  if (take === 'head') return `${points.slice(0, max).join('')}…`
  if (take === 'tail') return `…${points.slice(-max).join('')}`
  const half = Math.floor(max / 2)
  return `${points.slice(0, half).join('')}\n…\n${points.slice(points.length - half).join('')}`
}

export function latestRun(
  calls: readonly ObservedCall[],
  command: string,
): ObservedCall | undefined {
  const wanted = squeezed(command)
  const runs = calls.filter(
    call => call.exit !== null && call.command !== null && squeezed(call.command) === wanted,
  )
  return runs.reduce<ObservedCall | undefined>(
    (latest, call) => (latest === undefined || call.order > latest.order ? call : latest),
    undefined,
  )
}

// For a file, only a write of that file can have changed what a call showed.
function writesAfter(
  calls: readonly ObservedCall[],
  criterion: Criterion,
  shown: ObservedCall,
): readonly ObservedCall[] {
  const { evidence } = criterion
  if (evidence.kind === 'person') return []
  return calls.filter(
    call =>
      call.writes &&
      call.order > shown.order &&
      (evidence.kind !== 'file' || call.path === evidence.path),
  )
}

const CHECK_PATH =
  /(^|\/)(tests?|__tests__|specs?|e2e|bench(marks)?)\/|\.(spec|test|bench)\.[a-z]+$/u

function checkWrites(
  calls: readonly ObservedCall[],
  command: string,
  run: ObservedCall,
): readonly ObservedCall[] {
  return calls.filter(
    call =>
      call.writes &&
      call.path !== null &&
      call.order < run.order &&
      (CHECK_PATH.test(call.path) || command.includes(call.path)),
  )
}

function exitReading(material: JudgeMaterial, criterion: Criterion, command: string) {
  const { calls } = material
  const run = latestRun(calls, command)
  if (run === undefined) return 'no-evidence'
  if (run.exit !== 0) return 'fails'
  if (writesAfter(calls, criterion, run).length > 0) return 'stale'
  return checkWrites(calls, command, run).length > 0 ? 'unsettled' : 'holds'
}

function evidenceCalls(material: JudgeMaterial, criterion: Criterion): readonly ObservedCall[] {
  const { calls, progress } = material
  const { evidence } = criterion
  const cited = new Set(progress.criteria[criterion.id]?.refs ?? [])
  const found = calls.filter(call => cited.has(call.ref))
  const declared =
    evidence.kind === 'command'
      ? latestRun(calls, evidence.command)
      : evidence.kind === 'file'
        ? calls.findLast(call => call.path === evidence.path)
        : undefined
  const run = evidence.kind === 'command' ? declared : undefined
  const checks = run === undefined ? [] : checkWrites(calls, run.command ?? '', run).slice(-2)
  const all = new Map(
    [...found, ...checks, ...(declared === undefined ? [] : [declared])].map(call => [
      call.ref,
      call,
    ]),
  )
  return [...all.values()]
    .toSorted((a, b) => a.order - b.order)
    .slice(-JUDGE_LIMITS.evidencePerEntry)
}

type Shape = Readonly<{ excerpt: number; lean: boolean }>

/** An object without the members that are `undefined`: what a call does not have is left out, not sent empty. */
function present(members: Readonly<Record<string, Json | undefined>>): JsonObject {
  const kept = Object.entries(members).filter(([, value]) => value !== undefined)
  return Object.fromEntries(kept) as JsonObject
}

function newerRun(calls: readonly ObservedCall[], call: ObservedCall): JsonObject | undefined {
  if (call.command === null || call.exit === null) return undefined
  const newer = latestRun(calls, call.command)
  const differs = newer !== undefined && newer.ref !== call.ref && newer.exit !== call.exit
  return differs ? { ref: newer.ref, exit: newer.exit } : undefined
}

function evidenceItem(
  material: JudgeMaterial,
  config: JudgeConfig,
  shape: Shape,
  criterion: Criterion,
  call: ObservedCall,
): JsonObject {
  const later = writesAfter(material.calls, criterion, call)
    .slice(0, JUDGE_LIMITS.laterWrites)
    .map(write => write.path ?? write.ref)
  const check = call.writes && call.path !== null && CHECK_PATH.test(call.path)
  const newer = newerRun(material.calls, call)
  const notes = [
    check ? FLAG_NOTES.check : '',
    later.length > 0 ? FLAG_NOTES.later : '',
    newer === undefined ? '' : FLAG_NOTES.newer,
  ].join('')
  return present({
    ref: call.ref,
    tool: call.tool,
    command: call.command ?? undefined,
    path: call.path ?? undefined,
    exit: call.exit ?? undefined,
    changesCheck: check ? true : undefined,
    excerpt: excerptOf(call.output, shape.excerpt, config.packaging.take),
    laterWrites: later.length === 0 ? undefined : later,
    newerRun: newer,
    note: config.packaging.flags === 'notes' && notes !== '' ? notes : undefined,
  })
}

type Ask = Readonly<{
  name: string
  section: 'criteria' | 'rules' | 'exits'
  question: JudgeQuestion
}>

function criterionAsk(config: JudgeConfig, criterion: Criterion, rendered: string): Ask {
  const head = `判据 ${criterion.id} 现在成立没有`
  const text =
    config.instructions.criterion === 'statement'
      ? `${head}：${criterion.statement}`
      : `${head}。\n${rendered}`
  const rules = config.instructions.rules.join('')
  const instructions = rules === '' ? text : `${text}\n${rules}`
  return {
    name: criterion.id,
    section: 'criteria',
    question: { type: 'choice', instructions, criteria: CRITERION_OPTIONS },
  }
}

function otherAsks(material: JudgeMaterial): readonly Ask[] {
  const { body, progress } = material
  const rules = body.rules.map((rule): Ask => ({
    name: rule.id,
    section: 'rules',
    question: {
      type: 'choice',
      instructions: `守则 ${rule.id} 守住了没有：${rule.statement}`,
      criteria: RULE_OPTIONS,
    },
  }))
  const exits = body.exits
    .filter(exit => exit.kind === 'condition' || exit.kind === 'person')
    .map((exit): Ask => ({
      name: exit.id,
      section: 'exits',
      question: {
        type: 'noul',
        instructions: `退出 ${exit.id} 写的情形出现了没有：${exit.statement}`,
      },
    }))
  if (progress.obstacle === null) return [...rules, ...exits]
  const dead: readonly Ask[] = [
    {
      name: UNATTAINABLE.blocked,
      section: 'exits',
      question: {
        type: 'choice',
        instructions: '有没有正文的退出没写到、却让目标达不成的阻碍。',
        criteria: BLOCK_OPTIONS,
      },
    },
    {
      name: UNATTAINABLE.tried,
      section: 'exits',
      question: {
        type: 'noul',
        instructions: '进展清单的阻碍指到的调用里，agent 针对这个阻碍实际试过没有。',
      },
    },
  ]
  return [...rules, ...exits, ...dead]
}

function sorted(material: JudgeMaterial, config: JudgeConfig) {
  const decided: Partial<Record<CriterionId, CriterionReading>> = {}
  const asked: { criterion: Criterion; evidence: readonly ObservedCall[] }[] = []
  for (const criterion of material.body.criteria) {
    const { evidence, pass } = criterion
    if (evidence.kind === 'metric') continue
    if (evidence.kind === 'command' && pass?.kind === 'exit-zero') {
      const reading = exitReading(material, criterion, evidence.command)
      if (reading !== 'stale' && reading !== 'unsettled') {
        decided[criterion.id] = reading
        continue
      }
    }
    const shown = evidenceCalls(material, criterion)
    const last = shown.at(-1)
    const stale =
      config.packaging.staleness === 'decided' &&
      last !== undefined &&
      writesAfter(material.calls, criterion, last).length > 0
    if (stale) decided[criterion.id] = 'stale'
    else asked.push({ criterion, evidence: shown })
  }
  return { decided, asked }
}

function goalState(body: GoalBody): JsonObject {
  return { purpose: body.purpose, ...entryTexts(body) }
}

function activity(
  calls: readonly ObservedCall[],
  config: JudgeConfig,
  shape: Shape,
): readonly (string | JsonObject)[] {
  const max = Math.min(shape.excerpt, JUDGE_LIMITS.activityExcerpt)
  return calls
    .toSorted((a, b) => a.order - b.order)
    .slice(-JUDGE_LIMITS.activity)
    .map(call => {
      const what = call.command ?? call.path ?? ''
      const exit = call.exit === null ? '' : ` → ${String(call.exit)}`
      const line = `${call.ref} ${call.tool}${what === '' ? '' : ` ${what}`}${exit}`
      const telling = call.writes || (call.exit !== null && call.exit !== 0)
      const level = config.packaging.activity
      return level === 'all' || (level === 'excerpts' && telling)
        ? { call: line, excerpt: excerptOf(call.output, max, config.packaging.take) }
        : line
    })
}

function changedPaths(calls: readonly ObservedCall[]): readonly string[] {
  const paths = calls.flatMap(call => (call.writes && call.path !== null ? [call.path] : []))
  return [...new Set(paths)].slice(-JUDGE_LIMITS.changedPaths)
}

type Sorted = ReturnType<typeof sorted>

function claimsOf(
  material: JudgeMaterial,
  config: JudgeConfig,
  shape: Shape,
  mine: Sorted['asked'],
): JsonObject {
  const said = mine.flatMap(({ criterion }) => {
    const entry = material.progress.criteria[criterion.id]
    if (entry === undefined) return []
    const noted = config.packaging.notes && !shape.lean && entry.note !== ''
    const claim = present({
      claim: CLAIMS[entry.status],
      refs: shape.lean ? undefined : entry.refs,
      note: noted ? entry.note : undefined,
    })
    return [[criterion.id, claim] as const]
  })
  return Object.fromEntries(said)
}

function stateOf(
  material: JudgeMaterial,
  config: JudgeConfig,
  shape: Shape,
  split: Sorted,
  asks: readonly Ask[],
): JsonObject {
  const { body, progress, calls } = material
  const names = new Set(asks.map(ask => ask.name))
  const mine = split.asked.filter(entry => names.has(entry.criterion.id))
  const item = (criterion: Criterion) => (call: ObservedCall) =>
    evidenceItem(material, config, shape, criterion, call)
  const evidence = (shape.lean ? [] : mine).map(
    entry => [entry.criterion.id, entry.evidence.map(item(entry.criterion))] as const,
  )
  const beyond = asks.some(ask => ask.section !== 'criteria')
  const full = beyond && !shape.lean
  const { obstacle, proposal } = progress
  const blocked =
    shape.lean && obstacle !== null ? { what: obstacle.what, exit: obstacle.exit } : obstacle
  return {
    goal: goalState(body),
    progress: present({
      criteria: claimsOf(material, config, shape, mine),
      rules: beyond ? (progress.rules as JsonObject) : undefined,
      proposal: beyond ? proposal : undefined,
      obstacle: beyond && blocked !== null ? blocked : undefined,
    }),
    evidence: Object.fromEntries(evidence),
    facts: present({
      attendance: material.attendance,
      rounds: material.rounds,
      metrics: material.metrics as JsonObject,
      decided: split.decided as JsonObject,
      changedPaths: full ? changedPaths(calls) : undefined,
      activity: full ? activity(calls, config, shape) : undefined,
    }),
  }
}

function grouped(config: JudgeConfig, asks: readonly Ask[]): readonly (readonly Ask[])[] {
  if (asks.length === 0) return []
  if (config.split === 'one') return [asks]
  if (config.split === 'each') return asks.map(ask => [ask])
  return (['criteria', 'rules', 'exits'] as const)
    .map(section => asks.filter(ask => ask.section === section))
    .filter(group => group.length > 0)
}

/** One judging as requests: the same function packs for the release and for the bench. */
export function packJudge(material: JudgeMaterial, config: JudgeConfig): Packed {
  const split = sorted(material, config)
  const rendered = entryTexts(material.body).criteria
  const text = (criterion: Criterion): string =>
    rendered[material.body.criteria.indexOf(criterion)] ?? criterion.statement
  const asks = [
    ...split.asked.map(({ criterion }) => criterionAsk(config, criterion, text(criterion))),
    ...otherAsks(material),
  ]
  const { excerpt } = config.packaging
  const ladder: readonly Shape[] = [1, 2, 4, 8].map(part => ({
    excerpt: Math.floor(excerpt / part),
    lean: false,
  }))
  const requests = grouped(config, asks).map((group): JudgeRequest => {
    const questions = Object.fromEntries(group.map(ask => [ask.name, ask.question]))
    const fits = ladder
      .map(shape => stateOf(material, config, shape, split, group))
      .find(state => JSON.stringify(state).length <= JUDGE_LIMITS.state)
    const state = fits ?? stateOf(material, config, { excerpt: 0, lean: true }, split, group)
    return { state, questions }
  })
  return { decided: split.decided, requests }
}
