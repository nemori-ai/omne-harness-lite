// The paired invocation source of the guard table (row 2) and the operation identity mint. The
// issuer binds a tenant and a consumer to the identities of its original call, once, and recalls
// them afterwards. The guard checks that a fixed request is the one that was bound. The binding is
// kept in the `host` domain of the ledger store, one domain per tenant, so a rebuilt source over
// the same store recalls what an earlier one issued.
//
// The identities of a binding are a function of the tenant and the consumer. A retry after an
// issuance whose answer is unknown therefore finds the same identities, whether the first commit
// took effect or not, and `issuance-unknown` names identities that the retry will use.
import {
  createInvocationForwarding,
  TOOL_FORWARDING_OWNER,
  isPrincipalJson,
  parseForward,
} from './invocation-forwarding.ts'
import { createForwardingReceiver } from './forwarding-receiver.ts'
import {
  invocationQualifier,
  type LocalInvocationQualifier,
  type ObserveInvocationRecord,
  type ObserveInvocationOrigin,
} from './invocation-qualification.ts'
import { fail } from '@omne-harness/operation-result'
import type { Reply, ToolResultReceiver } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolStartAuthority,
  ToolForwardSource,
} from '@omne-harness/tool-contract/provider'
import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  isTenantShape,
  type AccessVerdict,
  type LedgerDomain,
  type LedgerRead,
  type SourceVerdict,
  type ToolInvokeAuthority,
  type ToolLedgerStore,
  type ToolSourceGuard,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type FixedToolRequest,
  type ToolCallId,
  type ToolDefiniteFailure,
  type ToolInvocation,
  type ToolInvokeRequest,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  judgeToolInvokeRequest,
  judgeHandoff,
  type ToolInvocationSourceIssuer,
  type ToolInvocationSourceOutcome,
  type ToolOperationIdentities,
} from '@omne-harness/tool-contract/provider'

type TenantId = LedgerDomain['tenant']

/** The key of the host domain the source keeps per tenant. */
export const INVOCATION_SOURCE_DOMAIN_KEY = 'invocation-source'

/** The owner named in the evidence of every invocation source this module issues. */
const INVOCATION_SOURCE_OWNER = '@omne-harness/tool-host-local'

/** A JSON value in its plain form, the form in which a principal is kept in a binding. */
export type PrincipalJson =
  | null
  | boolean
  | number
  | string
  | readonly PrincipalJson[]
  | Readonly<{ [key: string]: PrincipalJson }>

/**
 * How a principal is kept in the binding, so that a rebuilt source can compare it with the
 * principal of a later call. The shape of `P` belongs to identity: the assembly gives the codec of
 * the identity owner. A stored value that `decode` refuses makes the recall `association-unknown`.
 */
export type PrincipalCodec<P> = Readonly<{
  encode(principal: P): PrincipalJson
  decode(value: PrincipalJson): Outcome<P, Readonly<{ reason: string }>>
}>

export type LocalInvocationSourceInput<P, B extends ContentBlock = ContentBlock> = Readonly<{
  /** The ledger store of the runtime: its `host` domain keeps the bindings. */
  store: ToolLedgerStore<B>
  /** Current consumer qualification and the stable comparison of subjects (identity's adapter). */
  authority: ToolInvokeAuthority<P>
  principalCodec: PrincipalCodec<P>
  /** How many times a revision conflict is re-read and decided again. */
  commitAttempts: number
  forwarding?: Readonly<{
    authority(): ToolStartAuthority<P> | undefined
    isParent(request: FixedToolRequest): boolean
  }>
}>

export type LocalInvocationSource<P, B extends ContentBlock = ContentBlock> = Readonly<{
  /** Goes to the runtime as its `sourceIssuer`. */
  issuer: ToolInvocationSourceIssuer<P>
  /** Goes to the ledger as `guards.sources`. */
  guard: ToolSourceGuard<P>
  forwarding: ToolForwardSource<P>
  receiver: ToolResultReceiver<P, B>
  /** Reads only the persisted subject projection; the caller must reissue and run guard.verify. */
  recoverBinding(
    input: Omit<CallAccess<P>, 'principal'> &
      Readonly<{ admission: ToolOperationId; request: FixedToolRequest }>,
  ): Reply<{ principal: PrincipalJson }>
}>

/** What the source keeps for one tenant and consumer. */
type Binding = Readonly<{
  kind: 'invocation-source'
  call: ToolCallId
  admission: ToolOperationId
  /** The digest of the invoke request the binding was made for. */
  requestDigest: string
  /** The digest of the whole fixed request, the issued invocation included. */
  fixedDigest: string
  invocation: ToolInvocation
  principal: PrincipalJson
}>

const denied: ToolDefiniteFailure = { kind: 'denied', action: 'admit' }

function rejected(failure: ToolDefiniteFailure): ToolInvocationSourceOutcome {
  return { kind: 'rejected', failure }
}

function unavailable(dependency: string, diagnostic: string): ToolInvocationSourceOutcome {
  return rejected({ kind: 'unavailable', dependency, diagnostic })
}

const THROWN = 'threw an exception; its message is not reported'

async function checked(ask: () => Promise<AccessVerdict>): Promise<AccessVerdict> {
  try {
    return await ask()
  } catch {
    return { kind: 'unavailable', diagnostic: `the invoke authority ${THROWN}` }
  }
}

function identity<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`the source minted an illegal identity: ${text}`)
  return decoded.ok
}

/** The key of a binding in its domain: the consumer, as a JSON text of its parts. */
function consumerKey(consumer: FixedToolRequest['consumer']): string {
  const { owner, work, position, purpose } = consumer
  return `source:${JSON.stringify([owner, work, position, purpose])}`
}

function tenantText(tenant: TenantId): readonly [string, string] {
  return [tenant.organization.text, tenant.account.text]
}

/** The identities of the binding of one tenant and consumer. */
export function invocationSourceIdentities(
  tenant: TenantId,
  consumer: FixedToolRequest['consumer'],
) {
  const hash = canonicalDigest({ tenant: tenantText(tenant), consumer }).slice('sha256:'.length)
  return {
    call: identity(decodeToolCallId(`call-${hash}`), 'call'),
    admission: identity(decodeToolOperationId(`admit-${hash}`), 'admission'),
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/**
 * A binding as the source wrote it, or null for any other value. The store interprets no record,
 * so a value of another shape is a defect of the store, not a binding.
 */
function parseBinding(value: unknown): Binding | null {
  if (!isRecord(value) || value.kind !== 'invocation-source') return null
  if (
    typeof value.call !== 'string' ||
    typeof value.admission !== 'string' ||
    typeof value.requestDigest !== 'string' ||
    typeof value.fixedDigest !== 'string' ||
    !isPrincipalJson(value.principal) ||
    !isRecord(value.invocation) ||
    value.invocation.kind !== 'direct'
  )
    return null
  const call = decodeToolCallId(value.call),
    admission = decodeToolOperationId(value.admission)
  const source = judgeHandoff({ kind: 'retained', custody: value.invocation.source })
  if (
    'failure' in call ||
    'failure' in admission ||
    'failure' in source ||
    source.ok.kind !== 'retained'
  )
    return null
  return {
    kind: 'invocation-source',
    call: call.ok,
    admission: admission.ok,
    requestDigest: value.requestDigest,
    fixedDigest: value.fixedDigest,
    invocation: { kind: 'direct', source: source.ok.custody },
    principal: value.principal,
  }
}

/** What one issuance needs once the consumer is qualified. */
type IssuePlan = Readonly<{
  tenant: TenantId
  key: string
  request: ToolInvokeRequest
  requestDigest: string
  call: ToolCallId
  admission: ToolOperationId
  encoded: PrincipalJson
}>

/** The digest of a fixed request and the key of its consumer, or null when it is not canonical. */
function digestsOf(request: FixedToolRequest): Readonly<{ fixed: string; key: string }> | null {
  try {
    return { fixed: canonicalDigest(request), key: consumerKey(request.consumer) }
  } catch {
    return null
  }
}

/** Whether a binding was made for this call, this admission operation and this fixed request. */
function bindsTo(binding: Binding, call: ToolCallId, operation: ToolOperationId, fixed: string) {
  return binding.call === call && binding.admission === operation && binding.fixedDigest === fixed
}

/** What the comparison of subjects means to verification. */
function subjectVerdict(same: AccessVerdict | 'undecodable'): SourceVerdict {
  if (same === 'undecodable')
    return { kind: 'unavailable', diagnostic: 'the stored principal cannot be decoded' }
  if (same.kind === 'unavailable') return same
  if (same.kind === 'denied') return { kind: 'forged', reason: 'different-subject' }
  return { kind: 'trusted' }
}

function nextRevision(revision: string) {
  const decoded = decodeToolRevision((BigInt(revision) + 1n).toString())
  if ('failure' in decoded) throw new Error('the source minted an illegal revision')
  return decoded.ok
}

/**
 * Builds the invocation source of a local host: the issuer for the runtime and the guard for the
 * ledger, over one ledger store. `commitAttempts` must be a positive safe integer, else a
 * `TypeError`.
 */
export function createLocalInvocationSource<P, B extends ContentBlock = ContentBlock>(
  input: LocalInvocationSourceInput<P, B>,
): LocalInvocationSource<P, B> {
  return buildInvocationSource(input)
}

export function createLocalInvocationQualifier<P, B extends ContentBlock = ContentBlock>(
  input: LocalInvocationSourceInput<P, B>,
): LocalInvocationQualifier<P> {
  return invocationQualifier(
    (observe, origin) => buildInvocationSource(input, observe, origin).guard,
  )
}

function buildInvocationSource<P, B extends ContentBlock>(
  input: LocalInvocationSourceInput<P, B>,
  observe?: ObserveInvocationRecord,
  observeOrigin?: ObserveInvocationOrigin,
): LocalInvocationSource<P, B> {
  const { store, authority, principalCodec, commitAttempts } = input
  if (!Number.isSafeInteger(commitAttempts) || commitAttempts <= 0)
    throw new TypeError('commitAttempts: range')
  if (typeof store?.read !== 'function') throw new TypeError('store: missing')
  if (typeof authority?.qualify !== 'function') throw new TypeError('authority: missing')
  if (typeof principalCodec?.encode !== 'function') throw new TypeError('principalCodec: missing')

  const domain = (tenant: TenantId): LedgerDomain => ({
    kind: 'host',
    tenant,
    key: INVOCATION_SOURCE_DOMAIN_KEY,
  })

  /** The domain of the tenant read once, or the reason it could not be read. */
  const readDomain = async (
    tenant: TenantId,
  ): Promise<Extract<LedgerRead<B>, { kind: 'complete' }> | string> => {
    let result: LedgerRead<B>
    try {
      result = await store.read(domain(tenant))
    } catch {
      return `the source store ${THROWN}`
    }
    return result.kind === 'complete' ? result : result.diagnostic
  }

  const bindingOf = (
    read: Extract<LedgerRead<B>, { kind: 'complete' }>,
    key: string,
    tenant?: TenantId,
  ): Binding | null | 'unreadable' => {
    for (const record of read.records) {
      if (record.kind !== 'host' || record.host.key !== key) continue
      if (tenant !== undefined) observe?.(domain(tenant), record)
      return parseBinding(record.host.value) ?? 'unreadable'
    }
    return null
  }

  const decodePrincipal = (value: PrincipalJson): P | null => {
    try {
      const decoded = principalCodec.decode(value)
      return 'failure' in decoded ? null : decoded.ok
    } catch {
      return null
    }
  }

  /** Whether the principal of a call is the one that the binding was made for. */
  const sameSubject = (current: P, binding: Binding): Promise<AccessVerdict | 'undecodable'> => {
    const original = decodePrincipal(binding.principal)
    if (original === null) return Promise.resolve('undecodable')
    return checked(() => authority.samePrincipal({ current, original }))
  }

  /** A rejection when the tenant is malformed or the consumer is not qualified now; else null. */
  const admit = async (
    principal: P,
    tenant: TenantId,
    consumer: FixedToolRequest['consumer'],
  ): Promise<ToolInvocationSourceOutcome | null> => {
    if (!isTenantShape(tenant)) return rejected(denied)
    const qualified = await checked(() => authority.qualify({ principal, tenant, consumer }))
    if (qualified.kind === 'denied') return rejected(denied)
    if (qualified.kind === 'unavailable')
      return unavailable('invoke-authority', qualified.diagnostic)
    return null
  }

  const encodePrincipal = (
    principal: P,
  ): Readonly<{ encoded: PrincipalJson }> | ToolInvocationSourceOutcome => {
    try {
      return { encoded: principalCodec.encode(principal) }
    } catch {
      return unavailable('principal-codec', `the principal codec ${THROWN}`)
    }
  }

  /** The answer to a consumer that already has a binding: the same bound call, or a refusal. */
  const recall = async (
    known: Binding,
    principal: P,
    requestDigest: string,
  ): Promise<ToolInvocationSourceOutcome> => {
    const same = await sameSubject(principal, known)
    if (same === 'undecodable') return { kind: 'association-unknown' }
    if (same.kind === 'denied') return rejected(denied)
    if (same.kind === 'unavailable') return unavailable('invoke-authority', same.diagnostic)
    if (known.requestDigest !== requestDigest)
      return rejected({ kind: 'conflict', operation: known.admission })
    return {
      kind: 'bound',
      call: known.call,
      admission: known.admission,
      invocation: known.invocation,
      recovered: true,
    }
  }

  /** Writes a new binding at the revision that was read; null when that revision moved. */
  const bind = async (
    read: Extract<LedgerRead<B>, { kind: 'complete' }>,
    plan: IssuePlan,
  ): Promise<ToolInvocationSourceOutcome | null> => {
    const { tenant, key, request, requestDigest, call, admission, encoded } = plan
    const invocation: ToolInvocation = Object.freeze({
      kind: 'direct',
      source: Object.freeze({
        owner: INVOCATION_SOURCE_OWNER,
        record: `invocation-source:${call}`,
        revision: '1',
        digest: canonicalDigest({ tenant: tenantText(tenant), call, admission, requestDigest }),
      }),
    })
    const binding: Binding = {
      kind: 'invocation-source',
      call,
      admission,
      requestDigest,
      fixedDigest: canonicalDigest({ ...request, invocation }),
      invocation,
      principal: encoded,
    }
    let committed: Awaited<ReturnType<typeof store.commit>>
    try {
      committed = await store.commit({
        domain: domain(tenant),
        expected: read.revision,
        revision: nextRevision(read.revision),
        writes: [{ kind: 'put', record: { kind: 'host', host: { key, value: binding } } }],
      })
    } catch {
      return { kind: 'issuance-unknown', call, admission }
    }
    if (committed.kind === 'committed')
      return { kind: 'bound', call, admission, invocation, recovered: false }
    if (committed.kind === 'unknown') return { kind: 'issuance-unknown', call, admission }
    if (committed.kind === 'unavailable')
      return unavailable('invocation-source', committed.diagnostic)
    return null
  }

  const issuer: ToolInvocationSourceIssuer<P> = {
    resolve: async input => {
      const judged = judgeToolInvokeRequest(input.request)
      if ('failure' in judged) return rejected({ kind: 'invalid', ...judged.failure })
      const request = judged.ok
      if (request.consumer.owner === TOOL_FORWARDING_OWNER) return rejected(denied)
      const { principal, tenant } = input
      const refused = await admit(principal, tenant, request.consumer)
      if (refused !== null) return refused
      const kept = encodePrincipal(principal)
      if (!('encoded' in kept)) return kept
      const key = consumerKey(request.consumer)
      const { call, admission } = invocationSourceIdentities(tenant, request.consumer)
      const requestDigest = canonicalDigest(request)
      const plan = { tenant, key, request, requestDigest, call, admission, encoded: kept.encoded }

      for (let attempt = 0; attempt < commitAttempts; attempt += 1) {
        const read = await readDomain(tenant)
        if (typeof read === 'string') return unavailable('invocation-source', read)
        const known = bindingOf(read, key)
        if (known === 'unreadable') return { kind: 'association-unknown' }
        if (known !== null) return recall(known, principal, requestDigest)
        const issued = await bind(read, plan)
        if (issued !== null) return issued
      }
      return unavailable('invocation-source', `${commitAttempts} revision conflicts in a row`)
    },
  }

  const directGuard: ToolSourceGuard<P> = {
    verify: async ({ principal, tenant, call, operation, request }) => {
      const digests = digestsOf(request)
      if (digests === null) return { kind: 'forged', reason: 'request-not-canonical' }
      if (!isTenantShape(tenant)) return { kind: 'forged', reason: 'tenant-shape' }
      const read = await readDomain(tenant)
      if (typeof read === 'string') return { kind: 'unavailable', diagnostic: read }
      const binding = bindingOf(read, digests.key, tenant)
      if (binding === null) return { kind: 'forged', reason: 'unknown-source' }
      if (binding === 'unreadable')
        return { kind: 'unavailable', diagnostic: 'the stored binding cannot be read' }
      if (!bindsTo(binding, call, operation, digests.fixed))
        return { kind: 'forged', reason: 'binding-mismatch' }
      const same = await sameSubject(principal, binding)
      const verdict = subjectVerdict(same)
      if (verdict.kind === 'trusted') observeOrigin?.({ call, admission: operation, request })
      return verdict
    },
  }

  const forwards = createInvocationForwarding(
    input,
    directGuard,
    invocationSourceIdentities,
    observe,
  )
  const receiver = createForwardingReceiver(input, forwards)
  const guard: ToolSourceGuard<P> = {
    async verify(access) {
      if (access.request.consumer.owner !== TOOL_FORWARDING_OWNER) return directGuard.verify(access)
      try {
        const answer = await forwards.recoverBinding({ ...access, admission: access.operation })
        return 'ok' in answer
          ? { kind: 'trusted' }
          : answer.failure.kind === 'denied'
            ? { kind: 'forged', reason: 'forwarding-binding-mismatch' }
            : { kind: 'unavailable', diagnostic: 'The forwarding source cannot be verified.' }
      } catch {
        return { kind: 'unavailable', diagnostic: 'The forwarding source cannot be verified.' }
      }
    },
  }
  const recoverBinding: LocalInvocationSource<P, B>['recoverBinding'] = async access => {
    const unavailable = () =>
      fail({
        kind: 'unavailable' as const,
        dependency: 'invocation-source',
        diagnostic: 'The original source binding cannot be verified.',
      })
    try {
      if (!isTenantShape(access.tenant)) return unavailable()
      const read = await readDomain(access.tenant)
      if (typeof read === 'string') return unavailable()
      const row = read.records.find(
        row => row.kind === 'host' && row.host.key === consumerKey(access.request.consumer),
      )
      if (
        row?.kind !== 'host' ||
        !isRecord(row.host.value) ||
        !isPrincipalJson(row.host.value.principal)
      )
        return unavailable()
      const encoded = row.host.value.principal
      if (decodePrincipal(encoded) === null) return unavailable()
      if (access.request.consumer.owner === TOOL_FORWARDING_OWNER) {
        const stored = parseForward(row.host.value)
        if (
          stored === null ||
          stored.call !== access.call ||
          stored.admission !== access.admission ||
          canonicalDigest(stored.request) !== canonicalDigest(access.request)
        )
          return unavailable()
        return succeed({ principal: encoded })
      }
      const stored = parseBinding(row.host.value)
      if (
        stored === null ||
        !bindsTo(stored, access.call, access.admission, canonicalDigest(access.request))
      )
        return unavailable()
      const { invocation, ...request } = access.request
      const source = {
        owner: INVOCATION_SOURCE_OWNER,
        record: `invocation-source:${access.call}`,
        revision: '1',
        digest: canonicalDigest({
          tenant: tenantText(access.tenant),
          call: access.call,
          admission: access.admission,
          requestDigest: canonicalDigest(request),
        }),
      }
      if (
        invocation.kind !== 'direct' ||
        stored.requestDigest !== canonicalDigest(request) ||
        canonicalDigest(source) !== canonicalDigest(invocation.source)
      )
        return unavailable()
      return succeed({ principal: encoded })
    } catch {
      return unavailable()
    }
  }
  return Object.freeze({ issuer, guard, forwarding: forwards.source, receiver, recoverBinding })
}

/**
 * Mints the identity of every operation that the runtime creates for an admitted call. A mint is
 * a fresh UUID, so it never returns a value twice, also not after a restart. It reads no store and
 * does not tell tenants apart: a command is told apart by the ledger, by its operation.
 */
export function createLocalOperationIdentities(): ToolOperationIdentities {
  return Object.freeze({
    newOperation: () =>
      Promise.resolve(succeed(identity(decodeToolOperationId(`op-${randomUUID()}`), 'operation'))),
  })
}
