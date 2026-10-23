import type { PreparedTransport } from '@omne-harness/model-contract'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { boundedSubject } from '../src/testing/conformance-bounded.ts'
import {
  DEFAULT_CAPACITY,
  DEFAULT_CONSUMER,
  DEFAULT_REQUEST,
  DEFAULT_SUPPLIER,
} from '../src/testing/conformance-defaults.ts'
import { hooked, patched, type Subject } from './conformance-support.ts'

const WAIT = 20
const hang = () => new Promise<never>(() => undefined)

/** What the call gave when it was left to hang: the message that says what the suite waited for. */
async function waitedFor(step: (...input: never[]) => unknown, owner: object): Promise<string> {
  try {
    await Reflect.apply(step, owner, [{}])
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return 'the call returned'
}

/** The subject with its prepared transport changed. */
function transported(change: (prepared: PreparedTransport) => PreparedTransport): Subject {
  const scripted = createScriptedConformanceSubject()
  const given = scripted.transport
  if (given === undefined) throw new Error('the scripted subject has a transport')
  return {
    ...scripted,
    transport: {
      ...given,
      transport: {
        async prepare(request, supplier) {
          const outcome = await given.transport.prepare(request, supplier, { resent: [] })
          return 'ok' in outcome ? succeed(change(outcome.ok)) : outcome
        },
      },
    },
  }
}

/** The prepared transport that the view of the subject gives. */
async function preparedOf(subject: Subject): Promise<PreparedTransport> {
  const view = boundedSubject(subject, WAIT)
  const outcome = await view.transport?.transport.prepare(DEFAULT_REQUEST, DEFAULT_SUPPLIER, {
    resent: [],
  })
  if (outcome === undefined || !('ok' in outcome))
    throw new Error('prepare did not give a transport')
  return outcome.ok
}

const arrivedNever = (what: string) => `${what} did not arrive within ${WAIT} ms`

describe('the view of a subject that the checks use', () => {
  it('limits every call of the provider to the wait and says which call it waited for', async () => {
    const calls = ['admit', 'inspect', 'dispatches', 'cancel'] as const
    for (const name of calls) {
      const view = boundedSubject(
        patched(createScriptedConformanceSubject(), {
          calls: scripted => Object.assign({}, scripted, { [name]: hang }),
        }),
        WAIT,
      )
      expect(await waitedFor(view.provider.runtime.calls[name], view.provider.runtime.calls)).toBe(
        arrivedNever(`the answer of ${name}`),
      )
    }
    const consumptions = ['beginRead', 'readNext', 'closeRead', 'acknowledge'] as const
    for (const name of consumptions) {
      const view = boundedSubject(
        patched(createScriptedConformanceSubject(), {
          consumption: scripted => Object.assign({}, scripted, { [name]: hang }),
        }),
        WAIT,
      )
      const { consumption } = view.provider.runtime
      expect(await waitedFor(consumption[name], consumption)).toBe(
        arrivedNever(`the answer of ${name}`),
      )
    }
  })

  it('limits the connection, the quiesce and the recovery of the provider to the wait', async () => {
    const connected = boundedSubject(
      patched(createScriptedConformanceSubject(), { instances: () => ({ connect: hang }) }),
      WAIT,
    )
    const { instances } = connected.provider.runtime
    expect(await waitedFor(instances.connect, instances)).toBe(
      arrivedNever('the answer of connect'),
    )
    const quiesced = boundedSubject(
      patched(createScriptedConformanceSubject(), { quiesce: () => hang }),
      WAIT,
    )
    expect(await waitedFor(quiesced.provider.quiesce, quiesced.provider)).toBe(
      arrivedNever('the answer of quiesce'),
    )
    const scripted = createScriptedConformanceSubject()
    const recovering = boundedSubject(
      { ...scripted, provider: { ...scripted.provider, recover: hang } },
      WAIT,
    )
    expect(await waitedFor(recovering.provider.recover, recovering.provider)).toBe(
      arrivedNever('the answer of recover'),
    )
  })

  it('limits every hook to the wait and says which hook it waited for', async () => {
    const names = [
      'startRun',
      'showFacts',
      'settleCall',
      'provideEvidence',
      'failNextWrite',
      'advanceCleanup',
      'blockCleanup',
      'withdrawInstance',
      'replaceInstance',
      'disconnectObservers',
      'revokeAccess',
      'failDirectory',
    ] as const
    for (const name of names) {
      const view = boundedSubject(
        hooked(createScriptedConformanceSubject(), hooks =>
          Object.assign({}, hooks, { [name]: hang }),
        ),
        WAIT,
      )
      const given = view.hooks
      const step = given?.[name]
      if (given === undefined || step === undefined)
        throw new Error(`the view lost the ${name} hook`)
      expect(await waitedFor(step, given)).toBe(arrivedNever(`the answer of the ${name} hook`))
    }
  })

  it('leaves out a hook that the subject does not give, and keeps the others', () => {
    const view = boundedSubject(
      hooked(createScriptedConformanceSubject(), ({ startRun }) =>
        startRun === undefined ? {} : { startRun },
      ),
      WAIT,
    )
    expect(Object.keys(view.hooks ?? {})).toEqual(['startRun'])
  })

  it('limits the steps of a transport to the wait and says which step it waited for', async () => {
    const closingPrepared = await preparedOf(
      transported(prepared => ({ ...prepared, close: hang })),
    )
    expect(await waitedFor(closingPrepared.close, closingPrepared)).toBe(
      arrivedNever('the close of the prepared transport'),
    )
    const materializing = await preparedOf(
      transported(prepared => ({ ...prepared, materialize: hang })),
    )
    expect(await waitedFor(materializing.materialize, materializing)).toBe(
      arrivedNever('the answer of materialize'),
    )
    const closing = await preparedOf(
      transported(prepared => ({
        ...prepared,
        async materialize(signal) {
          const outcome = await prepared.materialize(signal)
          return 'ok' in outcome ? succeed({ ...outcome.ok, close: hang }) : outcome
        },
      })),
    )
    const materialized = await closing.materialize(new AbortController().signal)
    if (!('ok' in materialized)) throw new Error('materialize did not give a transport')
    expect(await waitedFor(materialized.ok.close, materialized.ok)).toBe(
      arrivedNever('the close of the materialized transport'),
    )
  })

  it('limits prepare to the wait', async () => {
    const given = createScriptedConformanceSubject().transport
    if (given === undefined) throw new Error('the scripted subject has a transport')
    const view = boundedSubject(
      {
        ...createScriptedConformanceSubject(),
        transport: { ...given, transport: { prepare: hang } },
      },
      WAIT,
    )
    const transport = view.transport?.transport
    if (transport === undefined) throw new Error('the view lost the transport')
    expect(await waitedFor(transport.prepare, transport)).toBe(
      arrivedNever('the answer of prepare'),
    )
  })

  it('hands on the values that the subject gives, and invents none that it does not', () => {
    const plain = createScriptedConformanceSubject()
    const bare = boundedSubject(plain, WAIT)
    for (const key of ['request', 'consumer', 'capacity']) expect(key in bare).toBe(false)
    const given = boundedSubject(
      {
        ...plain,
        request: DEFAULT_REQUEST,
        consumer: DEFAULT_CONSUMER,
        capacity: DEFAULT_CAPACITY,
      },
      WAIT,
    )
    expect(given.request).toEqual(DEFAULT_REQUEST)
    expect(given.consumer).toEqual(DEFAULT_CONSUMER)
    expect(given.capacity).toEqual(DEFAULT_CAPACITY)
  })
})
