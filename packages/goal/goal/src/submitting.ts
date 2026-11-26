import { createHash } from 'node:crypto'
import {
  batchOfRequest,
  ranOf,
  reran,
  SubmissionSchema,
  submissionText,
  submit,
  type CriterionId,
  type GoalCaller,
  type GoalChecking,
  type GoalRecord,
  type GoalRefusal,
  type Goals,
  type Outcome,
  type SubmitStep,
  type Submitted,
  type Taken,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import type { PortRead } from './ports.ts'
import { done, refused, UNAVAILABLE, type createWriting } from './writing.ts'

const UNREADABLE = {
  entry: null,
  field: 'submission',
  problem:
    'give batch, the name the brief gave, and readings: one {criterion, value, refs, note} for each criterion',
} as const
const ask = <T>(read: () => Promise<PortRead<T>>): Promise<PortRead<T>> =>
  Promise.resolve()
    .then(read)
    .catch(() => ({ kind: 'unavailable' }) as const)

type Writing = Pick<
  ReturnType<typeof createWriting>,
  'permitted' | 'settle' | 'briefOf' | 'standingOf'
>
type Refused = Exclude<Outcome<never, GoalRefusal>, { kind: 'done' }>
type Named = NonNullable<ReturnType<typeof batchOfRequest>>
type HandedIn = Named & Readonly<{ batch: string; readings: readonly Submitted[] }>
const DENIED = refused({ kind: 'denied' })
const NO_LIVE = refused({ kind: 'state', reason: 'no-live-goal' })
const UNRUN = {
  entry: null,
  field: 'results',
  problem: 'give the name of the batch and one {criterion, exit, note} for each command run again',
} as const

/** What was handed in, when it has the shape of a submission and names a batch. */
function handedIn(submission: unknown): HandedIn | null {
  const parsed = SubmissionSchema.safeParse(submission)
  const named = parsed.success ? batchOfRequest(parsed.data.batch) : null
  return parsed.success && named !== null ? { ...named, ...parsed.data } : null
}

function decided(step: SubmitStep, current: GoalRecord) {
  if (step.kind === 'kept') return { kind: 'unchanged', record: current } as const
  if (step.kind === 'next') return { kind: 'next', record: step.record } as const
  return refused(
    step.reason === 'differs' ? { kind: 'differs' } : { kind: 'invalid', issues: step.issues },
  )
}

/** What the session that examines for a goal asks of it: the brief of the batch that is out, and to hand in its readings. The goal is found by that session; no other session reaches it this way. */
export function createSubmitting(
  deps: GoalsDependencies,
  { permitted, settle, briefOf, standingOf }: Writing,
): Pick<Goals, 'brief' | 'submit' | 'examines'> & Pick<GoalChecking, 'reran'> {
  const { store } = deps

  /** What a submission is judged on besides the goal: which cited calls are of the examination, where the last write stands, whether a round is going, and the digest of what was handed in. Null: one of them cannot be read. */
  async function seenFor(tenant: string, examiner: string, found: GoalRecord, handed: HandedIn) {
    const refs = handed.readings.flatMap(reading => reading.refs)
    const [real, standing] = await Promise.all([
      ask(() => deps.examining.cited(tenant, examiner, handed.batch, refs)),
      standingOf(tenant, found),
    ])
    if (real.kind !== 'read' || standing === null) return null
    const text = submissionText(handed.readings)
    const digest = `sha256:${createHash('sha256').update(text).digest('hex')}`
    return { digest, real: real.value, ...standing }
  }

  /** The goal this session examines for, once the authority let the call through; or the answer that ends the call. */
  async function examinedFor(caller: GoalCaller, examiner: string, action: 'brief' | 'submit') {
    const stop = await permitted(caller, examiner, action)
    if (stop !== null) return stop
    const found = await store.examinedBy(caller.tenant, examiner)
    if (found.kind === 'unavailable') return UNAVAILABLE
    return found.value ?? DENIED
  }

  return {
    async reran(caller, { session, request, results }) {
      const stop = await permitted(caller, session, 'rerun')
      if (stop !== null) return stop
      const named = batchOfRequest(request)
      const ran = ranOf(results)
      if (named === null || ran === null) return refused({ kind: 'invalid', issues: [UNRUN] })
      const { tenant } = caller
      const found = await store.latest(tenant, session)
      if (found.kind === 'unavailable') return UNAVAILABLE
      if (found.value === null) return NO_LIVE
      const standing = await standingOf(tenant, found.value)
      if (standing === null) return UNAVAILABLE
      const left: CriterionId[] = []
      const settled = await settle(tenant, session, async current => {
        if (current === null) return NO_LIVE
        const step = reran(current, { ...named, results: ran, ...standing })
        if (step.kind === 'dropped') return { kind: 'unchanged', record: current }
        left.push(...step.examine)
        return { kind: 'next', record: step.record }
      })
      return settled.kind === 'done' ? done({ examine: left }) : (settled as Refused)
    },

    async examines(caller, { examiner }) {
      const found = await examinedFor(caller, examiner, 'brief')
      if ('kind' in found) return found.kind === 'refused' ? done(false) : found
      return done(found.state.status !== 'settled')
    },

    async brief(caller, { examiner }) {
      const found = await examinedFor(caller, examiner, 'brief')
      if ('kind' in found) return found
      const { batch } = found.examination
      if (batch === null) return DENIED
      const brief = await briefOf(caller.tenant, found, batch)
      return brief === null ? UNAVAILABLE : done(brief)
    },

    async submit(caller, { examiner, submission }) {
      const found = await examinedFor(caller, examiner, 'submit')
      if ('kind' in found) return found
      const handed = handedIn(submission)
      if (handed === null) return refused({ kind: 'invalid', issues: [UNREADABLE] })
      const seen = await seenFor(caller.tenant, examiner, found, handed)
      if (seen === null) return UNAVAILABLE
      const out: Taken[] = []
      const settled = await settle(caller.tenant, found.session, async current => {
        if (current?.examination.examiner !== examiner) return DENIED
        const step = submit(current, { ...handed, ...seen })
        if (step.kind !== 'refused') out.push({ taken: step.taken })
        return decided(step, current)
      })
      const taken = out.at(-1)
      return settled.kind === 'done' && taken !== undefined ? done(taken) : (settled as Refused)
    },
  }
}
