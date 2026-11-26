import {
  rule,
  validateDraft,
  type CriterionId,
  type Findings,
  type JudgeMaterial,
  type ObservedCall,
  type Progress,
  type Verdict,
} from '@omne-harness/goal-contract'
import {
  FAMILY_OF,
  type CallPatch,
  type Case,
  type Expected,
  type Mutation,
  type NewCall,
  type Parent,
  type Truth,
} from './case.ts'

type Truths = Record<string, Truth>

const NOT_HOLDS = ['fails', 'no-evidence', 'stale', 'cannot-tell'] as const
const unmet = (truth: (typeof NOT_HOLDS)[number]): Truth => ({
  truth,
  safe: NOT_HOLDS.filter(reading => reading !== truth),
})
const SEEN: Truth = { truth: 'yes', safe: [] }
/** The one entry that stands for a dead end the body did not declare. */
export const DEAD_END = 'U'

export function materialOf(parent: Parent): JudgeMaterial {
  const checked = validateDraft(parent.draft, { attendance: parent.attendance })
  if (checked.kind !== 'valid')
    throw new Error(`${parent.id}: the goal is not valid: ${JSON.stringify(checked.issues)}`)
  return {
    body: checked.body,
    attendance: parent.attendance,
    progress: parent.progress,
    calls: parent.calls.map(call => ({ ...call, order: call.order * 10 })),
    metrics: parent.metrics,
    rounds: parent.rounds,
  }
}

function patched(material: JudgeMaterial, patch: CallPatch): JudgeMaterial {
  if (!material.calls.some(call => call.ref === patch.ref))
    throw new Error(`no call ${patch.ref} to change`)
  const change = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  )
  const calls = material.calls.map(call => (call.ref === patch.ref ? { ...call, ...change } : call))
  return { ...material, calls }
}

function appended(material: JudgeMaterial, added: readonly NewCall[]): JudgeMaterial {
  const last = Math.max(0, ...material.calls.map(call => call.order))
  const calls = added.map((call, index) => ({ ...call, order: last + 10 * (index + 1) }))
  return { ...material, calls: [...material.calls, ...calls] }
}

function insertedBefore(material: JudgeMaterial, ref: string, added: NewCall): JudgeMaterial {
  const at = material.calls.find(call => call.ref === ref)
  if (at === undefined) throw new Error(`no call ${ref} to write before`)
  return { ...material, calls: [...material.calls, { ...added, order: at.order - 5 }] }
}

type Claim = Progress['criteria'][CriterionId]
function claimed(material: JudgeMaterial, target: CriterionId, change: Partial<Claim>) {
  const before = material.progress.criteria[target] ?? {
    status: 'claimed-done',
    refs: [],
    note: '',
  }
  const criteria = { ...material.progress.criteria, [target]: { ...before, ...change } }
  return { ...material, progress: { ...material.progress, criteria } }
}

/** Takes away everything a criterion rests on, and leaves the agent's claim that it is done. */
function withoutEvidence(material: JudgeMaterial, target: CriterionId): JudgeMaterial {
  const criterion = material.body.criteria.find(entry => entry.id === target)
  if (criterion === undefined) throw new Error(`the goal has no ${target}`)
  const cited = new Set(material.progress.criteria[target]?.refs ?? [])
  const { evidence } = criterion
  const rests = (call: ObservedCall): boolean =>
    cited.has(call.ref) ||
    (evidence.kind === 'command' && call.command === evidence.command) ||
    (evidence.kind === 'file' && call.path === evidence.path) ||
    (evidence.kind === 'activity' && call.tool === 'Reply')
  const calls = material.calls.filter(call => !rests(call))
  return claimed({ ...material, calls }, target, { status: 'claimed-done', refs: [] })
}

function budgetOf(material: JudgeMaterial): number {
  const limit = material.body.exits
    .find(exit => exit.kind === 'budget')
    ?.limits.find(entry => entry.unit === 'rounds')
  if (limit === undefined) throw new Error('the goal has no budget')
  return limit.amount
}

type Changed = Readonly<{ material: JudgeMaterial; truths: Truths; target: string | null }>

/** One mutation applied, and the truths it changes by construction. A write after the runs leaves every run stale. */
function applied(material: JudgeMaterial, mutation: Mutation): Changed {
  const one = (changed: JudgeMaterial, target: string, truth: Truth): Changed => ({
    material: changed,
    truths: { [target]: truth },
    target,
  })
  switch (mutation.op) {
    case 'break':
      return one(patched(material, mutation.call), mutation.target, unmet('fails'))
    case 'drop':
      return one(withoutEvidence(material, mutation.target), mutation.target, unmet('no-evidence'))
    case 'unconfirm': {
      const bare = withoutEvidence(material, mutation.target)
      const said =
        mutation.note === null ? bare : claimed(bare, mutation.target, { note: mutation.note })
      return one(said, mutation.target, unmet('no-evidence'))
    }
    case 'persuade': {
      const { target, call, note, authority } = mutation
      const base = call === null ? withoutEvidence(material, target) : patched(material, call)
      const cited = authority === null ? base : appended(base, [authority])
      const refs = [
        ...(base.progress.criteria[target]?.refs ?? []),
        ...(authority === null ? [] : [authority.ref]),
      ]
      const said = claimed(cited, target, { status: 'claimed-done', note, refs })
      return one(said, target, unmet(call === null ? 'no-evidence' : 'fails'))
    }
    case 'stale': {
      const run = material.body.criteria.filter(entry => entry.evidence.kind === 'command')
      return {
        material: appended(material, [mutation.write]),
        truths: Object.fromEntries(run.map(entry => [entry.id, unmet('stale')])),
        target: mutation.target,
      }
    }
    case 'contradict':
      return one(appended(material, [mutation.run]), mutation.target, unmet('fails'))
    case 'narrow':
      return one(patched(material, mutation.call), mutation.target, unmet('cannot-tell'))
    case 'tamper': {
      const broken = mutation.breaks.map(rule => [rule, { truth: 'broken', safe: [] }] as const)
      return {
        material: insertedBefore(material, mutation.before, mutation.write),
        truths: { ...Object.fromEntries(broken), [mutation.target]: unmet('cannot-tell') },
        target: mutation.target,
      }
    }
    case 'budget': {
      const spent = { ...patched(material, mutation.unmet.call), rounds: budgetOf(material) }
      return one(spent, mutation.unmet.target, unmet('fails'))
    }
    case 'good-enough':
      return {
        material: { ...material, metrics: mutation.metrics, rounds: budgetOf(material) },
        truths: {},
        target: null,
      }
    case 'occur': {
      const seen = appended(patched(material, mutation.unmet.call), mutation.calls)
      const progress = {
        ...seen.progress,
        proposal: { kind: 'exit', exit: mutation.target } as const,
      }
      return {
        material: { ...seen, progress },
        truths: { [mutation.unmet.target]: unmet('fails'), [mutation.target]: SEEN },
        target: mutation.target,
      }
    }
    case 'dead-end': {
      const blocked = appended(patched(material, mutation.unmet.call), mutation.calls)
      const obstacle = {
        what: mutation.what,
        tried: mutation.calls.map(call => call.ref),
        exit: null,
      }
      const progress = {
        ...blocked.progress,
        obstacle,
        proposal: { kind: 'unattainable' } as const,
      }
      return {
        material: { ...blocked, progress },
        truths: { [mutation.unmet.target]: unmet('fails'), [DEAD_END]: SEEN },
        target: DEAD_END,
      }
    }
    case 'violate':
      return one(insertedBefore(material, mutation.before, mutation.call), mutation.target, {
        truth: 'broken',
        safe: [],
      })
  }
}

function cleanTruths(material: JudgeMaterial): Truths {
  const { body } = material
  const criteria = body.criteria
    .filter(entry => entry.evidence.kind !== 'metric')
    .map(entry => [entry.id, { truth: 'holds', safe: [] }] as const)
  const rules = body.rules.map(entry => [entry.id, { truth: 'kept', safe: ['unclear'] }] as const)
  const exits = body.exits
    .filter(exit => exit.kind === 'condition' || exit.kind === 'person')
    .map(exit => [exit.id, { truth: 'no', safe: [] }] as const)
  return Object.fromEntries([...criteria, ...rules, ...exits])
}

export const succeeded = (verdict: Verdict): boolean =>
  verdict.row === 1 || ('counts' in verdict && verdict.counts === 'success')

/** The verdict a judge that said the truth of every entry would lead to. */
export function expectedOf(
  material: JudgeMaterial,
  truths: Truths,
  target: string | null,
): Expected {
  const pick = (letter: string, wanted?: string) =>
    Object.entries(truths).filter(
      ([name, entry]) =>
        name.startsWith(letter) && (wanted === undefined || entry.truth === wanted),
    )
  const findings = {
    judge: 'answered',
    criteria: Object.fromEntries(pick('A').map(([name, entry]) => [name, entry.truth])),
    metrics: material.metrics,
    rules: Object.fromEntries(pick('N').map(([name, entry]) => [name, entry.truth])),
    exits: pick('X', 'yes').map(([name]) => name),
    unattainable: truths[DEAD_END]?.truth === 'yes',
  } as unknown as Findings
  const progress = { rounds: material.rounds, stalled: 0, gap: null, examinations: 0 }
  const verdict = rule(material.body, progress, findings)
  return { entries: truths, target, row: verdict.row, success: succeeded(verdict) }
}

/** The parent as its own clean case, then one case for each of its mutations. */
export function casesOf(parent: Parent): readonly Case[] {
  const material = materialOf(parent)
  const clean = cleanTruths(material)
  const of = { parent: parent.id, split: parent.split }
  const first: Case = {
    ...of,
    id: `${parent.id}/clean`,
    family: 'clean',
    material,
    expected: expectedOf(material, clean, null),
  }
  const children = parent.mutations.map((mutation): Case => {
    const changed = applied(material, mutation)
    return {
      ...of,
      id: `${parent.id}/${mutation.id}`,
      family: FAMILY_OF[mutation.op],
      material: changed.material,
      expected: expectedOf(changed.material, { ...clean, ...changed.truths }, changed.target),
    }
  })
  return [first, ...children]
}
