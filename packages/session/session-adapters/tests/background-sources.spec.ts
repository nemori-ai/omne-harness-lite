import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { admitSource, createInputSourceRegistry } from '@omne-harness/session-contract'
import {
  sessionDerivedInputsKey,
  sessionInputSourcesKey,
  sessionInputSourcesPlugin,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  BACKGROUND_CALLS_COMPONENT,
  BACKGROUND_OUTCOME_SOURCE,
  BACKGROUND_STOP_SOURCE,
  createBackgroundDerivedInputs,
  createSessionCallControlPlugin,
} from '@omne-harness/session-adapters/cordis'

const SESSION = { kind: 'system', component: BACKGROUND_CALLS_COMPONENT } as const

describe('the two input sources of background calls', () => {
  it('admit Session itself, as system reminders that count against no capacity', () => {
    expect(admitSource(BACKGROUND_OUTCOME_SOURCE, SESSION, { wake: true })).toMatchObject({
      kind: 'admitted',
      source: {
        name: 'session.background-outcome',
        role: 'system_reminder',
        wakes: true,
        entry: 'trusted',
        countsTowardCapacity: false,
      },
    })
    expect(admitSource(BACKGROUND_OUTCOME_SOURCE, SESSION, { wake: false })).toMatchObject({
      source: { wakes: false },
    })
    expect(admitSource(BACKGROUND_STOP_SOURCE, SESSION, {})).toMatchObject({
      source: { name: 'session.background-stop', wakes: false },
    })
  })

  it('refuse a member and another component, and the stop takes no wake flag', () => {
    const refused = { kind: 'refused', reason: 'subject-not-accepted' }
    expect(admitSource(BACKGROUND_OUTCOME_SOURCE, { kind: 'member' }, {})).toEqual(refused)
    expect(admitSource(BACKGROUND_STOP_SOURCE, { kind: 'system', component: 'other' }, {})).toEqual(
      refused,
    )
    expect(admitSource(BACKGROUND_STOP_SOURCE, SESSION, { wake: true })).toEqual({
      kind: 'refused',
      reason: 'wake-flag-not-allowed',
    })
  })
})

describe('the admissions of the inputs Session derives from background calls', () => {
  it('answer the declaration registered now, with Session as the subject', () => {
    const registry = createInputSourceRegistry()
    const derived = createBackgroundDerivedInputs(() => registry)
    expect(derived.admission('background-outcome')).toBeNull()
    const withdraw = registry.register(BACKGROUND_OUTCOME_SOURCE)
    expect(derived.admission('background-outcome')).toEqual({
      declaration: BACKGROUND_OUTCOME_SOURCE,
      subject: SESSION,
    })
    expect(derived.admission('background-stop')).toBeNull()
    withdraw()
    expect(derived.admission('background-outcome')).toBeNull()
  })

  it('answer null while the registration point is away', () => {
    const derived = createBackgroundDerivedInputs(() => undefined)
    expect(derived.admission('background-outcome')).toBeNull()
    expect(derived.admission('background-stop')).toBeNull()
  })
})

describe('the call control plugin registers the sources and provides their admissions', () => {
  const control = () =>
    createSessionCallControlPlugin<unknown>({
      tools: () => null,
      principal: () => Promise.resolve({ ok: 'coordinator' }),
    })

  it('registers both sources while the point is there, and withdraws them when it unloads', async () => {
    const root = new Context()
    await root.plugin(sessionInputSourcesPlugin)
    const fiber = await root.plugin(control())
    const sources = root.get(sessionInputSourcesKey)!
    for (const declared of [BACKGROUND_OUTCOME_SOURCE, BACKGROUND_STOP_SOURCE])
      expect(sources.lookup(declared.name)).toEqual({ kind: 'registered', declaration: declared })
    expect(root.get(sessionDerivedInputsKey)?.admission('background-stop')).toEqual({
      declaration: BACKGROUND_STOP_SOURCE,
      subject: SESSION,
    })
    await fiber.dispose()
    expect(sources.lookup(BACKGROUND_OUTCOME_SOURCE.name)).toEqual({ kind: 'absent' })
    expect(sources.lookup(BACKGROUND_STOP_SOURCE.name)).toEqual({ kind: 'absent' })
    expect(root.get(sessionDerivedInputsKey)).toBeUndefined()
  })

  it('without the point it still provides the admissions, and they answer null', async () => {
    const root = new Context()
    await root.plugin(control())
    expect(root.get(sessionDerivedInputsKey)?.admission('background-outcome')).toBeNull()
  })

  it('registers when the point comes later, and loses the admissions when the point goes', async () => {
    const root = new Context()
    await root.plugin(control())
    const point = await root.plugin(sessionInputSourcesPlugin)
    const derived = root.get(sessionDerivedInputsKey)!
    expect(derived.admission('background-outcome')).toMatchObject({ subject: SESSION })
    await point.dispose()
    expect(derived.admission('background-outcome')).toBeNull()
  })
})
