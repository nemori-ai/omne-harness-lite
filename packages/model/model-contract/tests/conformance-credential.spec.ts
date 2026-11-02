import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { describe, expect, it, vi } from 'vitest'
import type {
  CredentialPort,
  CredentialQuery,
  QualifiedCredentialQuery,
  SendFace,
} from '../src/credential.ts'
import { decodeCredentialId } from '../src/credential-values.ts'
import { checkCredentialPortConformance } from '../src/conformance/credential.ts'
import {
  CREDENTIAL_CONFORMANCE_OBLIGATIONS,
  type CredentialConformanceSubject,
} from '../src/conformance/credential-types.ts'
import { createScriptedCredentialPort } from '../src/testing/credential.ts'

function identity(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('invalid test identity')
  return tenant(organization.value, account.value)
}

function credential(text: string) {
  const decoded = decodeCredentialId(text)
  if (!('ok' in decoded)) throw new Error('invalid test credential')
  return decoded.ok
}

function subject(): CredentialConformanceSubject<string> {
  const factorySecret = 'synthetic-factory-value'
  return {
    ...createScriptedCredentialPort<string>({ factorySecret }),
    access: access('principal-a', identity('5')),
    otherAccess: access('principal-b', identity('6')),
    id: credential('suite-primary'),
    otherId: credential('suite-secondary'),
    factorySecret,
    secret: 'synthetic-tenant-value',
    rotatedSecret: 'synthetic-rotated-value',
  }
}

type Subject = CredentialConformanceSubject<string>

class PrivateCredentialPort {
  #port: CredentialPort<string>

  constructor(port: CredentialPort<string>) {
    this.#port = port
  }

  present(query: CredentialQuery) {
    return this.#port.present(query)
  }

  resolve(query: CredentialQuery, face: SendFace) {
    return this.#port.resolve(query, face)
  }

  presentFor(query: Omit<QualifiedCredentialQuery<string>, 'official'>) {
    return this.#port.presentFor?.(query) ?? { kind: 'unavailable' as const }
  }

  resolveFor(query: QualifiedCredentialQuery<string>) {
    return this.#port.resolveFor?.(query) ?? { kind: 'unavailable' as const }
  }
}

async function failures(change: (input: Subject) => Subject) {
  const report = await checkCredentialPortConformance({ subject: () => change(subject()) })
  expect(report.ok).toBe(false)
  const failed = report.results.filter(result => result.status === 'fail')
  expect(failed.length).toBeGreaterThan(0)
  return failed.map(result => result.obligation)
}

describe('credential port conformance', () => {
  it('passes every obligation with fresh scripted state and disposes every subject', async () => {
    let created = 0
    let disposed = 0
    const report = await checkCredentialPortConformance({
      subject() {
        created += 1
        return {
          ...subject(),
          dispose: () => {
            disposed += 1
          },
        }
      },
    })
    expect(report).toEqual({
      ok: true,
      results: CREDENTIAL_CONFORMANCE_OBLIGATIONS.map(obligation => ({
        obligation,
        status: 'pass',
        detail: '',
      })),
    })
    expect(created).toBe(CREDENTIAL_CONFORMANCE_OBLIGATIONS.length)
    expect(disposed).toBe(created)
  })

  it('detects a provider that ignores the tenant', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolveFor(query) {
            return (
              input.port.resolveFor?.({ ...query, access: input.access }) ?? { kind: 'unavailable' }
            )
          },
        },
      })),
    ).toContain('qualified-foreign-holder-denied')
  })

  it('detects factory fallback for an official request with another binding', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolveFor(query) {
            const result = input.port.resolveFor?.(query)
            return result?.kind === 'absent' && query.official
              ? { kind: 'value', scope: 'factory', value: input.factorySecret }
              : (result ?? { kind: 'unavailable' })
          },
        },
      })),
    ).toContain('qualified-other-binding-blocks-factory')
  })

  it('preserves the original receiver for private-field class methods', async () => {
    const report = await checkCredentialPortConformance({
      subject() {
        const input = subject()
        return { ...input, port: new PrivateCredentialPort(input.port) }
      },
    })
    expect(report.ok).toBe(true)
    expect(report.results.filter(result => result.status === 'pass')).toHaveLength(16)
  })

  it.each(['face', 'authorized', 'tenant'])(
    'detects qualified methods that read the legacy input field %s',
    async field => {
      for (const method of ['presentFor', 'resolveFor'] as const) {
        expect(
          await failures(input => ({
            ...input,
            port: {
              ...input.port,
              [method](query: QualifiedCredentialQuery<string>) {
                try {
                  Reflect.get(query, field)
                } catch {}
                return input.port[method]?.(query) ?? { kind: 'unavailable' }
              },
            },
          })),
        ).toContain('qualified-independent-of-legacy')
      }
    },
  )

  it.each(['resolve', 'throw', 'reject', 'pending'] as const)(
    'disposes all late subjects after factory timeout when disposal will %s',
    async disposal => {
      vi.useFakeTimers()
      try {
        const factories: ReturnType<typeof Promise.withResolvers<Subject>>[] = []
        let disposed = 0
        const pending = checkCredentialPortConformance({
          subject() {
            const factory = Promise.withResolvers<Subject>()
            factories.push(factory)
            return factory.promise
          },
          waitMs: 1,
        })
        await vi.runAllTimersAsync()
        const report = await pending
        expect(report.results.every(result => result.status === 'fail')).toBe(true)
        expect(factories).toHaveLength(16)
        for (const factory of factories) {
          factory.resolve({
            ...subject(),
            dispose() {
              disposed += 1
              if (disposal === 'throw') throw new Error('synthetic-disposal-error')
              if (disposal === 'reject') return Promise.reject(new Error('synthetic-disposal-error'))
              if (disposal === 'pending') return new Promise<void>(() => {})
            },
          })
        }
        await vi.runAllTimersAsync()
        expect(disposed).toBe(16)
        expect(report.ok).toBe(false)
        expect(report.results.every(result => result.status === 'fail')).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('handles factory rejection after the timed-out suite has returned', async () => {
    vi.useFakeTimers()
    try {
      const factories: ReturnType<typeof Promise.withResolvers<Subject>>[] = []
      const pending = checkCredentialPortConformance({
        subject() {
          const factory = Promise.withResolvers<Subject>()
          factories.push(factory)
          return factory.promise
        },
        waitMs: 1,
      })
      await vi.runAllTimersAsync()
      const report = await pending
      expect(factories).toHaveLength(16)
      for (const factory of factories) factory.reject(new Error('synthetic-factory-error'))
      await vi.runAllTimersAsync()
      expect(report.ok).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('detects a provider that hides source unavailability as absence', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolveFor(query) {
            const result = input.port.resolveFor?.(query)
            return result?.kind === 'unavailable'
              ? { kind: 'absent' }
              : (result ?? { kind: 'absent' })
          },
        },
      })),
    ).toContain('unavailable-source-preserved')
  })

  it('fails missing qualified methods without invoking the legacy path as a substitute', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: { present: input.port.present, resolve: input.port.resolve },
      })),
    ).toContain('qualified-methods-required')
  })

  it('fails missing controls and hanging factories without leaking subject error text', async () => {
    const missing = await checkCredentialPortConformance({
      subject() {
        const input = subject()
        Reflect.deleteProperty(input.controls, 'bind')
        return input
      },
    })
    expect(missing.ok).toBe(false)
    expect(missing.results.every(result => result.status === 'fail')).toBe(true)
    const timed = await checkCredentialPortConformance({
      subject: () => new Promise<Subject>(() => {}),
      waitMs: 1,
    })
    expect(timed.results.every(result => result.status === 'fail')).toBe(true)
    const thrown = await checkCredentialPortConformance({
      subject() {
        throw new Error('secret-value')
      },
    })
    expect(JSON.stringify(thrown)).not.toContain('secret-value')
  })

  it('fails hanging controls and disposal and disposes after a failed check', async () => {
    const controlled = await checkCredentialPortConformance({
      subject() {
        const input = subject()
        return {
          ...input,
          controls: { ...input.controls, bind: () => new Promise<void>(() => {}) },
        }
      },
      waitMs: 1,
    })
    expect(
      controlled.results.find(result => result.obligation === 'rotation-visible')?.status,
    ).toBe('fail')
    let disposed = 0
    const released = await checkCredentialPortConformance({
      subject: () => ({
        ...subject(),
        dispose: () => {
          disposed += 1
          throw new Error('secret-value')
        },
      }),
    })
    expect(disposed).toBe(CREDENTIAL_CONFORMANCE_OBLIGATIONS.length)
    expect(released.results.every(result => result.status === 'fail')).toBe(true)
    expect(JSON.stringify(released)).not.toContain('secret-value')
    const hanging = await checkCredentialPortConformance({
      subject: () => ({ ...subject(), dispose: () => new Promise<void>(() => {}) }),
      waitMs: 1,
    })
    expect(hanging.results.every(result => result.status === 'fail')).toBe(true)
  })

  it('detects stale values and a lost binding after rotation', async () => {
    expect(
      await failures(input => ({
        ...input,
        controls: { ...input.controls, rotate() {} },
      })),
    ).toContain('rotation-visible')
  })

  it('detects factory fallback for revoked or unreadable bindings', async () => {
    const failed = await failures(input => ({
      ...input,
      port: {
        ...input.port,
        resolveFor(query) {
          const result = input.port.resolveFor?.(query)
          return result?.kind === 'denied' || result?.kind === 'unreadable'
            ? { kind: 'value', scope: 'factory', value: input.factorySecret }
            : (result ?? { kind: 'unavailable' })
        },
      },
    }))
    expect(failed).toContain('revoked-binding-denied')
    expect(failed).toContain('unreadable-binding-preserved')
  })

  it('requires synchronous qualified results', async () => {
    expect(
      await failures(input => {
        const resolve = input.port.resolveFor?.bind(input.port)
        Reflect.set(
          input.port,
          'resolveFor',
          async (query: Parameters<NonNullable<Subject['port']['resolveFor']>>[0]) =>
            resolve?.(query),
        )
        return input
      }),
    ).toContain('qualified-presence-and-resolution')
  })

  it('rejects invalid wait bounds', async () => {
    for (const waitMs of [0, -1, NaN, Infinity, 1.5]) {
      await expect(checkCredentialPortConformance({ subject, waitMs })).rejects.toThrow(RangeError)
    }
  })
})
