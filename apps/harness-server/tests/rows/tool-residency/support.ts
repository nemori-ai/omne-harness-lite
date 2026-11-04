import { Context } from '@deepseek-ai/cordis'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { fail } from '@omne-harness/operation-result'
import type {
  ResidentKey,
  SessionCommand,
  SessionReconciliation,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createMemorySessionTransactionPair,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { SessionProvider } from '@omne-harness/session-cordis/cordis'
import { residentToolFacts, type ResidentReferencesPage } from '@omne-harness/tool-contract'
import type { ToolBindingKey, ToolShape } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type { ResidentKeyRoundTripFixture } from '@omne-harness/tool-cordis-contract/testing'
import {
  TOOL_RESIDENCY_PRINCIPAL_KEY,
  toolResidencyPrincipal,
} from '../../../src/entry/tool-residency-principal.ts'
import { toolResidencyRow } from '../../../src/rows/tool-residency/index.ts'

export const tenantA = () =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
export const tenantB = () =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')
export const key = (name = 'read_file'): ToolBindingKey => ({
  layer: { kind: 'official' },
  asset: { name, adoption: { owner: 'acme', name, revision: '1', digest: `sha256:${name}` } },
})
export const shape = (name = 'read_file'): ToolShape => ({
  name,
  kind: 'function',
  parameters: { kind: 'executor-owned' },
})
export type Read = SessionReconciliation<unknown>['references']

/** A real Session provider, over the public in-memory transaction pair. No durable backend. */
export async function assembly(pageSize = 1) {
  const root = new Context()
  const { issuer } = inProcessPrincipalAuthority()
  const initialization = createMemoryInitializationSource()
  const checks = createPolicySessionAccessCheck<unknown>(() => ({
    kind: 'allowed',
    evidence: evidence('test-access'),
  }))
  const pair = createMemorySessionTransactionPair({ initialization, accessCheck: checks })
  const inputs: Parameters<Read>[0][] = []
  let read: Read = input => pair.transactions.references(input)
  const providers = await root.plugin({
    apply(ctx: Context) {
      ctx.provide(principalIssuerKey, issuer)
      ctx.provide('sessionAccessCheck', checks)
      ctx.provide('sessionDelegatedTransactions', pair.delegated)
      ctx.provide('sessionPrincipals', { coordinator: {}, maintainer: {} })
      ctx.provide('sessionWorkPrincipals', {
        forSession: async () => fail({ kind: 'denied' as const, action: 'fixture-unused' }),
      })
      ctx.provide('sessionTransactions', {
        ...pair.transactions,
        references: (input: Parameters<Read>[0]) => {
          inputs.push(input)
          return read(input)
        },
      })
      ctx.provide('s0.assemblyLifecycle', { register() {} })
    },
  })
  const principalFiber = await root.plugin({
    apply: (ctx: Context) =>
      toolResidencyPrincipal.install(ctx, {
        stateRoot: '.',
        readTrusted: () => root,
        once: (_key, create) => create(),
      }),
  })
  const principal: unknown = root.get(TOOL_RESIDENCY_PRINCIPAL_KEY)
  const session = await root.plugin(SessionProvider, { admission: 'none', disposeWaitMs: 1 })
  const row = await root.plugin(toolResidencyRow, { pageSize })
  const reader = root.toolResidencyReader
  let serial = 0
  // All tenants' first holder has the same text. Later writes in one tenant need separate sessions.
  const counts = new Map<string, number>()
  const writeRaw: NonNullable<ResidentKeyRoundTripFixture['writeRaw']> = async input => {
    const facts = factsOf(input.key, shape(input.key.asset.name))
    const tenantText = input.tenant.organization.text + input.tenant.account.text
    const ordinal = counts.get(tenantText) ?? 0
    counts.set(tenantText, ordinal + 1)
    const session = sessionId(`holder-${ordinal}`)
    const command: Extract<SessionCommand, { kind: 'create' }> = {
      kind: 'create',
      input: {
        tenant: input.tenant,
        session,
        operation: operationId(`write-${++serial}`),
        creation: creation({
          residentAdoption: {
            residents: [
              {
                capability: facts.capability,
                version: '1',
                shape: input.shape,
                admitted: evidence('adopted'),
              },
            ],
            keys: [{ capability: facts.capability, key: facts.key as ResidentKey }],
          },
        }),
      },
    }
    initialization.controls.register(
      command,
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    )
    const guards = succeeded(await initialization.prepare(command), 'initialization')
    succeeded(
      await pair.transactions.commit({
        access: { principal, tenant: input.tenant, session },
        command,
        guards: [...guards, guard('login', 'login-entry', 'present')],
      }),
      'write',
    )
  }
  const write: ResidentKeyRoundTripFixture['write'] = async input => {
    const facts = factsOf(input.key, input.shape)
    await writeRaw({ ...input, shape: facts.shape })
  }
  return {
    root,
    reader,
    principal,
    principalFiber,
    inputs,
    row,
    write,
    writeRaw,
    setRead(next: Read) {
      read = next
    },
    async dispose() {
      await row.dispose()
      await session.dispose()
      await principalFiber.dispose()
      await providers.dispose()
    },
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function factsOf(at: ToolBindingKey, first: ToolShape) {
  const facts = residentToolFacts(at, first)
  if ('failure' in facts) throw new Error(`test key or shape is invalid: ${facts.failure.field}`)
  return facts.ok
}

export function emptyPage() {
  return { sessions: [], next: null } satisfies ResidentReferencesPage
}
