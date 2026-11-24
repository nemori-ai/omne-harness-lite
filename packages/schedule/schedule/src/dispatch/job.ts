export type JobState = 'accepted' | 'waiting' | 'startPending' | 'running' | 'blocked' | 'concluded'
export type StopState = 'none' | 'requested' | 'pending' | 'confirmed' | 'unknown'
export type JobOutcome = 'succeeded' | 'failed' | 'cancelled'

/** The main action of a Job: where it is, whether a stop was asked, and, once concluded, how it ended. */
export type JobFacts = Readonly<{
  state: JobState
  stopState: StopState
  executionRef: string | null
  outcome: JobOutcome | null
  reason: string | null
}>

export type JobEvent =
  | Readonly<{ kind: 'predecessorsQuiet' }>
  | Readonly<{ kind: 'startIntent' }>
  | Readonly<{ kind: 'taken'; executionRef: string; running: boolean }>
  | Readonly<{ kind: 'notStarted'; recoverable: boolean; reason: string }>
  | Readonly<{ kind: 'cancel' }>
  | Readonly<{
      kind: 'ended'
      report: 'succeeded' | 'failed' | 'stopped'
      result: boolean
      reason: string
    }>
  | Readonly<{ kind: 'stopSent' }>
  | Readonly<{ kind: 'stopConfirmed' }>
  | Readonly<{ kind: 'stopUnknown' }>

/** What one event does: a new state and the outside action it asks for, nothing, or a refusal. */
export type JobStep =
  | Readonly<{ kind: 'move'; next: JobFacts; effect: 'none' | 'start' | 'stop' }>
  | Readonly<{ kind: 'same' }>
  | Readonly<{ kind: 'refuse' }>

const move = (next: JobFacts, effect: 'none' | 'start' | 'stop' = 'none'): JobStep => ({
  kind: 'move',
  next,
  effect,
})
const same: JobStep = { kind: 'same' }
const refuse: JobStep = { kind: 'refuse' }
const conclude = (job: JobFacts, outcome: JobOutcome, reason: string | null): JobStep =>
  move({ ...job, state: 'concluded', outcome, reason })

/** The outcome table: only the executor's report concludes a Job, and success needs a final result. */
function ended(job: JobFacts, event: Extract<JobEvent, { kind: 'ended' }>): JobStep {
  if (event.report === 'stopped')
    return move({
      ...job,
      state: 'concluded',
      outcome: 'cancelled',
      stopState: 'confirmed',
      reason: event.reason,
    })
  if (event.report === 'failed') return conclude(job, 'failed', event.reason)
  return event.result
    ? conclude(job, 'succeeded', null)
    : conclude(job, 'failed', 'no-final-result')
}

function stopEvent(job: JobFacts, kind: 'stopSent' | 'stopConfirmed' | 'stopUnknown'): JobStep {
  if (job.stopState === 'none') return refuse
  const stopState =
    kind === 'stopSent' ? 'pending' : kind === 'stopConfirmed' ? 'confirmed' : 'unknown'
  return job.stopState === stopState ? same : move({ ...job, stopState })
}

/** The progression table of a Job's main action; every state answers every event. */
export function advanceJob(job: JobFacts, event: JobEvent): JobStep {
  if (event.kind === 'stopSent' || event.kind === 'stopConfirmed' || event.kind === 'stopUnknown')
    return job.state === 'concluded' ? same : stopEvent(job, event.kind)
  if (event.kind === 'predecessorsQuiet')
    return job.state === 'waiting' ? move({ ...job, state: 'accepted' }) : same
  switch (job.state) {
    case 'concluded':
      return event.kind === 'startIntent' ? refuse : same
    case 'waiting':
      if (event.kind === 'cancel') return conclude(job, 'cancelled', 'cancelled-before-start')
      return refuse
    case 'accepted':
      if (event.kind === 'startIntent')
        return job.stopState === 'none' ? move({ ...job, state: 'startPending' }, 'start') : refuse
      if (event.kind === 'cancel') return conclude(job, 'cancelled', 'cancelled-before-start')
      return refuse
    case 'blocked':
      if (event.kind === 'startIntent') return move({ ...job, state: 'startPending' }, 'start')
      if (event.kind === 'notStarted') return same
      if (event.kind === 'cancel') return conclude(job, 'cancelled', 'cancelled-before-start')
      return refuse
    case 'startPending':
      if (event.kind === 'startIntent') return same
      if (event.kind === 'cancel')
        return job.stopState === 'none' ? move({ ...job, stopState: 'requested' }) : same
      if (event.kind === 'taken') {
        const next = { ...job, executionRef: event.executionRef }
        if (event.running)
          return move(
            { ...next, state: 'running' },
            job.stopState === 'requested' ? 'stop' : 'none',
          )
        return job.executionRef === event.executionRef
          ? same
          : move(next, job.stopState === 'requested' ? 'stop' : 'none')
      }
      if (event.kind === 'notStarted') {
        if (job.stopState !== 'none') return conclude(job, 'cancelled', 'cancelled-before-start')
        return event.recoverable
          ? move({ ...job, state: 'blocked', reason: event.reason })
          : conclude(job, 'failed', event.reason)
      }
      return ended(job, event)
    case 'running':
      if (event.kind === 'cancel')
        return job.stopState === 'none' ? move({ ...job, stopState: 'requested' }, 'stop') : same
      if (event.kind === 'taken') return same
      if (event.kind === 'ended') return ended(job, event)
      return refuse
  }
}
