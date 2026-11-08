import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  originRef,
  type CommandFacility,
  type RetainedProcessInformation,
  type RetainedStreamTail,
} from '@omne-harness/execution-environment-contract'
import {
  commandRetentionConformance,
  createScriptedCommandFacility,
  createScriptedRetentionStore,
  runConformanceCase,
  type CommandRetentionAcquisition,
  type CommandRetentionSubject,
  type ScriptedRetentionStore,
} from '@omne-harness/execution-environment-contract/testing'

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('invalid tenant fixture')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const otherTenant = tenantOf('acc_zzzzzzzzzzzzzzzzzzzzzzzzzz')

const obligations = [
  'V-EE28.clean-exit-reports-none',
  'V-EE28.leftover-is-retained-and-listed',
  'V-EE28.list-stays-in-scope-and-tenant',
  'V-EE28.handle-stop-after-handover-is-unconfirmed',
  'V-EE28.scope-close-stops-retained',
  'V-EE28.no-ledger-stops-with-reason',
  'V-EE30.stop-confirms-a-stopped-domain',
  'V-EE30.stop-stays-in-scope-and-tenant',
  'V-EE30.repeated-stop-joins',
  'V-EE30.stop-after-end-is-confirmed',
  'V-EE30.stop-without-ended-is-unavailable',
  'V-EE30.guard-refuses-stop',
  'V-EE31.tail-keeps-the-byte-relation',
  'V-EE31.output-stays-in-scope-and-tenant',
  'V-EE31.output-after-stop-is-not-found',
  'V-EE31.guard-refuses-output',
  'V-EE31.malformed-request-is-invalid-input',
]
const after = new TextEncoder().encode('tail \u2713\r\n')

let sequence = 0
type AcquisitionShape = Readonly<{
  ledger?: boolean
  ended?: boolean
  refuse?: readonly ('stop' | 'output')[]
}>
function acquisition(
  store: ScriptedRetentionStore,
  scope: string,
  who: TenantId,
  shape: AcquisitionShape = {},
): CommandRetentionAcquisition {
  const scripted = createScriptedCommandFacility(
    request => ({
      kind: 'started',
      ...(request.args[0] === 'leftover' ? { leaves: 1 } : {}),
      ...(request.args[0] === 'writing'
        ? {
            leaves: 1,
            output: [{ stream: 'stdout' as const, data: 'before\n' }],
            afterHandover: [{ stream: 'stdout' as const, data: after }],
          }
        : {}),
    }),
    { retention: { store, scope, ...shape } },
  )
  return {
    facility: scripted.facility,
    request: () => ({
      requestId: `suite-${++sequence}`,
      access: { principal: 'suite', tenant: who },
      origin: originRef('suite-call'),
      binding: { kind: 'host_machine' },
    }),
  }
}

type Shape = 'other-scope' | 'other-tenant'
function subject(
  shape: Shape = 'other-scope',
  unbound = true,
  store = createScriptedRetentionStore(),
): CommandRetentionSubject {
  const body = (word: string) => ({
    executable: 'script',
    args: [word],
    cwd: '.',
    env: {},
    outputMode: 'separate' as const,
  })
  return {
    acquisition: acquisition(store, 'scope-a', tenant),
    elsewhere:
      shape === 'other-scope'
        ? acquisition(store, 'scope-b', tenant)
        : acquisition(store, 'scope-a', otherTenant),
    ...(unbound ? { unbound: acquisition(store, 'scope-c', tenant, { ledger: false }) } : {}),
    refusing: acquisition(store, 'scope-a', tenant, { refuse: ['stop', 'output'] }),
    withoutEnded: acquisition(store, 'scope-d', tenant, { ended: false }),
    commands: {
      clean: () => body('clean'),
      leftover: () => body('leftover'),
      writing: () => ({ body: body('writing'), after }),
    },
    async stopsIssued(process) {
      return store.stopsIssued(process)
    },
    async closeScope() {
      store.closeScope('scope-a')
    },
    async domainStopped(process) {
      return store.stopped(process)
    },
  }
}

function caseNamed(name: string, make: () => CommandRetentionSubject) {
  const test = commandRetentionConformance({ subject: make, waitMs: 500 }).find(
    test => test.name === name,
  )
  if (!test) throw new Error(`missing conformance case ${name}`)
  return test
}

for (const name of obligations) {
  for (const shape of ['other-scope', 'other-tenant'] as const) {
    it(`${name} accepts scripted retention across ${shape}`, async () => {
      expect(await runConformanceCase(caseNamed(name, () => subject(shape)))).toEqual({
        name,
        status: 'pass',
      })
    })
  }
}

it('reports a missing unbound acquisition as not applicable and still disposes the subject', async () => {
  let disposed = 0
  const test = caseNamed('V-EE28.no-ledger-stops-with-reason', () => ({
    ...subject('other-scope', false),
    async dispose() {
      disposed++
    },
  }))
  expect(await runConformanceCase(test)).toMatchObject({
    status: 'not-applicable',
    reason: expect.any(String),
  })
  expect(disposed).toBe(1)
})

it('assembles a lazy, unique case list without allocating a subject', () => {
  const cases = commandRetentionConformance({
    subject() {
      throw new Error('eager allocation')
    },
  })
  expect(cases.map(test => test.name)).toEqual(obligations)
})

it('rejects a facility that keeps no list per retention scope', async () => {
  // One scope for both acquisitions: the second list shows the first acquisition's process.
  const test = caseNamed('V-EE28.list-stays-in-scope-and-tenant', () => {
    const store = createScriptedRetentionStore()
    const shared = acquisition(store, 'scope-a', tenant)
    return { ...subject(), elsewhere: shared, acquisition: shared }
  })
  await expect(runConformanceCase(test)).rejects.toMatchObject({ name: 'AssertionError' })
})

it('rejects a facility whose scope closing stops nothing', async () => {
  const test = caseNamed('V-EE28.scope-close-stops-retained', () => ({
    ...subject(),
    async closeScope() {},
  }))
  await expect(runConformanceCase(test)).rejects.toMatchObject({ name: 'AssertionError' })
})

// Violating subjects. Each starts from the scripted subject and breaks one obligation by wrapping an
// operation of the retention extension, or by handing the suite another acquisition. The suite must
// refuse it with the message of the assertion that guards that obligation.

type Retention = NonNullable<CommandFacility<unknown>['retention']>
type OutputRequest = Parameters<NonNullable<Retention['output']>>[0]

function operations(a: CommandRetentionAcquisition) {
  const retention = a.facility.retention
  if (!retention?.stop || !retention.output) throw new Error('expected stop and output')
  return { retention, stop: retention.stop, output: retention.output }
}
/** The acquisition with some operations of its retention extension replaced. */
function rewired(
  a: CommandRetentionAcquisition,
  change: (inner: ReturnType<typeof operations>) => Partial<Retention>,
): CommandRetentionAcquisition {
  const inner = operations(a)
  return { ...a, facility: { ...a.facility, retention: { ...inner.retention, ...change(inner) } } }
}
/** The acquisition without the named operations of its retention extension. */
function without(
  a: CommandRetentionAcquisition,
  ...names: ('stop' | 'output')[]
): CommandRetentionAcquisition {
  const { stop, output, ...rest } = operations(a).retention
  const kept = {
    ...rest,
    ...(names.includes('stop') ? {} : { stop }),
    ...(names.includes('output') ? {} : { output }),
  }
  return { ...a, facility: { ...a.facility, retention: kept } }
}
const accessOf = (a: CommandRetentionAcquisition) => a.request().access
const rejected = (
  request: { requestId: string },
  reason: 'notFound' | 'notAuthorized' | 'invalidInput',
) => ({ kind: 'rejected', requestId: request.requestId, reason }) as const
const confirmed = (request: { requestId: string }) =>
  ({ kind: 'done', requestId: request.requestId, value: { status: 'confirmed' } }) as const

/** Answers each stop with its own domain stop, and counts them where the suite reads `stopsIssued`. */
function countingStops(s: CommandRetentionSubject, at: 'acquisition' | 'withoutEnded') {
  const issued = new Map<string, number>()
  const key = (ref: { id: string; generation: string }) => `${ref.id}/${ref.generation}`
  const target = s[at]
  if (!target) throw new Error(`expected ${at}`)
  const counted = rewired(target, ({ stop }) => ({
    async stop(request) {
      issued.set(key(request.process), (issued.get(key(request.process)) ?? 0) + 1)
      return stop(request)
    },
  }))
  return {
    ...s,
    [at]: counted,
    async stopsIssued(process: { id: string; generation: string }) {
      return issued.get(key(process)) ?? 0
    },
  }
}
/** The elsewhere acquisition's operation forwarded to the acquisition, as if it ignored scope and tenant. */
function crossing(s: CommandRetentionSubject, then?: 'answer-notFound') {
  const own = operations(s.acquisition)
  return rewired(s.elsewhere, () => ({
    async stop(request) {
      const answer = await own.stop({ ...request, access: accessOf(s.acquisition) })
      return then === 'answer-notFound' ? rejected(request, 'notFound') : answer
    },
    output: request => own.output({ ...request, access: accessOf(s.acquisition) }),
  }))
}
/** Matches a reference by its id alone: every generation names the scripted generation `1`. */
const byIdAlone = (a: CommandRetentionAcquisition) =>
  rewired(a, ({ stop, output }) => ({
    stop: request => stop({ ...request, process: { ...request.process, generation: '1' } }),
    output: request => output({ ...request, process: { ...request.process, generation: '1' } }),
  }))

type Violation = Readonly<{
  obligation: string
  violation: string
  subject: () => CommandRetentionSubject
  message: string
}>
const violations: readonly Violation[] = [
  {
    obligation: 'V-EE30.stop-confirms-a-stopped-domain',
    violation: 'confirms a stop without stopping the domain',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, () => ({ stop: async r => confirmed(r) })),
      }
    },
    message: 'a confirmed stop is a stopped domain',
  },
  {
    obligation: 'V-EE30.stop-confirms-a-stopped-domain',
    violation: 'still lists a process it stopped',
    subject: () => {
      const s = subject()
      const gone: RetainedProcessInformation[] = []
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ retention, stop }) => ({
          async stop(request) {
            const listed = await retention.list(request)
            if (listed.kind === 'done') gone.push(...listed.value)
            return stop(request)
          },
          async list(request) {
            const listed = await retention.list(request)
            return listed.kind === 'done'
              ? { ...listed, value: [...listed.value, ...gone] }
              : listed
          },
        })),
      }
    },
    message: 'a stopped one is not listed',
  },
  ...(['other-scope', 'other-tenant'] as const).map(shape => ({
    obligation: 'V-EE30.stop-stays-in-scope-and-tenant',
    violation: `stops a process of the acquisition from ${shape === 'other-scope' ? 'another scope' : 'another tenant'}`,
    subject: () => {
      const s = subject(shape)
      return { ...s, elsewhere: crossing(s) }
    },
    message: 'a stop does not cross the scope or tenant',
  })),
  {
    obligation: 'V-EE30.stop-stays-in-scope-and-tenant',
    violation: 'answers notAuthorized instead of notFound to a reference outside its scope',
    subject: () => {
      const s = subject()
      return {
        ...s,
        elsewhere: rewired(s.elsewhere, () => ({
          stop: async r => rejected(r, 'notAuthorized'),
        })),
      }
    },
    message: 'a stop does not cross the scope or tenant',
  },
  {
    obligation: 'V-EE30.stop-stays-in-scope-and-tenant',
    violation: 'matches a reference by its id alone',
    subject: () => {
      const s = subject()
      return { ...s, acquisition: byIdAlone(s.acquisition) }
    },
    message: 'id and generation both match',
  },
  {
    obligation: 'V-EE30.stop-stays-in-scope-and-tenant',
    violation: 'stops a process of another tenant and answers notFound',
    subject: () => {
      const s = subject('other-tenant')
      return { ...s, elsewhere: crossing(s, 'answer-notFound') }
    },
    message: 'a refused stop stops nothing',
  },
  {
    obligation: 'V-EE30.repeated-stop-joins',
    violation: 'issues a domain stop for each of two concurrent stops',
    subject: () => countingStops(subject(), 'acquisition'),
    message: 'a repeated stop joins the first',
  },
  {
    obligation: 'V-EE30.repeated-stop-joins',
    violation: 'answers notFound to a stop that arrives while the first is in progress',
    subject: () => {
      const s = subject()
      let pending = 0
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ stop }) => ({
          async stop(request) {
            if (pending > 0) return rejected(request, 'notFound')
            pending++
            try {
              return await stop(request)
            } finally {
              pending--
            }
          },
        })),
      }
    },
    message: 'each of two concurrent stops confirms',
  },
  {
    obligation: 'V-EE30.stop-after-end-is-confirmed',
    violation: 'answers notFound to a stop of a process it already stopped',
    subject: () => {
      const s = subject()
      const ended = new Set<string>()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ stop }) => ({
          async stop(request) {
            if (ended.has(request.process.id)) return rejected(request, 'notFound')
            ended.add(request.process.id)
            return stop(request)
          },
        })),
      }
    },
    message: 'a stopped process answers confirmed while its end fact is kept, never notFound',
  },
  {
    obligation: 'V-EE30.stop-after-end-is-confirmed',
    violation: 'issues a second domain stop after the end',
    subject: () => countingStops(subject(), 'acquisition'),
    message: 'no second stop is issued',
  },
  {
    obligation: 'V-EE30.stop-after-end-is-confirmed',
    violation: 'confirms a stop of an ended process for another tenant',
    subject: () => {
      const s = subject('other-tenant')
      return { ...s, elsewhere: crossing(s) }
    },
    message: 'an end fact does not cross the scope or tenant',
  },
  {
    obligation: 'V-EE30.stop-without-ended-is-unavailable',
    violation: 'confirms a stop whose end fact it cannot read',
    subject: () => {
      const store = createScriptedRetentionStore()
      return {
        ...subject('other-scope', true, store),
        withoutEnded: acquisition(store, 'scope-d', tenant),
      }
    },
    message: 'without ended the end fact cannot be read, so the qualification is unavailable',
  },
  {
    obligation: 'V-EE30.stop-without-ended-is-unavailable',
    violation: 'issues a domain stop although it cannot read the end fact',
    subject: () => countingStops(subject(), 'withoutEnded'),
    message: 'an unreadable qualification issues no stop',
  },
  {
    obligation: 'V-EE30.guard-refuses-stop',
    violation: 'stops what its guard refuses',
    subject: () => {
      const store = createScriptedRetentionStore()
      return {
        ...subject('other-scope', true, store),
        refusing: acquisition(store, 'scope-a', tenant),
      }
    },
    message: 'the guard decides the stop',
  },
  {
    obligation: 'V-EE30.guard-refuses-stop',
    violation: 'stops the domain and then answers notAuthorized',
    subject: () => {
      const s = subject()
      const own = operations(s.acquisition)
      const refusing = s.refusing
      if (!refusing) throw new Error('expected refusing')
      return {
        ...s,
        refusing: rewired(refusing, () => ({
          async stop(request) {
            await own.stop(request)
            return rejected(request, 'notAuthorized')
          },
        })),
      }
    },
    message: 'a refused stop stops nothing',
  },
  ...(['other-scope', 'other-tenant'] as const).map(shape => ({
    obligation: 'V-EE31.output-stays-in-scope-and-tenant',
    violation: `reads a process of the acquisition from ${shape === 'other-scope' ? 'another scope' : 'another tenant'}`,
    subject: () => {
      const s = subject(shape)
      return { ...s, elsewhere: crossing(s) }
    },
    message: 'output does not cross the scope or tenant',
  })),
  {
    obligation: 'V-EE31.output-stays-in-scope-and-tenant',
    violation: 'matches a reference by its id alone',
    subject: () => {
      const s = subject()
      return { ...s, acquisition: byIdAlone(s.acquisition) }
    },
    message: 'id and generation both match',
  },
  {
    obligation: 'V-EE31.output-stays-in-scope-and-tenant',
    violation: 'answers notFound to the scope that holds the process',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, () => ({ output: async r => rejected(r, 'notFound') })),
      }
    },
    message: 'the scope that holds it reads it',
  },
  {
    obligation: 'V-EE31.output-stays-in-scope-and-tenant',
    violation:
      'answers the scope that holds the process with a kind outside tail, none and unsupported',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, () => ({
          output: async r => ({
            kind: 'done',
            requestId: r.requestId,
            value: malformed({ kind: 'empty' }),
          }),
        })),
      }
    },
    message: 'the scope that holds it reads it',
  },
  {
    obligation: 'V-EE31.output-after-stop-is-not-found',
    violation: 'still answers an output after a confirmed stop',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ output }) => ({
          async output(request) {
            const answer = await output(request)
            return answer.kind === 'rejected'
              ? { kind: 'done', requestId: request.requestId, value: { kind: 'none' } }
              : answer
          },
        })),
      }
    },
    message: 'a process that left the index has no output',
  },
  {
    obligation: 'V-EE31.guard-refuses-output',
    violation: 'reads what its guard refuses',
    subject: () => {
      const store = createScriptedRetentionStore()
      return {
        ...subject('other-scope', true, store),
        refusing: acquisition(store, 'scope-a', tenant),
      }
    },
    message: 'the guard decides the read',
  },
  {
    obligation: 'V-EE31.malformed-request-is-invalid-input',
    violation: 'answers notFound to a stop without a process',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ stop }) => ({
          stop: request =>
            request.process ? stop(request) : Promise.resolve(rejected(request, 'notFound')),
        })),
      }
    },
    message: 'a stop without a process is invalidInput',
  },
  {
    obligation: 'V-EE31.malformed-request-is-invalid-input',
    violation: 'stops for a mode it does not know, as if forced',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ stop }) => ({
          stop: request =>
            stop({ ...request, mode: request.mode === 'graceful' ? 'graceful' : 'forced' }),
        })),
      }
    },
    message: 'a stop whose mode is neither graceful nor forced is invalidInput',
  },
  {
    obligation: 'V-EE31.malformed-request-is-invalid-input',
    violation: 'stops the domain on a malformed stop and then answers invalidInput',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ stop }) => ({
          async stop(request) {
            if (request.process && request.mode !== 'graceful' && request.mode !== 'forced') {
              await stop({ ...request, mode: 'forced' })
              return rejected(request, 'invalidInput')
            }
            return stop(request)
          },
        })),
      }
    },
    message: 'a malformed request stops nothing',
  },
  {
    obligation: 'V-EE31.malformed-request-is-invalid-input',
    violation: 'answers notFound to an output without a process',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ output }) => ({
          output: request =>
            request.process ? output(request) : Promise.resolve(rejected(request, 'notFound')),
        })),
      }
    },
    message: 'an output without a process is invalidInput',
  },
  ...(
    [
      [
        'rounds a fractional from down',
        Math.floor,
        'an output whose from is not a whole byte offset is invalidInput',
      ],
      [
        'reads a negative from as zero',
        (n: number) => Math.max(0, n),
        'an output whose from is negative is invalidInput',
      ],
    ] as const
  ).map(([violation, fix, message]) => ({
    obligation: 'V-EE31.malformed-request-is-invalid-input',
    violation,
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ output }) => ({
          output: (request: OutputRequest) =>
            output(
              request.from?.stdout === undefined
                ? request
                : { ...request, from: { ...request.from, stdout: fix(request.from.stdout) } },
            ),
        })),
      }
    },
    message,
  })),
]

/** Node puts the actual and expected values after the message of a failed assertion. */
const assertionMessage = (message: string) =>
  expect.stringMatching(new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\n|$)`))

/** A payload outside the operation's type, as a caller outside TypeScript can send it. */
function malformed<T>(payload: unknown): T {
  return payload as T
}

for (const { obligation, violation, subject: make, message } of violations) {
  it(`${obligation} denies a facility that ${violation}`, async () => {
    await expect(runConformanceCase(caseNamed(obligation, make))).rejects.toMatchObject({
      name: 'AssertionError',
      message: assertionMessage(message),
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** The text of `data` read from `start`, as the contract asks: cut continuation bytes are skipped. */
function textOf(data: Uint8Array, start: number): RetainedStreamTail['text'] {
  let skipped = 0
  while (skipped < 3 && skipped < data.length && ((data[skipped] ?? 0) & 0xc0) === 0x80) skipped++
  const rest = data.subarray(skipped)
  let replaced = false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(rest)
  } catch {
    replaced = true
  }
  return {
    encoding: 'utf-8',
    value: new TextDecoder().decode(rest),
    start: start + skipped,
    replaced,
  }
}
/** Each stream tail of every `tail` answer changed; `undefined` drops the stream. */
const changingTails = (
  a: CommandRetentionAcquisition,
  change: (tail: RetainedStreamTail, from: number | undefined) => RetainedStreamTail | undefined,
) =>
  rewired(a, ({ output }) => ({
    async output(request) {
      const answer = await output(request)
      if (answer.kind !== 'done' || answer.value.kind !== 'tail') return answer
      const streams = answer.value.streams.flatMap(
        tail => change(tail, request.from?.[tail.stream]) ?? [],
      )
      return { ...answer, value: { ...answer.value, streams } }
    },
  }))
const withTails = (change: Parameters<typeof changingTails>[1]) => () => {
  const s = subject()
  return { ...s, acquisition: changingTails(s.acquisition, change) }
}
const xs = (length: number) => new Uint8Array(length).fill(0x78)
/** The same tail with its first `n` saved bytes discarded, as a bounded tail does. */
function discarding(tail: RetainedStreamTail, n: number): RetainedStreamTail {
  const firstSaved = tail.savedFrom + n
  const cut = Math.max(0, Math.min(firstSaved, tail.end) - tail.start)
  const data = tail.data.subarray(cut)
  return {
    ...tail,
    discardedBytes: n,
    start: tail.start + cut,
    data,
    text: textOf(data, tail.start + cut),
  }
}

const tailObligation = 'V-EE31.tail-keeps-the-byte-relation'
const tailViolations: readonly Omit<Violation, 'obligation'>[] = [
  {
    violation: 'gives a negative discard count',
    subject: withTails(tail => ({ ...tail, discardedBytes: -1 })),
    message: 'discardedBytes is a byte offset',
  },
  {
    violation: 'counts its end apart from its data',
    subject: withTails(tail => ({ ...tail, end: tail.end + 1 })),
    message: 'start + data length = end',
  },
  {
    violation: 'still gives a byte it counts as discarded',
    subject: withTails(tail => ({ ...tail, discardedBytes: 1 })),
    message: 'nothing before the handover or discarded is given',
  },
  {
    violation: 'starts a tail without from after the first saved byte',
    subject: withTails((tail, from) => {
      if (from !== undefined) return tail
      const data = tail.data.subarray(1)
      return { ...tail, start: tail.start + 1, data, text: textOf(data, tail.start + 1) }
    }),
    message: 'the tail starts at the first saved byte',
  },
  {
    violation: 'ignores from',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ output }) => ({
          output(request) {
            const { from: _, ...withoutFrom } = request
            return output(withoutFrom)
          },
        })),
      }
    },
    message: 'the tail starts at from',
  },
  {
    violation: 'skips more than one cut character in its text',
    subject: withTails(tail => ({ ...tail, text: { ...tail.text, start: tail.start + 4 } })),
    message: 'the text skips at most one cut character',
  },
  {
    violation: 'starts its text before its data',
    subject: withTails(tail => ({ ...tail, text: { ...tail.text, start: tail.start - 1 } })),
    message: 'the text skips at most one cut character',
  },
  {
    violation: 'skips a byte that is not a continuation byte',
    subject: withTails(tail => ({
      ...tail,
      text: {
        ...tail.text,
        start: tail.start + 1,
        value: new TextDecoder().decode(tail.data.subarray(1)),
      },
    })),
    message: 'only continuation bytes are skipped',
  },
  {
    violation: 'gives a text that is not its data decoded',
    subject: withTails(tail => ({
      ...tail,
      text: { ...tail.text, value: tail.text.value.toUpperCase() },
    })),
    message: 'the text is the data decoded as UTF-8 from its start',
  },
  {
    violation: 'names another encoding',
    subject: withTails(tail => ({
      ...tail,
      text: { ...tail.text, encoding: malformed('latin1') },
    })),
    message: 'the text is UTF-8',
  },
  {
    violation: 'gives no boolean replaced',
    subject: withTails(tail => ({ ...tail, text: { ...tail.text, replaced: malformed('no') } })),
    message: 'replaced is a boolean',
  },
  {
    violation: 'saves from offset 0, as if nothing was observed before the handover',
    subject: withTails(tail => ({
      ...tail,
      savedFrom: 0,
      start: tail.start - tail.savedFrom,
      end: tail.end - tail.savedFrom,
      text: { ...tail.text, start: tail.text.start - tail.savedFrom },
    })),
    message: 'bytes observed before the handover count, but are not saved',
  },
  {
    violation: 'keeps other bytes than those written after the handover',
    subject: withTails(tail => ({
      ...tail,
      data: xs(tail.data.length),
      text: textOf(xs(tail.data.length), tail.start),
    })),
    message: 'the tail holds exactly the bytes after handover',
  },
  {
    violation: 'drops the stream on a read with from',
    subject: withTails((tail, from) => (from === undefined ? tail : undefined)),
    message: 'a read with from still gives the stream',
  },
  {
    violation: 'gives other bytes on a read with from',
    subject: withTails((tail, from) =>
      from === undefined
        ? tail
        : { ...tail, data: xs(tail.data.length), text: textOf(xs(tail.data.length), tail.start) },
    ),
    message: 'a read with from gives the same bytes from there',
  },
  {
    violation: 'gives a fractional version',
    subject: () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, ({ output }) => ({
          async output(request) {
            const answer = await output(request)
            return answer.kind === 'done' && answer.value.kind === 'tail'
              ? { ...answer, value: { ...answer.value, version: 1.5 } }
              : answer
          },
        })),
      }
    },
    message: 'the version is a whole number',
  },
  {
    violation: 'never gives the bytes written after the handover',
    subject: () => {
      const s = subject()
      let reads = 0
      return {
        ...s,
        acquisition: rewired(s.acquisition, () => ({
          async output(request) {
            // The second read happens past the case's deadline: the clock jumps instead of the test waiting.
            if (++reads === 2) vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER)
            return { kind: 'done', requestId: request.requestId, value: { kind: 'none' } }
          },
        })),
      }
    },
    message: 'the bytes written after the handover did not reach the tail',
  },
]
for (const { violation, subject: make, message } of tailViolations) {
  it(`${tailObligation} denies a facility that ${violation}`, async () => {
    await expect(runConformanceCase(caseNamed(tailObligation, make))).rejects.toMatchObject({
      name: 'AssertionError',
      message: assertionMessage(message),
    })
  })
}

it(`${tailObligation} accepts a tail that arrives after the first read`, async () => {
  const s = subject()
  let reads = 0
  const late = rewired(s.acquisition, ({ output }) => ({
    output: async request =>
      ++reads === 1
        ? { kind: 'done', requestId: request.requestId, value: { kind: 'none' } }
        : output(request),
  }))
  expect(
    await runConformanceCase(caseNamed(tailObligation, () => ({ ...s, acquisition: late }))),
  ).toEqual({
    name: tailObligation,
    status: 'pass',
  })
  expect(reads).toBeGreaterThan(2)
})

it(`${tailObligation} accepts a tail that discarded its first saved bytes`, async () => {
  expect(
    await runConformanceCase(
      caseNamed(
        tailObligation,
        withTails(tail => discarding(tail, 2)),
      ),
    ),
  ).toEqual({
    name: tailObligation,
    status: 'pass',
  })
})

/** The scripted subject whose acquisition or other acquisition lacks the named operations. */
const lacking =
  (at: 'acquisition' | 'elsewhere', ...names: ('stop' | 'output')[]) =>
  (): CommandRetentionSubject => {
    const s = subject()
    return { ...s, [at]: without(s[at], ...names) }
  }

const notApplicable: readonly (readonly [string, () => CommandRetentionSubject, string])[] = [
  [
    tailObligation,
    () => {
      const s = subject()
      const { writing: _, ...commands } = s.commands
      return { ...s, commands }
    },
    'requires a command that writes after handover',
  ],
  [
    tailObligation,
    () => {
      const s = subject()
      return {
        ...s,
        acquisition: rewired(s.acquisition, () => ({
          output: async r => ({
            kind: 'done',
            requestId: r.requestId,
            value: { kind: 'unsupported' },
          }),
        })),
      }
    },
    'the provider keeps no output for this retained process',
  ],
  ...[
    'V-EE30.stop-confirms-a-stopped-domain',
    'V-EE30.stop-stays-in-scope-and-tenant',
    'V-EE30.repeated-stop-joins',
    'V-EE30.stop-after-end-is-confirmed',
    'V-EE31.output-after-stop-is-not-found',
  ].map(
    name =>
      [
        name,
        lacking('acquisition', 'stop'),
        'requires the retention extension to provide stop',
      ] as const,
  ),
  [
    'V-EE30.stop-stays-in-scope-and-tenant',
    lacking('elsewhere', 'stop'),
    'requires the retention extension to provide stop',
  ],
  ...[
    tailObligation,
    'V-EE31.output-stays-in-scope-and-tenant',
    'V-EE31.output-after-stop-is-not-found',
  ].map(
    name =>
      [
        name,
        lacking('acquisition', 'output'),
        'requires the retention extension to provide output',
      ] as const,
  ),
  [
    'V-EE31.output-stays-in-scope-and-tenant',
    lacking('elsewhere', 'output'),
    'requires the retention extension to provide output',
  ],
  [
    'V-EE30.stop-without-ended-is-unavailable',
    () => {
      const { withoutEnded: _, ...s } = subject()
      return s
    },
    'requires an acquisition whose process ledger has no ended',
  ],
  [
    'V-EE30.stop-without-ended-is-unavailable',
    () => {
      const s = subject()
      if (!s.withoutEnded) throw new Error('expected withoutEnded')
      return { ...s, withoutEnded: without(s.withoutEnded, 'stop') }
    },
    'requires the retention extension to provide stop',
  ],
  ...(['stop', 'output'] as const).flatMap(operation => [
    [
      `V-EE3${operation === 'stop' ? '0' : '1'}.guard-refuses-${operation}`,
      () => {
        const { refusing: _, ...s } = subject()
        return s
      },
      `requires an acquisition whose guard refuses ${operation}`,
    ] as const,
    [
      `V-EE3${operation === 'stop' ? '0' : '1'}.guard-refuses-${operation}`,
      () => {
        const s = subject()
        if (!s.refusing) throw new Error('expected refusing')
        return { ...s, refusing: without(s.refusing, operation) }
      },
      `requires the retention extension to provide ${operation}`,
    ] as const,
  ]),
  [
    'V-EE31.malformed-request-is-invalid-input',
    lacking('acquisition', 'stop', 'output'),
    'requires the retention extension to provide stop or output',
  ],
]
for (const [name, make, reason] of notApplicable)
  it(`${name} is not applicable when it ${reason.replace(/^requires/, 'lacks what it requires:')}`, async () => {
    expect(await runConformanceCase(caseNamed(name, make))).toEqual({
      name,
      status: 'not-applicable',
      reason,
    })
  })

for (const [operation, kept] of [
  ['stop', 'output'],
  ['output', 'stop'],
] as const)
  it(`V-EE31.malformed-request-is-invalid-input accepts a facility whose extension has only ${kept}`, async () => {
    const name = 'V-EE31.malformed-request-is-invalid-input'
    const make = lacking('acquisition', operation)
    expect(await runConformanceCase(caseNamed(name, make))).toEqual({ name, status: 'pass' })
  })

it('V-EE30.stop-after-end-is-confirmed accepts a facility whose other acquisition cannot stop', async () => {
  const name = 'V-EE30.stop-after-end-is-confirmed'
  const make = lacking('elsewhere', 'stop')
  expect(await runConformanceCase(caseNamed(name, make))).toEqual({ name, status: 'pass' })
})
