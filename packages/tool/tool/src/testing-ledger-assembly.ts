import assert from 'node:assert/strict'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import {
  type Adoption,
  type FixedToolRequest,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { type CallAccess } from '@omne-harness/tool-contract/provider'
import { defaultResultPolicy, decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import type { createToolLedger } from './ledger.ts'
import type { LedgerDomain } from './ledger-store.ts'
import { digestOf } from './evidence.ts'
import type { ToolLedgerGuards } from './ledger-guards.ts'
import type { ToolLedgerStoreFixture, StoreCaseDependencies } from './testing-ledger-store-types.ts'
import type { createTestInvocationSource } from './testing-source.ts'
import { callId, operationId, success } from './testing-ledger-values.ts'

type Principal = Readonly<{ subject: 'alice' | 'bob' }>
type Factory = typeof createToolLedger<Principal, ContentBlock>
type Ledger = ReturnType<Factory>
type AdmitInput = Parameters<Ledger['admissions']['admit']>[0]
type Plan = Ledger['commands']['planPreparation']
type LedgerAssembly = Readonly<{
  ledger: Ledger
  input: AdmitInput
  access: CallAccess<Principal>
  other: Principal
  domain: Extract<LedgerDomain, { kind: 'call' }>
  counts(): Readonly<{ reads: number; commits: number }>
  revoke(): void
  query(operation?: AdmitInput['operation']): ReturnType<Ledger['reads']['operation']>
  changedInput(): AdmitInput
  plan(
    expected: Parameters<Plan>[0]['expected'],
    operation?: AdmitInput['operation'],
  ): ReturnType<Plan>
}>
export type LedgerAssemblyDependencies = StoreCaseDependencies &
  Readonly<{
    createLedger: Factory
    source: typeof createTestInvocationSource<Principal>
    clock(): Parameters<Factory>[2]
    custody(): Parameters<Factory>[4]['custody']
    environment(): Parameters<Factory>[4]['releaseInspection']
  }>
const adoption = (name: string): Adoption => ({
  owner: 'ledger-conformance',
  name,
  revision: '1',
  digest: `sha256:${name}`,
})

function invokeRequest(): ToolInvokeRequest {
  return {
    availability: {
      kind: 'available',
      executor: adoption('executor'),
      layer: { kind: 'official' },
      definition: {
        kind: 'function',
        adoption: adoption('definition'),
        name: 'conformance',
        description: 'A conformance tool.',
        requiredCapabilities: [],
        backgroundAllowed: true,
        declarations: {
          adoption: adoption('declarations'),
          environment: null,
          attachments: [],
          inputModalities: [],
          outputModalities: [],
          settings: null,
        },
        parameters: {
          schema: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [],
        },
        returns: { kind: 'ordinary', program: { kind: 'none' } },
      },
    },
    command: null,
    arguments: { original: '{}', effective: '{}', complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: {
      owner: 'conformance-scope',
      key: 'one',
      grant: { owner: 'conformance-scope', record: 'grant', revision: '1', digest: 'sha256:grant' },
    },
    consumer: {
      owner: 'conformance-consumer',
      work: 'work',
      position: 'position',
      purpose: 'tool-result',
    },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}

/** A real ledger with a fixed non-production trust model; the provider supplies only the store. */
export async function ledgerAssembly(
  fixture: ToolLedgerStoreFixture,
  deps: LedgerAssemblyDependencies,
): Promise<LedgerAssembly> {
  const tenant = deps.tenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
  const principal: Principal = { subject: 'alice' }
  const other: Principal = { subject: 'bob' }
  let revoked = false
  const qualify: ToolLedgerGuards<Principal, ContentBlock>['access']['qualify'] = async input =>
    !revoked &&
    input.principal.subject === 'alice' &&
    input.tenant.organization.text === tenant.organization.text &&
    input.tenant.account.text === tenant.account.text
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'not-qualified' }
  const source = deps.source({
    snapshotPrincipal: value => ({ ...value }),
    authority: {
      qualify: input =>
        qualify({ ...input, call: callId('source-qualification'), action: 'admit' }),
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
  })
  const request = invokeRequest()
  const issued = await source.issuer.resolve({ principal, tenant, request })
  assert.equal(issued.kind, 'bound', 'fixture source must bind a complete legal invocation')
  assert.ok(issued.kind === 'bound')
  const access = { principal, tenant, call: issued.call }
  const input = {
    ...access,
    operation: issued.admission,
    request: { ...request, invocation: issued.invocation },
  }
  const named = new Set<string>()
  const guards: ToolLedgerGuards<Principal, ContentBlock> = {
    access: { qualify },
    sources: {
      verify: checked =>
        named.has(digestOf(checked))
          ? Promise.resolve({ kind: 'trusted' })
          : source.guard.verify(checked),
    },
    factAcknowledgements: {
      verify: async () => ({
        kind: 'unavailable',
        diagnostic: 'no fact source in ledger conformance',
      }),
    },
    grants: new Map([
      [
        'conformance-scope',
        {
          verifyGrant: async checked =>
            checked.scope.owner === request.scope.owner &&
            checked.scope.key === request.scope.key &&
            digestOf(checked.scope.grant) === digestOf(request.scope.grant) &&
            checked.principal.subject === principal.subject
              ? { kind: 'granted' }
              : { kind: 'refused', reason: 'scope-not-owned' },
        },
      ],
    ]),
    starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
    results: {
      text: text => {
        const block = judgeContentBlock({
          kind: 'text',
          id: 'logical',
          visibility: { toHuman: true, toModel: true },
          text,
        })
        assert.ok('ok' in block)
        return succeed({
          content: [block.ok],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        })
      },
    },
    policy: defaultResultPolicy,
    budgets: {
      arguments: {
        maxBytes: 4096,
        maxDepth: 16,
        maxItems: 256,
        maxMembers: 64,
        maxStringLength: 1024,
        maxNumberLength: 32,
      },
    },
  }
  let reads = 0
  let commits = 0
  const store: Parameters<Factory>[0] = {
    durability: fixture.store.durability,
    read: domain => {
      reads += 1
      return fixture.store.read(domain)
    },
    commit: command => {
      commits += 1
      return fixture.store.commit(command)
    },
  }
  const ledger = deps.createLedger(
    store,
    guards,
    deps.clock(),
    { resultPageBytes: 4096, ledgerCommitAttempts: 4, queueCapacity: 16 },
    { custody: deps.custody(), releaseInspection: deps.environment(), content: null },
  )
  return {
    ledger,
    input,
    access,
    other,
    domain: { kind: 'call', tenant, call: issued.call } as const,
    counts: () => ({ reads, commits }),
    revoke: () => {
      revoked = true
    },
    query: (operation = input.operation) => ledger.reads.operation({ ...access, operation }),
    /** A second complete trusted internal binding for the same operation, as in named-source tests. */
    changedInput: () => {
      const fixed: FixedToolRequest = {
        ...input.request,
        arguments: { original: '{"changed":true}', effective: '{"changed":true}', complete: true },
        invocation: {
          kind: 'direct',
          source: {
            owner: 'ledger-conformance',
            record: 'second-binding',
            revision: '1',
            digest: 'sha256:second-binding',
          },
        },
      }
      const changed = { ...input, request: fixed }
      named.add(digestOf(changed))
      return changed
    },
    plan: (
      expected: Parameters<ReturnType<Factory>['commands']['planPreparation']>[0]['expected'],
      operation = operationId('plan'),
    ) =>
      ledger.commands.planPreparation({
        ...access,
        instance: success(decodeToolInstanceId('conformance-instance')),
        generation: '1',
        operation,
        expected,
        request: input.request,
        purpose: 'initial',
      }),
  }
}
