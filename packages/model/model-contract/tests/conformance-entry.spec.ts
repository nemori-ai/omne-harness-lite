import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ConformanceHooks,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { fail } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { observedThrough, patched, type Subject } from './conformance-support.ts'

function withoutHooks(
  subject: Subject,
  ...names: (keyof ConformanceHooks<ScriptedPrincipal>)[]
): Subject {
  const kept = { ...subject.hooks }
  for (const name of names) delete kept[name]
  return { ...subject, hooks: kept }
}

/** A subject whose `at`-th call on the public face fails, in each check. */
function failingAt(at: number): Subject {
  let calls = 0
  const injected = () => {
    calls += 1
    return calls === at
  }
  const refusal = fail({
    kind: 'unavailable',
    dependency: 'sweep',
    diagnostic: 'injected',
  } as const)
  return patched(createScriptedConformanceSubject(), {
    calls: inner => ({
      admit: input => (injected() ? Promise.resolve(refusal) : inner.admit(input)),
      inspect: input => (injected() ? Promise.resolve(refusal) : inner.inspect(input)),
      dispatches: input => (injected() ? Promise.resolve(refusal) : inner.dispatches(input)),
      cancel: input => (injected() ? Promise.resolve(refusal) : inner.cancel(input)),
    }),
    consumption: inner => ({
      beginRead: input => (injected() ? Promise.resolve(refusal) : inner.beginRead(input)),
      readNext: input => (injected() ? Promise.resolve(refusal) : inner.readNext(input)),
      closeRead: input => (injected() ? Promise.resolve(refusal) : inner.closeRead(input)),
      acknowledge: input => (injected() ? Promise.resolve(refusal) : inner.acknowledge(input)),
    }),
    instances: inner => ({
      connect: input => (injected() ? Promise.resolve(refusal) : inner.connect(input)),
    }),
  })
}

async function reportOf(subject: () => Subject) {
  const report = await checkModelProviderConformance({ subject, waitMs: 300 })
  const byName = new Map(report.results.map(result => [result.obligation, result]))
  return { report, result: (name: (typeof CONFORMANCE_OBLIGATIONS)[number]) => byName.get(name) }
}

describe('the conformance entry', () => {
  it('reports the obligations that need a hook or a transport as not applicable when the subject gives none', async () => {
    const { report, result } = await reportOf(() => {
      const subject = createScriptedConformanceSubject()
      return {
        provider: subject.provider,
        principal: subject.principal,
        tenant: subject.tenant,
        otherTenant: subject.otherTenant,
      }
    })
    expect(report.ok).toBe(true)
    expect(result('admission-repeat-recognised')).toEqual({
      obligation: 'admission-repeat-recognised',
      status: 'pass',
      detail: '',
    })
    expect(result('cross-tenant-access-refused')?.status).toBe('pass')
    expect(result('quiesce-reports-pending-and-running')?.status).toBe('pass')
    expect(result('commit-unknown-keeps-operation')).toEqual({
      obligation: 'commit-unknown-keeps-operation',
      status: 'not-applicable',
      detail: 'the subject gives no failNextWrite',
    })
    expect(result('settled-call-keeps-termination')?.detail).toBe(
      'the subject gives no startRun, settleCall',
    )
    expect(result('transport-sends-only-at-start')?.detail).toBe('the subject gives no transport')
  })

  it('treats a missing hook as not applicable for the obligations that need it only', async () => {
    const { report, result } = await reportOf(() =>
      withoutHooks(createScriptedConformanceSubject(), 'revokeAccess'),
    )
    expect(report.ok).toBe(true)
    expect(result('unauthorised-cancel-denied')).toEqual({
      obligation: 'unauthorised-cancel-denied',
      status: 'not-applicable',
      detail: 'the subject gives no revokeAccess',
    })
    expect(result('cleanup-failure-keeps-acknowledgement')?.status).toBe('pass')
  })

  it('reports an error that the provider throws as a failure with its reason, and goes on', async () => {
    const { report, result } = await reportOf(() =>
      patched(createScriptedConformanceSubject(), {
        calls: calls => ({
          ...calls,
          async admit() {
            throw new Error('boom')
          },
        }),
      }),
    )
    expect(report.ok).toBe(false)
    expect(result('admission-repeat-recognised')).toEqual({
      obligation: 'admission-repeat-recognised',
      status: 'fail',
      detail: 'the subject threw Error: boom',
    })
    expect(result('cancel-does-not-claim-stop')?.status).toBe('fail')
    expect(result('transport-close-is-idempotent')?.status).toBe('pass')
  })

  it('reports a value that the provider throws and that is not an error', async () => {
    const { result } = await reportOf(() =>
      patched(createScriptedConformanceSubject(), {
        calls: calls => ({
          ...calls,
          async admit() {
            throw 'plain text'
          },
        }),
      }),
    )
    expect(result('admission-repeat-recognised')?.detail).toBe('the subject threw plain text')
  })

  it('reports a result that the provider gives as one page as not applicable for the page checks', async () => {
    const { report, result } = await reportOf(() => {
      const subject = createScriptedConformanceSubject()
      const settleCall = subject.hooks?.settleCall
      if (settleCall === undefined) throw new Error('the scripted subject has settleCall')
      return {
        ...subject,
        hooks: {
          ...subject.hooks,
          settleCall: input => settleCall({ ...input, pageSize: 10, pageTargetBytes: 1024 }),
        },
      }
    })
    expect(report.ok).toBe(true)
    for (const name of [
      'read-page-stable-for-same-after',
      'acknowledge-keeps-open-read-readable',
      'revoked-reader-gets-no-page',
    ] as const)
      expect(result(name)).toEqual({
        obligation: name,
        status: 'not-applicable',
        detail: 'the provider gave the whole result as one page',
      })
    expect(result('close-read-idempotent')?.status).toBe('pass')
  })

  // Waits for a stalled observation to reach the real 300 ms deadline.
  it(
    'fails an observation that does not arrive in the time that it was given',
    { tags: ['slow'] },
    async () => {
      const { result } = await reportOf(() =>
        patched(createScriptedConformanceSubject(), {
          instances: observedThrough(async (item, position) => {
            if (position >= 1) await new Promise<never>(() => undefined)
            return item
          }),
        }),
      )
      expect(result('observation-opens-with-snapshot')).toEqual({
        obligation: 'observation-opens-with-snapshot',
        status: 'fail',
        detail: 'an observation did not arrive within 300 ms',
      })
    },
  )

  it('builds one subject for each check and disposes each of them once', async () => {
    let built = 0
    let disposed = 0
    const report = await checkModelProviderConformance({
      subject: () => {
        built += 1
        return {
          ...createScriptedConformanceSubject(),
          dispose: async () => {
            disposed += 1
          },
        }
      },
      waitMs: 300,
    })
    expect(report.results).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
    expect([built, disposed]).toEqual([
      CONFORMANCE_OBLIGATIONS.length,
      CONFORMANCE_OBLIGATIONS.length,
    ])
  })

  it('fails only the check whose subject the factory cannot build, and goes on', async () => {
    let built = 0
    const report = await checkModelProviderConformance({
      subject: () => {
        built += 1
        if (built === 3) throw new Error('factory boom')
        return createScriptedConformanceSubject()
      },
      waitMs: 300,
    })
    expect(report.results.filter(result => result.status === 'fail')).toEqual([
      {
        obligation: CONFORMANCE_OBLIGATIONS[2],
        status: 'fail',
        detail: 'the subject factory threw Error: factory boom',
      },
    ])
    expect(report.results).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
  })

  // Waits for the stalled subject factory to reach the real 300 ms deadline.
  it(
    'fails the check whose subject the factory does not build in time, and goes on',
    { tags: ['slow'] },
    async () => {
      let built = 0
      const report = await checkModelProviderConformance({
        subject: async () => {
          built += 1
          if (built === 2) await new Promise<never>(() => undefined)
          return createScriptedConformanceSubject()
        },
        waitMs: 300,
      })
      expect(report.results.filter(result => result.status === 'fail')).toEqual([
        {
          obligation: CONFORMANCE_OBLIGATIONS[1],
          status: 'fail',
          detail: 'the subject factory did not arrive within 300 ms',
        },
      ])
    },
  )

  it('fails only the check whose subject cannot be released, and goes on', async () => {
    let disposed = 0
    const report = await checkModelProviderConformance({
      subject: () => ({
        ...createScriptedConformanceSubject(),
        dispose: async () => {
          disposed += 1
          if (disposed === 2) throw new Error('dispose boom')
        },
      }),
      waitMs: 300,
    })
    expect(report.results.filter(result => result.status === 'fail')).toEqual([
      {
        obligation: CONFORMANCE_OBLIGATIONS[1],
        status: 'fail',
        detail: 'the dispose of the subject threw Error: dispose boom',
      },
    ])
    expect(disposed).toBe(CONFORMANCE_OBLIGATIONS.length)
  })

  it('keeps both reasons when a check fails and its subject cannot be released', async () => {
    const { result } = await reportOf(() => ({
      ...patched(createScriptedConformanceSubject(), {
        calls: calls => ({
          ...calls,
          async admit() {
            throw new Error('boom')
          },
        }),
      }),
      dispose: async () => {
        throw new Error('dispose boom')
      },
    }))
    expect(result('admission-repeat-recognised')).toEqual({
      obligation: 'admission-repeat-recognised',
      status: 'fail',
      detail:
        'the subject threw Error: boom; also the dispose of the subject threw Error: dispose boom',
    })
  })

  // Waits for the stalled subject disposal to reach the real 300 ms deadline.
  it(
    'fails a check whose subject does not release in time, after it gave its verdict',
    { tags: ['slow'] },
    async () => {
      let disposed = 0
      const report = await checkModelProviderConformance({
        subject: () => ({
          ...createScriptedConformanceSubject(),
          dispose: () => {
            disposed += 1
            return disposed === 1 ? new Promise<never>(() => undefined) : Promise.resolve()
          },
        }),
        waitMs: 300,
      })
      expect(report.results.filter(result => result.status === 'fail')).toEqual([
        {
          obligation: CONFORMANCE_OBLIGATIONS[0],
          status: 'fail',
          detail: 'the dispose of the subject did not arrive within 300 ms',
        },
      ])
    },
  )

  // Waits for the stalled admit call to reach the real 300 ms deadline.
  it(
    'fails the check whose provider method never returns, and ends the suite',
    { tags: ['slow'] },
    async () => {
      let disposed = 0
      let first = true
      const report = await checkModelProviderConformance({
        subject: () => {
          return {
            ...patched(createScriptedConformanceSubject(), {
              calls: calls => ({
                ...calls,
                admit: input => {
                  const hang = first
                  first = false
                  return hang ? new Promise<never>(() => undefined) : calls.admit(input)
                },
              }),
            }),
            dispose: async () => {
              disposed += 1
            },
          }
        },
        waitMs: 300,
      })
      expect(report.results).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
      expect(report.results[0]).toEqual({
        obligation: CONFORMANCE_OBLIGATIONS[0],
        status: 'fail',
        detail: 'the answer of admit did not arrive within 300 ms',
      })
      expect(report.results.slice(1).filter(result => result.status === 'fail')).toEqual([])
      expect(disposed).toBe(CONFORMANCE_OBLIGATIONS.length)
    },
  )

  // Waits for the stalled startRun hook to reach the real 300 ms deadline.
  it(
    'fails the check whose hook never returns, and releases the subject all the same',
    { tags: ['slow'] },
    async () => {
      let disposed = 0
      let first = true
      const report = await checkModelProviderConformance({
        subject: () => {
          const subject = createScriptedConformanceSubject()
          const startRun = subject.hooks?.startRun
          if (startRun === undefined) throw new Error('the scripted subject has startRun')
          return {
            ...subject,
            hooks: {
              ...subject.hooks,
              startRun: input => {
                const hang = first
                first = false
                return hang ? new Promise<never>(() => undefined) : startRun(input)
              },
            },
            dispose: async () => {
              disposed += 1
            },
          }
        },
        waitMs: 300,
      })
      expect(report.results).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
      expect(
        report.results.filter(result => result.status === 'fail').map(result => result.detail),
      ).toEqual(['the answer of the startRun hook did not arrive within 300 ms'])
      expect(disposed).toBe(CONFORMANCE_OBLIGATIONS.length)
    },
  )

  // Waits for the stalled transport prepare call to reach the real 300 ms deadline.
  it(
    'fails the check whose transport never prepares, and goes on',
    { tags: ['slow'] },
    async () => {
      let first = true
      const report = await checkModelProviderConformance({
        subject: () => {
          const subject = createScriptedConformanceSubject()
          const given = subject.transport
          if (given === undefined) throw new Error('the scripted subject has a transport')
          return {
            ...subject,
            transport: {
              ...given,
              transport: {
                prepare: (request, supplier) => {
                  const hang = first
                  first = false
                  return hang
                    ? new Promise<never>(() => undefined)
                    : given.transport.prepare(request, supplier, { resent: [] })
                },
              },
            },
          }
        },
        waitMs: 300,
      })
      expect(
        report.results.filter(result => result.status === 'fail').map(result => result.detail),
      ).toEqual(['the answer of prepare did not arrive within 300 ms'])
    },
  )

  it('accepts a subject that is built asynchronously', async () => {
    const report = await checkModelProviderConformance({
      subject: async () => createScriptedConformanceSubject(),
      waitMs: 300,
    })
    expect(report.ok).toBe(true)
  })

  it('leaves no observation open after the checks', async () => {
    let started = 0
    let open = 0
    const { report } = await reportOf(() =>
      patched(createScriptedConformanceSubject(), {
        instances: directory => ({
          async connect(access) {
            const route = await directory.connect(access)
            if ('failure' in route || route.ok.kind !== 'live') return route
            const { handle } = route.ok
            return {
              ok: {
                kind: 'live',
                handle: {
                  instance: handle.instance,
                  observe: input =>
                    (async function* () {
                      started += 1
                      open += 1
                      try {
                        yield* handle.observe(input)
                      } finally {
                        open -= 1
                      }
                    })(),
                },
              },
            }
          },
        }),
      }),
    )
    expect(report.ok).toBe(true)
    expect(started).toBeGreaterThan(5)
    expect(open).toBe(0)
  })

  it('refuses a wait that is not a positive whole number of milliseconds', async () => {
    for (const waitMs of [0, -1, 1.5, Number.NaN])
      await expect(
        checkModelProviderConformance({ subject: createScriptedConformanceSubject, waitMs }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'RangeError',
          message: 'waitMs must be a positive integer number of milliseconds',
        }),
      )
  })

  it('says which step failed when a provider fails one of the steps that a check relies on', async () => {
    const reasons = new Set<string>()
    for (let at = 1; at <= 45; at += 1) {
      const report = await checkModelProviderConformance({
        subject: () => failingAt(at),
        waitMs: 300,
      })
      for (const found of report.results) if (found.status === 'fail') reasons.add(found.detail)
    }
    expect(reasons.size).toBeGreaterThan(25)
    expect([...reasons].filter(reason => /^\s|^$/u.test(reason))).toEqual([])
  })

  it('accepts the shortest wait that is a whole number of milliseconds', async () => {
    const report = await checkModelProviderConformance({
      subject: createScriptedConformanceSubject,
      waitMs: 1,
    })
    expect(report.results).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
  })

  it('runs the same obligations in the same order for every subject', async () => {
    const first = await reportOf(createScriptedConformanceSubject)
    const second = await reportOf(() =>
      withoutHooks(createScriptedConformanceSubject(), 'startRun'),
    )
    const names = (report: typeof first.report) => report.results.map(result => result.obligation)
    expect(names(first.report)).toEqual([...CONFORMANCE_OBLIGATIONS])
    expect(names(second.report)).toEqual([...CONFORMANCE_OBLIGATIONS])
  })
})
