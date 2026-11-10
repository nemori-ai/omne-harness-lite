import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import type {
  CredentialLayerQuery,
  CredentialPort,
  CredentialReference,
} from '../src/credential.ts'
import { checkCredentialPortConformance } from '../src/conformance/credential.ts'
import {
  CREDENTIAL_CONFORMANCE_OBLIGATIONS,
  type CredentialConformanceSubject,
} from '../src/conformance/credential-types.ts'
import { decodeProviderName } from '../src/provider-name.ts'
import { createScriptedCredentialPort } from '../src/testing/credential.ts'

function identity(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('invalid test identity')
  return tenant(organization.value, account.value)
}

function providerName(text: string) {
  const decoded = decodeProviderName(text)
  if (!('ok' in decoded)) throw new Error('invalid test provider')
  return decoded.ok
}

const PROVIDER = providerName('suite-gateway')
const BARE = providerName('suite-local')
const ITEMS = ['apiKey', 'organization'] as const

function subject(): CredentialConformanceSubject<string> {
  return {
    ...createScriptedCredentialPort<string>({
      providers: new Map([
        [PROVIDER, { items: ITEMS, official: true }],
        [BARE, { items: [], official: true }],
      ]),
    }),
    access: access('principal-a', identity('5')),
    otherAccess: access('principal-b', identity('6')),
    provider: PROVIDER,
    bareProvider: BARE,
    items: ITEMS,
    secrets: ['synthetic-key-value', 'synthetic-organization-value'],
    rotatedSecret: 'synthetic-rotated-value',
  }
}

type Subject = CredentialConformanceSubject<string>

class PrivateCredentialPort {
  #port: CredentialPort<string>

  constructor(port: CredentialPort<string>) {
    this.#port = port
  }

  layerOf(query: CredentialLayerQuery<string>) {
    return this.#port.layerOf(query)
  }

  resolve(reference: CredentialReference<string>) {
    return this.#port.resolve(reference)
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

  it('preserves the original receiver for private-field class methods', async () => {
    const report = await checkCredentialPortConformance({
      subject() {
        const input = subject()
        return { ...input, port: new PrivateCredentialPort(input.port) }
      },
    })
    expect(report.ok).toBe(true)
  })

  it('detects a provider that fills a partial tenant layer from the official one', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          layerOf(query) {
            const selected = input.port.layerOf(query)
            return 'failure' in selected && selected.failure.kind === 'incomplete'
              ? succeed({ layer: 'official' })
              : selected
          },
        },
      })),
    ).toContain('layers-never-mixed')
  })

  it('detects a provider that falls back to the official layer after the tenant layer was fixed', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolve(reference) {
            const resolved = input.port.resolve(reference)
            return 'failure' in resolved && resolved.failure.kind === 'missing'
              ? input.port.resolve({ ...reference, layer: { layer: 'official' } })
              : resolved
          },
        },
      })),
    ).toContain('fixed-layer-no-fallback')
  })

  it('detects a provider that serves the official layer to a tenant profile', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          layerOf: query => input.port.layerOf({ ...query, official: true }),
        },
      })),
    ).toContain('official-layer-official-profile-only')
  })

  it('detects a provider that ignores the tenant', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolve: reference => input.port.resolve({ ...reference, access: input.otherAccess }),
        },
      })),
    ).toContain('foreign-tenant-isolated')
  })

  it('detects a provider that hides source unavailability as absence', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolve(reference) {
            const resolved = input.port.resolve(reference)
            return 'failure' in resolved && resolved.failure.kind === 'unavailable'
              ? fail({ kind: 'missing' })
              : resolved
          },
        },
      })),
    ).toContain('unavailable-source-preserved')
  })

  it('detects a provider that ignores the purpose', async () => {
    expect(
      await failures(input => ({
        ...input,
        port: {
          ...input.port,
          resolve: reference => input.port.resolve({ ...reference, purpose: 'model-send' }),
        },
      })),
    ).toContain('purpose-denied')
  })

  it('never puts a secret into the report', async () => {
    const report = await checkCredentialPortConformance({
      subject: () => ({
        ...subject(),
        port: { ...subject().port, resolve: () => fail({ kind: 'denied' }) },
      }),
    })
    expect(JSON.stringify(report)).not.toMatch(/synthetic-/u)
  })

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
        expect(factories).toHaveLength(CREDENTIAL_CONFORMANCE_OBLIGATIONS.length)
        for (const factory of factories) {
          factory.resolve({
            ...subject(),
            dispose() {
              disposed += 1
              if (disposal === 'throw') throw new Error('synthetic-disposal-error')
              if (disposal === 'reject')
                return Promise.reject(new Error('synthetic-disposal-error'))
              if (disposal === 'pending') return new Promise<void>(() => {})
            },
          })
        }
        await vi.runAllTimersAsync()
        expect(disposed).toBe(CREDENTIAL_CONFORMANCE_OBLIGATIONS.length)
        expect(report.ok).toBe(false)
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
      for (const factory of factories) factory.reject(new Error('synthetic-factory-error'))
      await vi.runAllTimersAsync()
      expect(report.ok).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
