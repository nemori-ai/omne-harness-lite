// The conformance suite of `CredentialUse`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { CredentialHandle, CredentialUse } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'
import type { ConnectionTarget, CredentialBinding, EndpointHolding } from './values.ts'

export type CredentialUseFixture<P> = Readonly<{
  port: CredentialUse<P>
  access: Access<P>
  holding: EndpointHolding
  /** A binding of the tenant of `access` on `holding`, and the secret value behind it. */
  binding: CredentialBinding
  secret: string
  target: ConnectionTarget
  /** A binding with no credential behind it. */
  missing: CredentialBinding
  /** A principal of another tenant. */
  otherTenant: Access<P>
  /** Another holding of the same tenant, which `binding` does not belong to. */
  otherHolding?: EndpointHolding
  /** A binding whose credential is refused. */
  rejected?: CredentialBinding
  /** A binding the port cannot read now. */
  unreadable?: CredentialBinding
}>

function revealsNothing(value: unknown, secret: string): void {
  const views = [JSON.stringify(value) ?? '', String(value), inspect(value, { depth: 8 })]
  for (const view of views) assert.ok(!view.includes(secret), 'an answer reveals the secret value')
}

export function describeCredentialUseConformance<P>(): readonly ConformanceCase<
  CredentialUseFixture<P>
>[] {
  return [
    conformanceCase('CU1', 'gives a handle for each purpose and releases it', async fixture => {
      const purposes = [
        { kind: 'process-env' },
        { kind: 'http-authorization', target: fixture.target },
      ] as const
      for (const purpose of purposes) {
        const answer = await fixture.port.acquire(
          fixture.access,
          fixture.holding,
          purpose,
          fixture.binding,
        )
        assert.ok('ok' in answer, `no handle for ${purpose.kind}`)
        await answer.ok.release()
      }
    }),
    conformanceCase('CU2', 'answers missing for a binding without a credential', async fixture => {
      const answer = await fixture.port.acquire(
        fixture.access,
        fixture.holding,
        { kind: 'process-env' },
        fixture.missing,
      )
      assert.deepStrictEqual(answer, { failure: 'missing' })
    }),
    conformanceCase(
      'CU3',
      'does not give the credential of one tenant to another tenant',
      async fixture => {
        const answer = await fixture.port.acquire(
          fixture.otherTenant,
          fixture.holding,
          { kind: 'process-env' },
          fixture.binding,
        )
        assert.deepStrictEqual(answer, { failure: 'missing' })
      },
    ),
    conformanceCase(
      'CU4',
      'authorizes an HTTP request and reveals no secret in the handle',
      async fixture => {
        const purpose = { kind: 'http-authorization', target: fixture.target } as const
        const answer = await fixture.port.acquire(
          fixture.access,
          fixture.holding,
          purpose,
          fixture.binding,
        )
        assert.ok('ok' in answer, 'no handle')
        revealsNothing(answer, fixture.secret)
        const headers = new Headers()
        assert.deepStrictEqual(await answer.ok.authorize(headers), { ok: true })
        assert.ok([...headers.keys()].length > 0, 'the request was not authorized')
        revealsNothing(answer, fixture.secret)
        await answer.ok.release()
      },
    ),
    conformanceCase('CU5', 'answers rejected for a refused credential', async fixture => {
      const binding = handle(fixture.rejected, 'rejected binding')
      const answer = await fixture.port.acquire(
        fixture.access,
        fixture.holding,
        { kind: 'process-env' },
        binding,
      )
      assert.deepStrictEqual(answer, { failure: 'rejected' })
    }),
    conformanceCase('CU6', 'answers unknown, not missing, when it cannot read', async fixture => {
      const binding = handle(fixture.unreadable, 'unreadable binding')
      const answer = await fixture.port.acquire(
        fixture.access,
        fixture.holding,
        { kind: 'process-env' },
        binding,
      )
      assert.deepStrictEqual(answer, { failure: 'unknown' })
    }),
    conformanceCase(
      'CU7',
      'does not give the credential of one holding to another holding',
      async fixture => {
        const holding = handle(fixture.otherHolding, 'other holding')
        const answer = await fixture.port.acquire(
          fixture.access,
          holding,
          { kind: 'process-env' },
          fixture.binding,
        )
        assert.deepStrictEqual(answer, { failure: 'missing' })
      },
    ),
  ]
}

// The secret behind each handle of the memory double, kept off the handle itself. The memory
// process landing reads it to fill the environment, as a real landing would through its store.
const secrets = new WeakMap<CredentialHandle, string>()

/** The secret behind a handle of the memory double. Not exported from `./testing`. */
export function memorySecretOf(credential: CredentialHandle): string | undefined {
  return secrets.get(credential)
}

type Entry = { holding: EndpointHolding; secret: string; rejected: boolean; unreadable: boolean }

export type MemoryCredentialUse<P> = CredentialUse<P> &
  Readonly<{
    store(credential: {
      tenant: TenantId
      holding: EndpointHolding
      binding: CredentialBinding
      secret: string
    }): void
    reject(tenant: TenantId, binding: CredentialBinding): void
    setUnreadable(tenant: TenantId, binding: CredentialBinding, unreadable: boolean): void
  }>

function memoryHandle(secret: string): CredentialHandle {
  let usable = true
  const credential: CredentialHandle = {
    async authorize(headers) {
      if (!usable) return { failure: 'rejected' }
      headers.set('authorization', `Bearer ${secret}`)
      return { ok: true }
    },
    async reportRejection() {
      usable = false
    },
    async release() {
      usable = false
    },
  }
  secrets.set(credential, secret)
  return Object.freeze(credential)
}

/** Credentials by tenant and binding, each bound to one holding. It keeps nothing durable. */
export function createMemoryCredentialUse<P>(): MemoryCredentialUse<P> {
  const entries = new Map<string, Entry>()
  const keyOf = (tenant: TenantId, binding: CredentialBinding) =>
    JSON.stringify([tenantText(tenant), binding])
  const entryOf = (tenant: TenantId, binding: CredentialBinding): Entry => {
    const entry = entries.get(keyOf(tenant, binding))
    if (entry === undefined) throw new TypeError('no credential is stored for this binding')
    return entry
  }
  return {
    async acquire(access, holding, _purpose, binding) {
      const entry = entries.get(keyOf(access.tenant, binding))
      if (entry === undefined || entry.holding !== holding) return { failure: 'missing' }
      if (entry.unreadable) return { failure: 'unknown' }
      if (entry.rejected) return { failure: 'rejected' }
      return { ok: memoryHandle(entry.secret) }
    },
    store: credential =>
      entries.set(keyOf(credential.tenant, credential.binding), {
        holding: credential.holding,
        secret: credential.secret,
        rejected: false,
        unreadable: false,
      }),
    reject: (tenant, binding) => {
      entryOf(tenant, binding).rejected = true
    },
    setUnreadable: (tenant, binding, unreadable) => {
      entryOf(tenant, binding).unreadable = unreadable
    },
  }
}
