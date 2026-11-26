import {
  criterionId,
  type ExamCase,
  type Files,
  type Product,
  type StepKind,
  type Truth,
} from './product.ts'
import { modelScript, type ExaminerKind } from './script.ts'
import type { Entry, GoalView, Spent, Stage } from './stage.ts'

export type Reading = Readonly<{ truth: Truth; said: string }>
/** What one batch came to: what each criterion was read as beside what it is, what the batch cost, and what the examiner did to the work. */
export type BatchResult = Readonly<{
  step: number
  kind: StepKind
  readings: Readonly<Record<string, Reading>>
  seconds: number
  usd: number
  calls: number
  changed: readonly string[]
  added: readonly string[]
}>
export type ExaminerCall = Readonly<{ id: string; tool: string; arguments: string; result: string }>
export type CaseResult = Readonly<{
  id: string
  product: string
  examiner: ExaminerKind
  batches: readonly BatchResult[]
  calls: readonly ExaminerCall[]
  /** The steps that were not reached because the goal settled on the batch before: every criterion was read as held, so nothing more is examined. */
  unreached: number
  error: string | null
}>
export type Timing = Readonly<{
  now(): number
  wait(ms: number): Promise<void>
  pollMs: number
  batchMs: number
}>

export const draftOf = (product: Product): object => ({
  purpose: product.purpose,
  criteria: product.criteria.map(({ statement, method }) => ({
    statement,
    evidence: { kind: 'examination', method },
  })),
})

const NOTHING: Spent = { calls: 0, usd: 0, modelMs: 0 }
const UNREAD = 'unread'
const KEPT = 900

/** Waits until the goal rests (it is paused or settled) with no batch out, and gives it as it then stands. */
async function rested(stage: Stage, timing: Timing): Promise<GoalView> {
  const until = timing.now() + timing.batchMs
  for (;;) {
    const view = await stage.goal()
    const out = view?.gap.some(row => row.value === 'gathering') ?? true
    if (view !== null && view.state.status !== 'active' && !out) return view
    if (timing.now() >= until) throw new Error('the batch did not come back in time')
    await timing.wait(timing.pollMs)
  }
}

function readingsOf(truth: Readonly<Record<string, Truth>>, view: GoalView) {
  return Object.fromEntries(
    Object.entries(truth).map(([id, is]): [string, Reading] => {
      const row = view.gap.find(entry => entry.id === id)
      return [id, { truth: is, said: row?.reader === 'examiner' ? (row.value ?? UNREAD) : UNREAD }]
    }),
  )
}

function workChange(ought: Files, is: Files): Pick<BatchResult, 'changed' | 'added'> {
  const names = Object.keys(is)
  return {
    changed: Object.keys(ought).filter(name => is[name] !== ought[name]),
    added: names.filter(name => !(name in ought)),
  }
}

type Tree = Readonly<{
  kind: string
  value?: unknown
  lexeme?: string
  items?: Tree[]
  entries?: { key: string; value: Tree }[]
}>
function plain(tree: Tree): unknown {
  if (tree.kind === 'object')
    return Object.fromEntries((tree.entries ?? []).map(entry => [entry.key, plain(entry.value)]))
  if (tree.kind === 'array') return (tree.items ?? []).map(plain)
  if (tree.kind === 'number') return Number(tree.lexeme)
  return tree.kind === 'null' ? null : tree.value
}

type Block = Readonly<{
  kind: string
  callId?: string
  name?: string
  arguments?: Tree
  text?: string
}>
const blocksOf = (entry: Entry): readonly Block[] =>
  (entry.payload as { message?: { blocks?: Block[] } }).message?.blocks ?? []

export type Machine = Readonly<{ run: string; user: string }>
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** A text with what names this machine taken out: the directory of the run (whole, or cut short inside the directory the runs are made in), the temporary directory of the system, and the name of the user. */
export function scrubbed(text: string, { run, user }: Machine): string {
  if (run === '') return text
  const root = literal(run.slice(0, run.lastIndexOf('/')))
  const named = user === '' ? text : text.replaceAll(user, '<user>')
  return named
    .replaceAll(`/private${run}`, '<run>')
    .replaceAll(run, '<run>')
    .replace(new RegExp(`(?:/private)?${root}/[^\\s"'\`…;]*`, 'gu'), '<run>')
    .replace(/(?:\/private)?\/var\/folders\/[^/\s"']+\/[^/\s"']+\/T/gu, '<tmp>')
    .replace(/(\/[^\s"'`…;=]{4,})…/gu, (whole, path: string) =>
      run.startsWith(path) || `/private${run}`.startsWith(path) ? '<run>…' : whole,
    )
}

/** The calls the examining session made, each with what came back, cut short and scrubbed of what names this machine. */
export function examinerCalls(
  history: readonly Entry[],
  machine: Machine,
): readonly ExaminerCall[] {
  const cut = (text: string) => scrubbed(text, machine).slice(0, KEPT)
  const results = new Map<string, string>()
  for (const entry of history.filter(found => found.kind === 'message.tool')) {
    const blocks = blocksOf(entry)
    const id = blocks.find(block => block.kind === 'tool_result')?.callId
    const text = blocks.find(block => block.kind === 'text')?.text ?? ''
    if (id !== undefined) results.set(id, text)
  }
  return history
    .filter(entry => entry.kind === 'message.assistant')
    .flatMap(blocksOf)
    .filter(block => block.kind === 'tool_call' && block.callId !== undefined)
    .map(block => ({
      id: block.callId ?? '',
      tool: block.name ?? '',
      arguments: cut(JSON.stringify(plain(block.arguments ?? { kind: 'null' }))),
      result: cut(results.get(block.callId ?? '') ?? ''),
    }))
}

/** Hands the states of one case to the examiner one after the other on a stage, and reads what the goal then holds of each criterion. */
export async function examineCase(
  stage: Stage,
  entry: ExamCase,
  product: Product,
  examiner: ExaminerKind,
  timing: Timing,
  machine: Machine = { run: '', user: '' },
): Promise<CaseResult> {
  const batches: BatchResult[] = []
  let session: string | undefined
  let before = NOTHING
  let error: string | null = null
  try {
    for (const [index, step] of entry.steps.entries()) {
      stage.script(modelScript(entry, index, examiner))
      const from = timing.now()
      if (index === 0) await stage.setGoal(draftOf(product))
      else await stage.resume((await stage.goal())?.state.generation ?? 1)
      const view = await rested(stage, timing)
      session = view.examiner ?? session
      const spent = session === undefined ? NOTHING : stage.spent(session)
      batches.push({
        step: index,
        kind: step.kind,
        readings: readingsOf(step.truth, view),
        seconds: Math.round((timing.now() - from) / 1000),
        usd: spent.usd - before.usd,
        calls: spent.calls - before.calls,
        ...workChange(step.files, stage.work()),
      })
      before = spent
      if (view.state.status === 'settled') break
    }
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure)
  }
  const calls = session === undefined ? [] : examinerCalls(await stage.history(session), machine)
  const unreached = error === null ? entry.steps.length - batches.length : 0
  return { id: entry.id, product: entry.product, examiner, batches, calls, unreached, error }
}

export const criteriaOf = (product: Product): readonly string[] =>
  product.criteria.map((_, index) => criterionId(index))
