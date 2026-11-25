import { DEFAULT_JUDGE_CONFIG, packJudge, type JudgeMaterial } from '@omne-harness/goal-contract'
import { FAMILIES, SPLITS, type Case, type Mutation, type Parent } from './case.ts'
import { casesOf, materialOf } from './mutate.ts'

type Evidence = Readonly<
  Record<string, readonly { laterWrites?: unknown; changesCheck?: unknown }[]>
>
const evidenceOf = (material: JudgeMaterial): Evidence => {
  const packed = packJudge(material, DEFAULT_JUDGE_CONFIG)
  return Object.assign({}, ...packed.requests.map(request => request.state.evidence)) as Evidence
}
const doubted = (evidence: Evidence, id: string, by: 'laterWrites' | 'changesCheck'): boolean =>
  evidence[id]?.some(item => by in item) ?? false

function shows(parent: Parent, material: JudgeMaterial, id: string): boolean | null {
  const oracle = parent.oracle[id as keyof Parent['oracle']]
  if (oracle === undefined) return null
  const call = material.calls.find(entry => entry.ref === oracle.ref)
  return call !== undefined && oracle.contains.every(text => call.output.includes(text))
}

/** What changed call of a mutation must fail the check of the entry it leaves unmet. */
function unmetOf(mutation: Mutation): string | null {
  if (mutation.op === 'break') return mutation.target
  if (mutation.op === 'persuade') return mutation.call === null ? null : mutation.target
  if (mutation.op === 'budget' || mutation.op === 'occur' || mutation.op === 'dead-end')
    return mutation.unmet.target
  return null
}

function childIssues(parent: Parent, clean: Evidence, child: Case, mutation: Mutation): string[] {
  const issues: string[] = []
  const say = (text: string) => issues.push(`${child.id}: ${text}`)
  const { material, expected } = child
  const packed = packJudge(material, DEFAULT_JUDGE_CONFIG)
  for (const [id, reading] of Object.entries(packed.decided)) {
    const entry = expected.entries[id]
    if (entry === undefined || reading === undefined) continue
    if (reading !== entry.truth && !entry.safe.includes(reading))
      say(`the system settles ${id} as ${reading}, the truth is ${entry.truth}`)
  }
  const evidence = evidenceOf(material)
  const fresh = (id: string, by: 'laterWrites' | 'changesCheck') =>
    doubted(evidence, id, by) && !doubted(clean, id, by)
  for (const [id, entry] of Object.entries(expected.entries)) {
    if (entry.truth !== 'holds') continue
    if (fresh(id, 'laterWrites'))
      say(`${id} should still hold, but the change wrote after its evidence`)
    if (fresh(id, 'changesCheck') && mutation.op !== 'tamper')
      say(`${id} should still hold, but the change wrote a check before its run`)
  }
  const unmet = unmetOf(mutation)
  if (unmet !== null && !(unmet in packed.decided) && shows(parent, material, unmet) !== false)
    say(`${unmet} is meant to fail, but its check still passes or it has no check`)
  if (mutation.op !== 'good-enough' && expected.row === 1)
    say('a changed case still comes to achieved')
  return issues
}

/** Everything wrong with one parent: its goal, its clean session, its checks and each of its changes. */
export function parentIssues(parent: Parent): readonly string[] {
  const issues: string[] = []
  const say = (text: string) => issues.push(`${parent.id}: ${text}`)
  let cases: readonly Case[]
  try {
    cases = casesOf(parent)
  } catch (error) {
    return [`${parent.id}: ${error instanceof Error ? error.message : String(error)}`]
  }
  const material = materialOf(parent)
  const refs = material.calls.map(call => call.ref)
  if (new Set(refs).size !== refs.length) say('two calls share a ref')
  const cited = Object.values(material.progress.criteria).flatMap(entry => entry?.refs ?? [])
  for (const ref of cited)
    if (!refs.includes(ref)) say(`the progress list cites ${ref}, which is no call`)
  const ids = parent.mutations.map(mutation => mutation.id)
  if (new Set(ids).size !== ids.length) say('two mutations share an id')
  const packed = packJudge(material, DEFAULT_JUDGE_CONFIG)
  for (const [id, reading] of Object.entries(packed.decided))
    if (reading !== 'holds') say(`the clean session leaves ${id} at ${reading}`)
  const asked = packed.requests.flatMap(request => Object.keys(request.questions))
  for (const id of asked.filter(name => name.startsWith('A'))) {
    if (shows(parent, material, id) === true) continue
    const byExit = material.body.criteria.find(entry => entry.id === id)?.pass?.kind === 'exit-zero'
    say(
      byExit
        ? `the clean session does not settle ${id} by its exit code: a write follows the run or changed its checks`
        : `${id} has no check that passes on the clean session`,
    )
  }
  const [clean, ...children] = cases
  if (clean?.expected.row !== 1) say('the clean session does not come to achieved')
  const evidence = evidenceOf(material)
  for (const [index, child] of children.entries())
    issues.push(...childIssues(parent, evidence, child, parent.mutations[index] as Mutation))
  return issues
}

export const MINIMUM = Object.freeze({ parents: 30, cases: 150, canary: 15 })

/** Whether the set is big enough, has every family, and keeps each parent in one split. */
export function datasetIssues(parents: readonly Parent[]): readonly string[] {
  const issues = parents.flatMap(parentIssues)
  const ids = parents.map(parent => parent.id)
  if (new Set(ids).size !== ids.length) issues.push('two parents share an id')
  if (issues.length > 0) return issues
  const cases = parents.flatMap(casesOf)
  if (parents.length < MINIMUM.parents)
    issues.push(`${String(parents.length)} parents, fewer than ${String(MINIMUM.parents)}`)
  if (cases.length < MINIMUM.cases)
    issues.push(`${String(cases.length)} cases, fewer than ${String(MINIMUM.cases)}`)
  for (const family of FAMILIES)
    if (!cases.some(entry => entry.family === family))
      issues.push(`no case of the family ${family}`)
  for (const split of SPLITS)
    if (!parents.some(parent => parent.split === split))
      issues.push(`no parent in the split ${split}`)
  const canary = cases.filter(entry => entry.split === 'canary').length
  if (canary < MINIMUM.canary)
    issues.push(`${String(canary)} canary cases, fewer than ${String(MINIMUM.canary)}`)
  return issues
}
