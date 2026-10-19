import { decodeModelInstanceId } from '@omne-harness/model-contract'
import type { CallState, ModelHandle, Snapshot } from '@omne-harness/model-contract'
import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { failingObligations, failures, observedThrough, patched } from './conformance-support.ts'
import { must } from './scripted-support.ts'

const departed = must(decodeModelInstanceId('minst_cf-one'))

const mallory = { name: 'mallory' }
const unreachable = {
  kind: 'unavailable',
  dependency: 'model-directory',
  diagnostic: 'unreachable',
} as const

describe('the conformance suite on access, routes and quiesce', () => {
  it('fails a provider that lets another tenant cancel a call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          cancel: input => calls.cancel({ ...input, tenant: subject.tenant }),
        }),
      }),
    )
    expect(failing).toEqual(['cross-tenant-access-refused', 'refusal-hides-existence'])
    expect(reasons).toEqual([
      expect.stringContaining('the cancel from another tenant succeeded where it must not'),
      expect.stringContaining('cancel answers another tenant differently for a call that exists'),
    ])
  })

  it('fails a provider whose refusal shows that a call exists in another tenant', async () => {
    const { failing, reasons } = await failures(subject => {
      const known = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            const outcome = await calls.admit(input)
            if ('ok' in outcome) known.add(input.call)
            return outcome
          },
          async inspect(input) {
            return known.has(input.call) && input.tenant !== subject.tenant
              ? fail(unreachable)
              : calls.inspect(input)
          },
        }),
      })
    })
    expect(failing).toEqual(['refusal-hides-existence'])
    expect(reasons).toEqual([
      expect.stringContaining('inspect answers another tenant differently for a call that exists'),
    ])
  })

  it('fails a provider whose acknowledgement does not notice a revoked right', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          acknowledge: input => consumption.acknowledge({ ...input, principal: mallory }),
        }),
      }),
    )
    expect(failing).toEqual(['revoked-principal-gets-denied'])
    expect(reasons).toEqual([
      expect.stringContaining('the acknowledgement after the revoke failed with'),
    ])
  })

  it('fails a provider that ends the observation of a revoked principal as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item =>
          item.kind === 'ended' && item.reason === 'denied'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['revoked-principal-observation-ends-denied'])
    expect(reasons).toEqual([
      expect.stringContaining('the observation of a revoked principal ended as unavailable'),
    ])
  })

  it('fails a provider that reports a call without an instance as an unavailable directory', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: directory => ({
          async connect(input) {
            const route = await directory.connect(input)
            return 'ok' in route && route.ok.kind === 'no-live-route' ? fail(unreachable) : route
          },
        }),
      }),
    )
    expect(failing).toEqual(['withdrawn-instance-has-no-live-route'])
    expect(reasons).toEqual([
      expect.stringContaining('the connection after the instance left failed with'),
    ])
  })

  it('fails a provider that hides an unavailable directory as a call without an instance', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: directory => ({
          async connect(input) {
            const route = await directory.connect(input)
            return 'failure' in route && route.failure.kind === 'unavailable'
              ? succeed({ kind: 'no-live-route' })
              : route
          },
        }),
      }),
    )
    expect(failing).toEqual(['directory-failure-is-unavailable'])
    expect(reasons).toEqual([
      expect.stringContaining(
        'the connection while the directory is down succeeded where it must not',
      ),
    ])
  })

  it('fails a provider that ends the observation of a replaced instance as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item =>
          item.kind === 'ended' && item.reason === 'stale-instance'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['replaced-instance-ends-observation-as-stale'])
    expect(reasons).toEqual([
      expect.stringContaining('the observation of the old instance ended as unavailable'),
    ])
  })

  it('fails a provider that goes on accepting calls after the quiesce', async () => {
    const { failing, reasons } = await failures(subject => {
      // Another scripted provider stands for the one that keeps accepting calls.
      const accepting = createScriptedConformanceSubject().provider.runtime.calls
      let quiesced = false
      return patched(subject, {
        calls: calls => ({
          ...calls,
          admit: input => (quiesced ? accepting.admit(input) : calls.admit(input)),
        }),
        quiesce: quiesce => async () => {
          quiesced = true
          return quiesce()
        },
      })
    })
    expect(failing).toEqual(['quiesce-refuses-new-admissions'])
    expect(reasons).toEqual([
      expect.stringContaining('an admission after the quiesce succeeded where it must not'),
    ])
  })

  it('fails a provider whose quiesce reports no work', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: '0', running: '0' })
        },
      }),
    )
    expect(failing).toEqual(['quiesce-reports-pending-and-running'])
    expect(reasons).toEqual([expect.stringContaining('the quiesce reports')])
  })
})

describe('the conformance suite on the other ways that access, routes and quiesce can go wrong', () => {
  it('fails a provider that refuses a cancel from another tenant and applies it', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          async cancel(input) {
            if (input.tenant === subject.tenant) return calls.cancel(input)
            await calls.cancel({ ...input, tenant: subject.tenant })
            return fail({ kind: 'denied', action: 'cancel' })
          },
        }),
      }),
    )
    expect(failing).toEqual(['cross-tenant-access-refused'])
    expect(reasons[0]).toContain('the refused requests changed the call')
  })

  it('fails a provider that refuses an acknowledgement from another tenant and applies it', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          async acknowledge(input) {
            if (input.tenant === subject.tenant) return consumption.acknowledge(input)
            await consumption.acknowledge({ ...input, tenant: subject.tenant })
            return fail({ kind: 'denied', action: 'acknowledge' })
          },
        }),
      }),
    )
    expect(failing).toEqual(['cross-tenant-access-refused'])
    expect(reasons[0]).toContain('the refused requests changed the call')
  })

  it('keeps the checks of a subject that can start a run but cannot end one', async () => {
    const report = await checkModelProviderConformance({
      subject: () => {
        const subject = createScriptedConformanceSubject()
        const { settleCall: _settle, ...hooks } = subject.hooks ?? {}
        return { ...subject, hooks }
      },
      waitMs: 300,
    })
    expect(report.results.find(r => r.obligation === 'cross-tenant-access-refused')?.status).toBe(
      'pass',
    )
  })

  it('keeps the checks of a subject that can end a call but cannot start a run', async () => {
    const report = await checkModelProviderConformance({
      subject: () => {
        const subject = createScriptedConformanceSubject()
        const { startRun: _start, ...hooks } = subject.hooks ?? {}
        return { ...subject, hooks }
      },
      waitMs: 300,
    })
    expect(report.results.find(r => r.obligation === 'cross-tenant-access-refused')?.status).toBe(
      'pass',
    )
    expect(
      report.results.find(r => r.obligation === 'quiesce-reports-pending-and-running')?.status,
    ).toBe('pass')
  })

  it('names the new observation that gave a snapshot where it had to end', async () => {
    const { failing, reasons } = await failures(subject => {
      let last: Snapshot | undefined
      return patched(subject, {
        instances: observedThrough((item, position) => {
          if (item.kind !== 'ended') {
            last = item.value
            return item
          }
          return position === 0 && last !== undefined ? { kind: 'snapshot', value: last } : item
        }),
      })
    })
    expect(failing).toEqual([
      'revoked-principal-observation-ends-denied',
      'replaced-instance-ends-observation-as-stale',
    ])
    expect(reasons).toEqual([
      expect.stringMatching(/^the new observation of a revoked principal did not end: /u),
      expect.stringMatching(/^the new observation on the old handle did not end: /u),
    ])
  })

  it('fails a provider that lets another tenant read a call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          beginRead: input => consumption.beginRead({ ...input, tenant: subject.tenant }),
        }),
      }),
    )
    expect(failing).toEqual(['cross-tenant-access-refused', 'refusal-hides-existence'])
    expect(reasons[0]).toMatch(/^the read from another tenant succeeded where it must not: /u)
  })

  it('fails a provider that lets another tenant acknowledge a call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        consumption: consumption => ({
          ...consumption,
          acknowledge: input => consumption.acknowledge({ ...input, tenant: subject.tenant }),
        }),
      }),
    )
    expect(failing).toEqual(['cross-tenant-access-refused', 'refusal-hides-existence'])
    expect(reasons[0]).toMatch(
      /^the acknowledgement from another tenant succeeded where it must not: /u,
    )
  })

  it('says that the quiesce failed when it does', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: () => async () =>
          fail({ kind: 'unavailable', dependency: 'host', diagnostic: 'gone' }),
      }),
    )
    expect(failing).toEqual([
      'quiesce-refuses-new-admissions',
      'quiesce-reports-pending-and-running',
    ])
    expect(reasons).toEqual([
      'the quiesce failed with {"kind":"unavailable","dependency":"host","diagnostic":"gone"}',
      'the quiesce failed with {"kind":"unavailable","dependency":"host","diagnostic":"gone"}',
    ])
  })

  it('fails a provider that ends the observation in flight of a revoked principal as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position > 0 && item.kind === 'ended' && item.reason === 'denied'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['revoked-principal-observation-ends-denied'])
    expect(reasons[0]).toBe('the observation of a revoked principal ended as unavailable')
  })

  it('fails a provider that ends the observation in flight of an old instance as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position > 0 && item.kind === 'ended' && item.reason === 'stale-instance'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['replaced-instance-ends-observation-as-stale'])
    expect(reasons[0]).toBe('the observation of the old instance ended as unavailable')
  })

  it('fails a provider whose revoke ends the call', async () => {
    const { failing, reasons } = await failures(subject => {
      const { hooks } = subject
      const revoke = hooks?.revokeAccess
      const settle = hooks?.settleCall
      if (revoke === undefined || settle === undefined)
        throw new Error('the scripted subject has revokeAccess and settleCall')
      return {
        ...subject,
        hooks: {
          ...hooks,
          revokeAccess: async input => {
            await revoke(input)
            await settle({
              tenant: input.tenant,
              call: input.call,
              termination: { kind: 'completed', reason: 'stop' },
              parts: [].map(block => ({ kind: 'sealed' as const, block, trims: [] })),
              pageSize: 1,
              pageTargetBytes: 1024,
            })
          },
        },
      }
    })
    expect(failing).toEqual(['revoked-principal-observation-ends-denied'])
    expect(reasons[0]).toContain('the revoke ended the call')
  })

  it('fails a provider that connects a call without an instance to a live route', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: directory => {
          let known: ModelHandle<ScriptedPrincipal> | undefined
          return {
            async connect(access) {
              const route = await directory.connect(access)
              if ('ok' in route && route.ok.kind === 'live') known = route.ok.handle
              return 'ok' in route && route.ok.kind === 'no-live-route' && known !== undefined
                ? succeed({ kind: 'live', handle: known })
                : route
            },
          }
        },
      }),
    )
    expect(failing).toEqual(['withdrawn-instance-has-no-live-route'])
    expect(reasons[0]).toContain('a call without an instance connects as')
  })

  it('fails a provider whose quiesce reports one running call for two that are not ended', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: '0', running: '1' })
        },
      }),
    )
    expect(failing).toEqual(['quiesce-reports-pending-and-running'])
    expect(reasons[0]).toContain('for 2 calls that are not ended')
  })

  it('fails a provider that ends a new observation of a revoked principal as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position === 0 && item.kind === 'ended' && item.reason === 'denied'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['revoked-principal-observation-ends-denied'])
    expect(reasons[0]).toBe('the new observation of a revoked principal ended as unavailable')
  })

  it('fails a provider that ends a new observation on a stale handle as unavailable', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position === 0 && item.kind === 'ended' && item.reason === 'stale-instance'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['replaced-instance-ends-observation-as-stale'])
    expect(reasons[0]).toBe('a new observation on the old handle ended as unavailable')
  })

  it('fails a provider that connects a replaced call to the instance that left', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: directory => ({
          async connect(access) {
            const route = await directory.connect(access)
            return 'ok' in route && route.ok.kind === 'live'
              ? succeed({
                  kind: 'live',
                  handle: { ...route.ok.handle, instance: departed },
                })
              : route
          },
        }),
      }),
    )
    expect(failing).toEqual(['replaced-instance-ends-observation-as-stale'])
    expect(reasons[0]).toContain('the connection gives')
  })

  it('fails a provider that refuses an admission after the quiesce and shows a call for it', async () => {
    const { failing, reasons } = await failures(subject => {
      let quiesced = false
      let known: CallState | undefined
      const left = new Set<string>()
      return patched(subject, {
        calls: calls => ({
          ...calls,
          async admit(input) {
            if (!quiesced) {
              const outcome = await calls.admit(input)
              const seen = await calls.inspect({ ...input, admission: input.operation })
              if ('ok' in seen && seen.ok.kind === 'found') known = seen.ok.state
              return outcome
            }
            left.add(input.operation)
            return fail({ kind: 'unavailable', dependency: 'quiesce', diagnostic: 'quiescing' })
          },
          async inspect(input) {
            const outcome = await calls.inspect(input)
            if ('ok' in outcome && outcome.ok.kind === 'found') known = outcome.ok.state
            return left.has(input.admission) && known !== undefined
              ? succeed({ kind: 'found', state: known })
              : outcome
          },
        }),
        quiesce: quiesce => async () => {
          quiesced = true
          return quiesce()
        },
      })
    })
    expect(failing).toEqual(['quiesce-refuses-new-admissions'])
    expect(reasons[0]).toContain('a refused admission left a call')
  })

  it('fails a provider whose quiesce reports a count that is not a number', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: 'many', running: '1' })
        },
      }),
    )
    expect(failing).toEqual(['quiesce-reports-pending-and-running'])
    expect(reasons[0]).toBe('the quiesce reports "many" as pending calls')
  })

  it('fails a provider whose quiesce reports a running count that is not a whole number', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: '1', running: '1.5' })
        },
      }),
    )
    expect(failing).toEqual(['quiesce-reports-pending-and-running'])
    expect(reasons[0]).toBe('the quiesce reports "1.5" as running calls')
  })

  it('fails a provider whose quiesce reports work but no running call', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: '5', running: '0' })
        },
      }),
    )
    expect(failing).toEqual(['quiesce-reports-pending-and-running'])
    expect(reasons[0]).toContain('the quiesce reports no running call')
  })

  it('keeps a provider whose quiesce reports counts of several digits', async () => {
    const failing = await failingObligations(subject =>
      patched(subject, {
        quiesce: quiesce => async () => {
          await quiesce()
          return succeed({ pending: '12', running: '10' })
        },
      }),
    )
    expect(failing).toEqual([])
  })
})
