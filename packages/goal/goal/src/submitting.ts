import { createHash } from 'node:crypto'
import {
  batchOfRequest,
  sessionOfKey,
  SubmissionSchema,
  submissionText,
  submit,
  type Goals,
  type Taken,
} from '@omne-harness/goal-contract'
import type { GoalsDependencies } from './goals.ts'
import { lastWrite } from './judging.ts'
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

type Writing = Pick<ReturnType<typeof createWriting>, 'permitted' | 'settle' | 'briefOf'>

/** What the session that examines for a goal asks of it: the brief of the batch that is out, and to hand in its readings. The goal is found by that session; no other session reaches it this way. */
export function createSubmitting(
  deps: GoalsDependencies,
  { permitted, settle, briefOf }: Writing,
): Pick<Goals, 'brief' | 'submit'> {
  const { store } = deps
  return {
    async brief(caller, { examiner }) {
      const stop = await permitted(caller, examiner, 'brief')
      if (stop !== null) return stop
      const found = await store.examinedBy(caller.tenant, examiner)
      if (found.kind === 'unavailable') return UNAVAILABLE
      const batch = found.value?.examination.batch ?? null
      if (found.value === null || batch === null) return refused({ kind: 'denied' })
      const brief = await briefOf(caller.tenant, found.value, batch)
      return brief === null ? UNAVAILABLE : done(brief)
    },

    async submit(caller, { examiner, submission }) {
      const stop = await permitted(caller, examiner, 'submit')
      if (stop !== null) return stop
      const parsed = SubmissionSchema.safeParse(submission)
      const named = parsed.success ? batchOfRequest(parsed.data.batch) : null
      if (!parsed.success || named === null)
        return refused({ kind: 'invalid', issues: [UNREADABLE] })
      const { tenant } = caller
      const found = await store.examinedBy(tenant, examiner)
      if (found.kind === 'unavailable') return UNAVAILABLE
      if (found.value === null) return refused({ kind: 'denied' })
      const { readings, batch } = parsed.data
      const session = sessionOfKey(found.value.session)
      const [real, made, running] = await Promise.all([
        ask(() =>
          deps.examining.cited(
            tenant,
            examiner,
            batch,
            readings.flatMap(r => r.refs),
          ),
        ),
        ask(() => deps.history.calls(tenant, session, found.value?.since ?? '')),
        ask(() => deps.sessions.running(tenant, session)),
      ])
      if (real.kind !== 'read' || made.kind !== 'read' || running.kind !== 'read')
        return UNAVAILABLE
      const digest = `sha256:${createHash('sha256').update(submissionText(readings)).digest('hex')}`
      const facts = {
        digest,
        real: real.value,
        written: lastWrite(made.value),
        running: running.value,
      }
      let taken: Taken['taken'] = 'stale'
      const settled = await settle(tenant, found.value.session, async current => {
        if (current === null || current.examination.examiner !== examiner)
          return refused({ kind: 'denied' })
        const step = submit(current, { ...named, readings, ...facts })
        if (step.kind === 'refused')
          return refused(
            step.reason === 'differs'
              ? { kind: 'differs' }
              : { kind: 'invalid', issues: step.issues },
          )
        taken = step.taken
        return step.kind === 'kept'
          ? { kind: 'unchanged', record: current }
          : { kind: 'next', record: step.record }
      })
      return settled.kind === 'done' ? done({ taken }) : settled
    },
  }
}
