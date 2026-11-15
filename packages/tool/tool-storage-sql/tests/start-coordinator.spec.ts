import { afterEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type DurableEvidence,
} from '@omne-harness/tool-contract'
import { decodeToolInstanceId, type ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import {
  runConformanceCase,
  toolStartAuthorityConformance,
  toolStartAuthorizationConformance,
  toolStartFenceConformance,
} from '@omne-harness/tool-contract/testing'
import {
  createLocalStartCoordinator,
  type GuardResource,
  type StartCoordinatorAccess,
} from '@omne-harness/tool-host-local'

import type { ToolLedgerStore } from '@omne-harness/tool'
import { openApp, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { fixedRequest } from './fixtures/ledger.ts'

type Principal = Readonly<{ subject: string; tenants: readonly string[]; fences: boolean }>

const keyOf = (tenant: TenantId) => `${tenant.organization.text}/${tenant.account.text}`
const principalA: Principal = { subject: 'alice', tenants: [keyOf(TENANT_A)], fences: true }
const principalB: Principal = { subject: 'bob', tenants: [keyOf(TENANT_B)], fences: true }
const stranger: Principal = { subject: 'carol', tenants: [keyOf(TENANT_A)], fences: false }
const GUARD: GuardResource = { owner: 'permissions', resource: 'scope-1/read_file' }

const access: StartCoordinatorAccess<Principal> = {
  qualify: async input =>
    input.principal.tenants.includes(keyOf(input.tenant)) &&
    (input.action === 'start' || input.principal.fences)
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'not-qualified' },
}

const coordinator = (store: ToolLedgerStore) =>
  createLocalStartCoordinator<Principal>({
    store,
    access,
    permitRequirements: {
      check: async () => ({
        kind: 'not-required',
        source: {
          owner: 'test-only',
          record: 'no-permit-required',
          revision: '1',
          digest: 'sha256:test-only',
        },
      }),
    },
    guardsOf: () => [GUARD],
    commitAttempts: 4,
  })

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function fixture() {
  const app = await openApp()
  opened.push(app)
  const authority: ToolStartAuthority<Principal> = coordinator(app.store)
  return {
    authority,
    fence: {
      invalidate: (input: Parameters<typeof authority.invalidate>[0]) =>
        authority.invalidate(input),
    },
    guard: GUARD,
    access: { principal: principalA, tenant: TENANT_A },
    otherAccess: { principal: principalB, tenant: TENANT_B },
    strangerAccess: { principal: stranger, tenant: TENANT_A },
  }
}

const suites = [
  { name: 'P04 start authority', cases: toolStartAuthorityConformance<Principal>(), missing: null },
  { name: 'P04 start fence', cases: toolStartFenceConformance<Principal>(), missing: null },
  {
    name: 'P04 start authorization',
    cases: toolStartAuthorizationConformance<Principal>(),
    missing: 'authorization',
  },
] as const

describe.each(suites)('$name suite on the coordinator over the SQL store', ({ cases, missing }) => {
  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases)('$clause $name', async conformance => {
    const verdict = await runConformanceCase(conformance, await fixture())
    expect(verdict).toEqual(
      missing === null ? { kind: 'passed' } : { kind: 'not-applicable', handle: missing },
    )
  })
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer)
    throw new Error(`expected success, got ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

it('a coordinator rebuilt over the reopened store refuses an old permit after an invalidation', async () => {
  const first = await openApp({ keep: true })
  opened.push(first)
  const call = ok(decodeToolCallId('call-1'))
  const callAccess = { principal: principalA, tenant: TENANT_A, call }
  const start = {
    kind: 'start' as const,
    operation: ok(decodeToolOperationId('call-1/start')),
    executor: { owner: 'test', name: 'exec', revision: '1', digest: 'sha256:exec' },
    execution: {
      tenant: TENANT_A,
      call,
      instance: ok(decodeToolInstanceId('instance-1')),
      generation: '1',
    },
  }
  const permit = ok(
    await coordinator(first.store).prepare({ ...callAccess, start, request: fixedRequest() }),
  )
  first.close()

  const second = await openApp({ directory: first.directory })
  opened.push(second)
  const rebuilt = coordinator(second.store)
  ok(
    await rebuilt.invalidate({
      principal: principalA,
      tenant: TENANT_A,
      operation: ok(decodeToolOperationId('retire-1')),
      guard: {
        ...GUARD,
        revision: 'retire-1',
        evidence: evidence('retire-1'),
        scope: { kind: 'resource' },
      },
    }),
  )
  const consumed = ok(
    await rebuilt.consume({
      ...callAccess,
      permit,
      executorReceipt: evidence('capsule'),
      request: fixedRequest(),
    }),
  )
  expect(consumed.kind).toBe('rejected')
  expect(ok(await rebuilt.inspect({ ...callAccess, start })).kind).not.toBe('started')
})
