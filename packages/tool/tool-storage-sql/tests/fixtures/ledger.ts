// A real Tool ledger (`createToolLedger` of `@omne-harness/tool`) over a given store, with a fixed
// non-production trust model: one principal of one tenant is qualified, the invocation source is
// the test source of `@omne-harness/tool/testing`, and the other ports are the in-memory doubles
// of `@omne-harness/tool-contract/testing`. Only the store comes from this member. The source is
// built once and given to every ledger, so a ledger rebuilt over a reopened store verifies the
// same invocation.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import {
  createToolLedger,
  canonicalDigest,
  type ToolLedgerGuards,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createTestInvocationSource } from '@omne-harness/tool/testing'
import {
  decodeToolCallId,
  type Adoption,
  type FixedToolRequest,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { defaultResultPolicy } from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
  createMemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'

export type Principal = Readonly<{ subject: 'alice' | 'bob' }>

const sourceCall = decodeToolCallId('source-qualification')
if ('failure' in sourceCall) throw new Error('invalid fixture call')
/** The call the source qualification names: the source binds before a call exists. */
const SOURCE_CALL = sourceCall.ok

type ScopeRef = FixedToolRequest['requesterScope']

/** A verifying guard: a scope reference is a non-empty `ref` text and nothing else. */
function isScopeRef(value: unknown): value is ScopeRef {
  if (typeof value !== 'object' || value === null) return false
  const ref: unknown = Reflect.get(value, 'ref')
  return (
    Object.keys(value).every(key => key === 'ref') && typeof ref === 'string' && ref.trim() !== ''
  )
}

function scope(): ScopeRef {
  const value: unknown = { ref: 'test-requester-scope' }
  if (!isScopeRef(value)) throw new Error('invalid fixture scope')
  return value
}

const adoption = (name: string): Adoption => ({
  owner: 'ledger-fixture',
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
        name: 'fixture',
        description: 'A fixture tool.',
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
    environment: null,
    requesterScope: scope(),
    resources: [],
    scope: {
      owner: 'fixture-scope',
      key: 'one',
      grant: { owner: 'fixture-scope', record: 'grant', revision: '1', digest: 'sha256:grant' },
    },
    consumer: {
      owner: 'fixture-consumer',
      work: 'work',
      position: 'position',
      purpose: 'tool-result',
    },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}

/** A fixed request with a direct invocation, for the start coordinator. */
export function fixedRequest(): FixedToolRequest {
  return {
    ...invokeRequest(),
    invocation: {
      kind: 'direct',
      source: { owner: 'ledger-fixture', record: 'entry', revision: '1', digest: 'sha256:entry' },
    },
  }
}

export type LedgerWorld = Awaited<ReturnType<typeof ledgerWorld>>

/** The trust model and one admitted-to-be input of `tenant`; `ledgerOver` builds a ledger on a store. */
export async function ledgerWorld(tenant: TenantId) {
  const principal: Principal = { subject: 'alice' }
  const qualify: ToolLedgerGuards<Principal, ContentBlock>['access']['qualify'] = async input =>
    input.principal.subject === 'alice' &&
    input.tenant.organization.text === tenant.organization.text &&
    input.tenant.account.text === tenant.account.text
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'not-qualified' }
  const source = createTestInvocationSource<Principal>({
    snapshotPrincipal: value => ({ ...value }),
    authority: {
      qualify: input => qualify({ ...input, call: SOURCE_CALL, action: 'admit' }),
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
  })
  const request = invokeRequest()
  const issued = await source.issuer.resolve({ principal, tenant, request })
  if (issued.kind !== 'bound') throw new Error('the fixture source must bind the invocation')
  const access = { principal, tenant, call: issued.call }
  const input = {
    ...access,
    operation: issued.admission,
    request: { ...request, invocation: issued.invocation },
  }
  const guards: ToolLedgerGuards<Principal, ContentBlock> = {
    access: { qualify },
    sources: source.guard,
    factAcknowledgements: {
      verify: async () => ({ kind: 'unavailable', diagnostic: 'no fact source in this fixture' }),
    },
    grants: new Map([
      [
        'fixture-scope',
        {
          verifyGrant: async checked =>
            canonicalDigest(checked.scope.grant) === canonicalDigest(request.scope.grant) &&
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
        if (!('ok' in block)) throw new Error('the fixture text block is not legal')
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
  const ledgerOver = (store: ToolLedgerStore<ContentBlock>) =>
    createToolLedger<Principal, ContentBlock>(
      store,
      guards,
      createMemoryToolClock(),
      { resultPageBytes: 4096, ledgerCommitAttempts: 4, queueCapacity: 16 },
      {
        custody: createMemoryToolOutputCustody<Principal>(),
        releaseInspection: createMemoryToolEnvironment<Principal>(),
        content: null,
      },
    )
  return { access, input, ledgerOver }
}
