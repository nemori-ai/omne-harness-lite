// The conformance suite of `CredentialUse`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { ConnectionTarget, CredentialBinding, EndpointHolding } from './brands.ts'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CredentialFailure,
  CredentialPurpose,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  ProcessCredentialHandle,
  ProcessPurpose,
} from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'

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

export function mcpCredentialUseConformance<P>(): readonly ConformanceCase<
  CredentialUseFixture<P>
>[] {
  return [
    conformanceCase('CU1', 'gives a handle of the asked purpose and releases it', async fixture => {
      const { access, holding, binding } = fixture
      const forProcess = await fixture.port.acquire(
        access,
        holding,
        { kind: 'process-env' },
        binding,
      )
      assert.ok('ok' in forProcess, 'no handle for process-env')
      assert.strictEqual(forProcess.ok.purpose, 'process-env')
      await forProcess.ok.release()
      const http = { kind: 'http-authorization', target: fixture.target } as const
      const forHttp = await fixture.port.acquire(access, holding, http, binding)
      assert.ok('ok' in forHttp, 'no handle for http-authorization')
      assert.strictEqual(forHttp.ok.purpose, 'http-authorization')
      await forHttp.ok.release()
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

// The secret behind each process handle of the memory double, kept off the handle itself. The
// memory process landing reads it to fill the environment. This is the in-memory form of the
// agreement between a credential provider and a process landing: MCP never reads it.
const secrets = new WeakMap<ProcessCredentialHandle, string>()

/** The secret behind a process handle of the memory double. Not exported from `./testing`. */
export function memorySecretOf(credential: ProcessCredentialHandle): string | undefined {
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

function httpHandle(secret: string): HttpCredentialHandle {
  let usable = true
  return Object.freeze({
    purpose: 'http-authorization',
    async authorize(headers: Headers) {
      if (!usable) return { failure: 'rejected' as const }
      headers.set('authorization', `Bearer ${secret}`)
      return { ok: true as const }
    },
    async reportRejection() {
      usable = false
    },
    async release() {
      usable = false
    },
  })
}

function processHandle(secret: string): ProcessCredentialHandle {
  const credential: ProcessCredentialHandle = Object.freeze({
    purpose: 'process-env',
    async release() {},
  })
  secrets.set(credential, secret)
  return credential
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
  const found = (
    access: Access<P>,
    holding: EndpointHolding,
    binding: CredentialBinding,
  ): Outcome<string, CredentialFailure> => {
    const entry = entries.get(keyOf(access.tenant, binding))
    if (entry === undefined || entry.holding !== holding) return { failure: 'missing' }
    if (entry.unreadable) return { failure: 'unknown' }
    if (entry.rejected) return { failure: 'rejected' }
    return { ok: entry.secret }
  }
  function acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: ProcessPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  function acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  async function acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle | HttpCredentialHandle, CredentialFailure>> {
    const secret = found(access, holding, binding)
    if ('failure' in secret) return secret
    return { ok: purpose.kind === 'process-env' ? processHandle(secret.ok) : httpHandle(secret.ok) }
  }
  return {
    acquire,
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
