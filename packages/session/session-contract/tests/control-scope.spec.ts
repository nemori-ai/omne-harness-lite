import { describe, expect, it } from 'vitest'
import {
  resolveControlScope,
  type AttemptId,
  type ControlIntent,
  type ProducerRef,
  type RunId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'

const RUN = 'run-1' as RunId
const OTHER_RUN = 'run-2' as RunId
const ATTEMPT = 'attempt-1' as AttemptId
const MODEL: ProducerRef = { kind: 'model', call: 'call-model' }
const TOOL: Extract<ProducerRef, { kind: 'tool' }> = { kind: 'tool', call: 'call-tool' }
const TERMINAL = { run: RUN, outcome: 'completed' }
const OWN_WAIT = { consumption: 'consumption-own', position: '1' }
const FOREIGN_WAIT = { consumption: 'consumption-foreign', position: '2' }
const ASSOCIATED_WAIT = { consumption: 'consumption-associated', position: '3' }

function binding(producer: ProducerRef) {
  return { binding: { producer } }
}

const associated = (producer: ProducerRef) => ({ kind: 'associated', ...binding(producer) })

// The model call the Run waits on, as the snapshot holds it while it is out.
const MODEL_CALL = {
  record: { consumption: 'consumption-model', registration: associated(MODEL) },
  consumed: { id: 'consumption-model', ...binding(MODEL), results: [] },
}

function toolIntent(consumption: string, initiatingAttempt: string | null) {
  return {
    consumption,
    registration: {
      kind: 'tool-intent',
      action: 'action',
      request: evidence('request'),
      initiatingAttempt,
      purpose: 'action',
    },
  }
}

function snapshot(over: Record<string, unknown> = {}): WorkSnapshot {
  return {
    lifecycle: 'active',
    frozen: null,
    awaitingPerson: false,
    pending: [],
    run: {
      kind: 'active',
      run: RUN,
      execution: { execution: 'execution-1' },
      advance: { attempt: ATTEMPT },
    },
    executions: [],
    waiting: [
      { kind: 'producer', ...binding(MODEL) },
      { kind: 'input' },
      { kind: 'producer', ...binding({ ...MODEL }) },
    ],
    consumptions: [MODEL_CALL.consumed, binding(TOOL), binding({ ...TOOL })],
    callWaits: [OWN_WAIT, FOREIGN_WAIT, ASSOCIATED_WAIT],
    callRegistrations: [
      toolIntent(OWN_WAIT.consumption, ATTEMPT),
      toolIntent(FOREIGN_WAIT.consumption, null),
      { consumption: ASSOCIATED_WAIT.consumption, registration: associated(TOOL) },
      MODEL_CALL.record,
    ],
    controls: [],
    ...over,
  } as unknown as WorkSnapshot
}

const control = (value: unknown): ControlIntent => ({ kind: 'control', value }) as ControlIntent
const interrupt = (run: RunId): ControlIntent =>
  ({
    kind: 'interrupt',
    run,
    urgent: {},
    decision: evidence('decision'),
  }) as unknown as ControlIntent
const autoArchive: ControlIntent = { kind: 'auto-archive', idleEvidence: evidence('idle') }

const ARCHIVED = snapshot({ lifecycle: 'archived', run: { kind: 'none' } })
const RETRYABLE = snapshot({
  awaitingPerson: true,
  pending: ['input-1'],
  run: { kind: 'terminal', terminal: TERMINAL },
})
const NOTHING_TO_RESTORE = {
  kind: 'scope',
  producers: [],
  revokes: [],
  cancelsRun: null,
  cascade: [],
  scopeRelease: false,
}

function intentsOf(): readonly (readonly [string, (run: RunId) => ControlIntent])[] {
  return [
    ['cancel-run', run => control({ kind: 'cancel-run', run, urgency: 'force' })],
    ['interrupt', interrupt],
  ]
}

describe('the restore row: unarchive and retry-run touch no producer', () => {
  it('unarchive is a scope with nothing in it on an archived session', () => {
    expect(resolveControlScope(ARCHIVED, control({ kind: 'unarchive' }))).toEqual(
      NOTHING_TO_RESTORE,
    )
  })

  it('unarchive is refused on a session that is not archived', () => {
    expect(resolveControlScope(snapshot(), control({ kind: 'unarchive' }))).toEqual({
      kind: 'invalid',
      reason: 'the session is not archived',
    })
  })

  it('retry-run is a scope with nothing in it when the failed Run still holds pending input', () => {
    expect(resolveControlScope(RETRYABLE, control({ kind: 'retry-run', run: RUN }))).toEqual(
      NOTHING_TO_RESTORE,
    )
  })

  it.each([
    ['archived', ARCHIVED],
    ['frozen', snapshot({ frozen: evidence('frozen') })],
    ['not-found', snapshot()],
    [
      'nothing-pending',
      snapshot({ awaitingPerson: true, run: { kind: 'terminal', terminal: TERMINAL } }),
    ],
  ])('retry-run is refused with %s', (reason, from) => {
    expect(resolveControlScope(from, control({ kind: 'retry-run', run: RUN }))).toEqual({
      kind: 'invalid',
      reason,
    })
  })
})

describe('the archive row: every bound producer, every tool intent still waiting', () => {
  const whole = {
    kind: 'scope',
    unassociatedWaiting: [OWN_WAIT, FOREIGN_WAIT],
    producers: [MODEL, TOOL],
    revokes: ['advance', 'pending', 'delivery'],
    cancelsRun: RUN,
    cascade: [],
    scopeRelease: true,
  }

  it.each([
    ['archive', control({ kind: 'archive' })],
    ['auto-archive', autoArchive],
  ])('%s takes the whole session and cancels the active Run', (_name, intent) => {
    expect(resolveControlScope(snapshot(), intent)).toEqual(whole)
  })

  it('cancels no Run when none is active', () => {
    expect(
      resolveControlScope(snapshot({ run: { kind: 'none' } }), control({ kind: 'archive' })),
    ).toEqual({ ...whole, cancelsRun: null })
  })

  it('leaves out a wait that has no registration, and every wait when none is recorded', () => {
    const unregistered = { consumption: 'consumption-unregistered', position: '4' }
    expect(
      resolveControlScope(
        snapshot({ callWaits: [OWN_WAIT, unregistered] }),
        control({ kind: 'archive' }),
      ),
    ).toMatchObject({ unassociatedWaiting: [OWN_WAIT] })
    expect(
      resolveControlScope(snapshot({ callRegistrations: undefined }), control({ kind: 'archive' })),
    ).toMatchObject({ unassociatedWaiting: [] })
  })

  it.each([
    ['archive', control({ kind: 'archive' })],
    ['auto-archive', autoArchive],
  ])('%s is refused on an archived session', (_name, intent) => {
    expect(resolveControlScope(ARCHIVED, intent)).toEqual({
      kind: 'invalid',
      reason: 'the session is archived',
    })
  })
})

describe('the Run row: the producers the Run waits on, the tool intents its attempts started', () => {
  const ofRun = {
    kind: 'scope',
    unassociatedWaiting: [OWN_WAIT],
    producers: [MODEL],
    cascade: [],
    scopeRelease: false,
  }

  it('cancel-run revokes the advance and cancels that Run', () => {
    expect(
      resolveControlScope(snapshot(), control({ kind: 'cancel-run', run: RUN, urgency: 'force' })),
    ).toEqual({ ...ofRun, revokes: ['advance'], cancelsRun: RUN })
  })

  it('interrupt takes the same producers and waits but revokes nothing and cancels no Run', () => {
    expect(resolveControlScope(snapshot(), interrupt(RUN))).toEqual({
      ...ofRun,
      revokes: [],
      cancelsRun: null,
    })
  })

  // The Agent ends its wait with its next batch: until then the wait is there and the call is not.
  it.each(intentsOf())('%s takes no producer whose call left the snapshot', (_name, intent) => {
    const left = snapshot({
      consumptions: [],
      callRegistrations: [toolIntent(OWN_WAIT.consumption, ATTEMPT)],
    })
    expect(resolveControlScope(left, intent(RUN))).toMatchObject({ kind: 'scope', producers: [] })
  })

  it.each(intentsOf())(
    '%s takes no producer whose call is held for a batch after its final delivery',
    (_name, intent) => {
      const lent = snapshot({
        consumptions: [{ ...MODEL_CALL.consumed, delivered: evidence('delivery') }],
      })
      expect(resolveControlScope(lent, intent(RUN))).toMatchObject({ kind: 'scope', producers: [] })
    },
  )

  const intents: readonly (readonly [string, (run: RunId) => ControlIntent])[] = [
    ['cancel-run', run => control({ kind: 'cancel-run', run, urgency: 'graceful' })],
    ['interrupt', interrupt],
  ]

  it.each(intents)('%s is refused on an archived session', (_name, intent) => {
    expect(resolveControlScope(ARCHIVED, intent(RUN))).toEqual({
      kind: 'invalid',
      reason: 'the session is archived',
    })
  })

  it.each(intents)('%s is refused for a Run that is not the current one', (_name, intent) => {
    expect(resolveControlScope(snapshot(), intent(OTHER_RUN))).toEqual({
      kind: 'invalid',
      reason: 'not the current Run',
    })
  })

  it.each(intents)('%s answers the terminal of a Run that already ended', (_name, intent) => {
    expect(
      resolveControlScope(snapshot({ run: { kind: 'terminal', terminal: TERMINAL } }), intent(RUN)),
    ).toEqual({ kind: 'terminal', terminal: TERMINAL })
  })

  it.each(intents)(
    '%s answers the terminal an earlier execution of the Run recorded',
    (_name, intent) => {
      const recorded = { run: RUN, outcome: 'cancelled' }
      expect(
        resolveControlScope(
          snapshot({ executions: [{ run: RUN, terminal: recorded }] }),
          intent(RUN),
        ),
      ).toEqual({ kind: 'terminal', terminal: recorded })
    },
  )

  it.each(intents)('%s does not answer the terminal of another Run', (_name, intent) => {
    expect(
      resolveControlScope(
        snapshot({ run: { kind: 'terminal', terminal: TERMINAL } }),
        intent(OTHER_RUN),
      ),
    ).toEqual({ kind: 'invalid', reason: 'not the current Run' })
  })

  it('reads a snapshot that carries no execution records', () => {
    expect(
      resolveControlScope(
        snapshot({ executions: undefined }),
        control({ kind: 'cancel-run', run: RUN, urgency: 'force' }),
      ),
    ).toEqual({ ...ofRun, revokes: ['advance'], cancelsRun: RUN })
  })

  it('leaves out a tool intent that an attempt of another Run started', () => {
    const old = { consumption: 'consumption-old', position: '5' }
    const from = snapshot({
      callWaits: [OWN_WAIT, old],
      callRegistrations: [
        toolIntent(OWN_WAIT.consumption, ATTEMPT),
        toolIntent(old.consumption, 'attempt-old'),
      ],
      executions: [{ run: OTHER_RUN, execution: { execution: 'execution-old' }, terminal: null }],
      historyIndex: {
        attempts: [
          {
            attempt: 'attempt-old',
            run: OTHER_RUN,
            execution: 'execution-old',
            ordinal: '1',
            started: evidence('attempt-old-started'),
          },
        ],
      },
    })
    expect(
      resolveControlScope(from, control({ kind: 'cancel-run', run: RUN, urgency: 'force' })),
    ).toMatchObject({ unassociatedWaiting: [OWN_WAIT] })
  })
})

describe('the producer row: one bound producer, nothing else', () => {
  it.each([
    ['stop-call', control({ kind: 'stop-call', producer: MODEL }), MODEL],
    ['background-tool', control({ kind: 'background-tool', producer: TOOL }), TOOL],
  ])('%s takes exactly the named producer', (_name, intent, producer) => {
    expect(resolveControlScope(snapshot(), intent)).toEqual({
      kind: 'scope',
      unassociatedWaiting: [],
      producers: [producer],
      revokes: [],
      cancelsRun: null,
      cascade: [],
      scopeRelease: false,
    })
  })

  it('is refused for a producer the session has not bound', () => {
    expect(
      resolveControlScope(
        snapshot(),
        control({ kind: 'stop-call', producer: { kind: 'model', call: 'unbound' } }),
      ),
    ).toEqual({ kind: 'invalid', reason: 'the producer is not bound' })
  })

  it('is refused on an archived session before the producer is looked up', () => {
    expect(resolveControlScope(ARCHIVED, control({ kind: 'stop-call', producer: MODEL }))).toEqual({
      kind: 'invalid',
      reason: 'the session is archived',
    })
  })
})
